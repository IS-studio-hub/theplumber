"""Rebuild neck weights on restored mesh — face 100% head, no geo smooth.

Site locks head local and only bends neck_01. Face verts must not mix
head+neck_01 (different pivots → cheek tear).
"""
from __future__ import annotations

import json
import time
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/friendly_mechanic_rig.blend"
)
EYES = Path("/tmp/ava_eye_work/eyes_preserve.blend")
SITE_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/website"
    "/public/assets/ava/character/ava.glb"
)
PREVIEW_DIR = Path("/tmp/ava_eye_work")


def smoothstep(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def world_pts(mesh):
    n = len(mesh.data.vertices)
    local = np.empty(n * 3, dtype=np.float64)
    mesh.data.vertices.foreach_get("co", local)
    local = local.reshape(n, 3)
    mw = np.array(mesh.matrix_world, dtype=np.float64)
    homo = np.ones((n, 4), dtype=np.float64)
    homo[:, :3] = local
    return (homo @ mw.T)[:, :3]


def bone_world_z(arm, name, use_tail=False):
    b = arm.data.bones[name]
    p = b.tail_local if use_tail else b.head_local
    return float((arm.matrix_world @ p).z)


def replace_group(mesh, name, arr):
    if name in mesh.vertex_groups:
        mesh.vertex_groups.remove(mesh.vertex_groups[name])
    vg = mesh.vertex_groups.new(name=name)
    # Quantize to 50 levels to keep assignment fast on ~500k verts
    q = np.clip(np.round(arr * 50.0) / 50.0, 0.0, 1.0)
    buckets = defaultdict(list)
    for i, w in enumerate(q):
        if w > 1e-4:
            buckets[float(w)].append(int(i))
    for w, ids in buckets.items():
        # chunk to avoid huge python lists in one call
        step = 20000
        for s in range(0, len(ids), step):
            vg.add(ids[s : s + step], w, "REPLACE")


def append_eyes(arm):
    with bpy.data.libraries.load(str(EYES), link=False) as (data_from, data_to):
        data_to.objects = [n for n in data_from.objects if n.startswith("AvaEye_")]
    eyes = []
    head = arm.pose.bones["head"]
    head_mw = arm.matrix_world @ head.matrix
    for o in data_to.objects:
        if o is None:
            continue
        if o.name not in bpy.context.scene.collection.objects:
            bpy.context.scene.collection.objects.link(o)
        mw = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = "BONE"
        o.parent_bone = "head"
        o.matrix_parent_inverse = head_mw.inverted()
        o.matrix_world = mw
        eyes.append(o)
    print("eyes", [o.name for o in eyes], flush=True)
    return eyes


def paint_weights(mesh, arm):
    t0 = time.time()
    pts = world_pts(mesh)
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]

    z_collar = bone_world_z(arm, "chest", use_tail=True)
    z_jaw = bone_world_z(arm, "neck_01", use_tail=True)
    z_chest_end = z_collar - 0.07
    z_neck_end = z_jaw - 0.015
    z_face_start = z_jaw + 0.015

    print(
        "landmarks",
        {
            "collar": round(z_collar, 4),
            "jaw": round(z_jaw, 4),
            "chest_end": round(z_chest_end, 4),
            "face_start": round(z_face_start, 4),
        },
        flush=True,
    )

    # Shoulders stay on chest near collar
    r = np.sqrt(x * x + (y + 0.05) ** 2)
    shoulder = smoothstep((r - 0.10) / 0.14)
    near_collar = np.clip(1.0 - np.abs(z - z_collar) / 0.12, 0.0, 1.0)

    # Neck column rise
    t_neck = smoothstep((z - z_chest_end) / max(1e-6, (z_neck_end - z_chest_end)))
    neck_col = t_neck * (1.0 - 0.88 * shoulder * near_collar)

    # Head: hard lock on face (site locks head local)
    t_head = smoothstep((z - z_neck_end) / max(1e-6, (z_face_start - z_neck_end)))
    t_head = np.where(z >= z_face_start, 1.0, t_head)
    t_head = np.where(z <= z_neck_end, 0.0, t_head)

    head_w = t_head
    remain = 1.0 - head_w
    neck_w = remain * neck_col
    chest_w = remain * (1.0 - neck_col)

    head_w[z >= z_face_start] = 1.0
    neck_w[z >= z_face_start] = 0.0
    chest_w[z >= z_face_start] = 0.0
    head_w[z <= z_chest_end] = 0.0
    neck_w[z <= z_chest_end] = 0.0
    chest_w[z <= z_chest_end] = 1.0

    s = np.maximum(head_w + neck_w + chest_w, 1e-8)
    head_w, neck_w, chest_w = head_w / s, neck_w / s, chest_w / s

    for name in list(mesh.vertex_groups.keys()):
        mesh.vertex_groups.remove(mesh.vertex_groups[name])
    replace_group(mesh, "chest", chest_w)
    replace_group(mesh, "neck_01", neck_w)
    replace_group(mesh, "head", head_w)
    mesh.vertex_groups.new(name="root")

    face = z >= z_face_start
    face_mix = int((face & ((neck_w > 0.01) | (chest_w > 0.01))).sum())
    print(
        "weights",
        "secs",
        round(time.time() - t0, 2),
        "face_verts",
        int(face.sum()),
        "face_mixed",
        face_mix,
        "neck_blend",
        int(((neck_w > 0.15) & (neck_w < 0.85)).sum()),
        flush=True,
    )


def clear_pose(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)
    bpy.ops.object.mode_set(mode="OBJECT")


def set_pose_look(arm, yaw=-0.55, pitch=0.10):
    clear_pose(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    n1 = arm.pose.bones["neck_01"]
    n1.rotation_mode = "XYZ"
    n1.rotation_euler = (pitch, yaw, 0.04)
    bpy.ops.object.mode_set(mode="OBJECT")


def setup_preview(scene):
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (
        0.78,
        0.88,
        0.75,
        1,
    )
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = 800
    cam = bpy.data.objects.get("PreviewCam")
    if not cam:
        cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
        scene.collection.objects.link(cam)
    cam.location = (0.22, -0.92, 1.28)
    cam.rotation_euler = (1.38, 0, 0.12)
    cam.data.lens = 85
    scene.camera = cam


def export_glb(arm, mesh, eyes):
    keep = {arm, mesh, *eyes}
    for obj in bpy.data.objects:
        try:
            obj.hide_set(obj not in keep)
        except Exception:
            pass
        obj.hide_render = obj not in keep
        obj.select_set(obj in keep)
    bpy.context.view_layer.objects.active = arm
    for m in list(mesh.modifiers):
        if m.type in ("CORRECTIVE_SMOOTH", "SMOOTH", "LAPLACIANSMOOTH"):
            mesh.modifiers.remove(m)
    for m in mesh.modifiers:
        if m.type == "ARMATURE":
            m.use_deform_preserve_volume = True
            m.object = arm
    print("export start", flush=True)
    bpy.ops.export_scene.gltf(
        filepath=str(SITE_GLB),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_image_format="AUTO",
    )
    stamp = int(time.time() * 1000)
    SITE_GLB.with_name("version.json").write_text(
        json.dumps(
            {"v": stamp, "reason": "neck-rebuild-clean", "t": time.strftime("%Y-%m-%d %H:%M:%S")}
        )
        + "\n"
    )
    print("glb", stamp, flush=True)


def main():
    print("open", BLEND, flush=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    mesh = bpy.data.objects["Mechanic"]
    arm = bpy.data.objects["MechanicRig"]
    print("verts", len(mesh.data.vertices), flush=True)

    for o in list(bpy.data.objects):
        if o.name.startswith("AvaEye_") or o.name.startswith("Collar"):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(mesh.modifiers):
        if m.type in ("CORRECTIVE_SMOOTH", "SMOOTH", "LAPLACIANSMOOTH") or m.name.startswith("Neck"):
            mesh.modifiers.remove(m)

    # Deform must be on — otherwise vertex groups are ignored and pose does nothing
    for name in ("chest", "neck_01", "head"):
        if name in arm.data.bones:
            arm.data.bones[name].use_deform = True

    paint_weights(mesh, arm)
    eyes = append_eyes(arm)

    scene = bpy.context.scene
    setup_preview(scene)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    clear_pose(arm)
    scene.render.filepath = str(PREVIEW_DIR / "neck_rebuild_rest.png")
    bpy.ops.render.render(write_still=True)
    print("preview rest", flush=True)

    set_pose_look(arm, yaw=-0.55, pitch=0.10)
    scene.render.filepath = str(PREVIEW_DIR / "neck_rebuild_look.png")
    bpy.ops.render.render(write_still=True)
    print("preview look", flush=True)

    set_pose_look(arm, yaw=-0.85, pitch=0.05)
    scene.render.filepath = str(PREVIEW_DIR / "neck_rebuild_extreme.png")
    bpy.ops.render.render(write_still=True)
    print("preview extreme", flush=True)

    clear_pose(arm)
    export_glb(arm, mesh, eyes)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("saved", BLEND, flush=True)


if __name__ == "__main__":
    main()
