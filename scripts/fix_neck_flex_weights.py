"""Widen neck/chest blend + spatially match weights across collar gap."""
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
SITE_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/website"
    "/public/assets/ava/character/ava.glb"
)
PREVIEW = Path("/tmp/ava_eye_work/neck_flex_test4.png")


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    mesh = bpy.data.objects["Mechanic"]
    arm = bpy.data.objects["MechanicRig"]

    mw = np.array(mesh.matrix_world, dtype=np.float64)
    n = len(mesh.data.vertices)
    local = np.empty(n * 3, dtype=np.float64)
    mesh.data.vertices.foreach_get("co", local)
    local = local.reshape(n, 3)
    homo = np.ones((n, 4), dtype=np.float64)
    homo[:, :3] = local
    pts = (homo @ mw.T)[:, :3]
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]

    z_collar = float((arm.matrix_world @ arm.data.bones["chest"].tail_local).z)
    # If neck pivot was already raised, chest.tail is still original collar landmark
    z_lo = z_collar - 0.14
    z_hi = z_collar + 0.28
    z_face = z_collar + 0.42

    def smoothstep(t):
        t = np.clip(t, 0.0, 1.0)
        return t * t * (3.0 - 2.0 * t)

    r = np.sqrt(x * x + (y + 0.107) ** 2)
    t = smoothstep((z - z_lo) / max(1e-6, z_hi - z_lo))
    t = smoothstep(t)
    shoulder = smoothstep((r - 0.09) / 0.16)
    near_collar = np.clip(1.0 - np.abs(z - z_collar) / 0.14, 0.0, 1.0)
    neck_w = t * (1.0 - 0.70 * shoulder * near_collar)
    neck_w = np.maximum(neck_w, smoothstep((z - (z_face - 0.06)) / 0.06))

    # Collar clothing boost (dark faces near collar)
    mat = mesh.material_slots[0].material
    img = next(
        nd.image
        for nd in mat.node_tree.nodes
        if nd.type == "TEX_IMAGE" and nd.image and nd.image.name.startswith("Image_0")
    )
    tw, th = img.size
    pixels = list(img.pixels)
    uv = mesh.data.uv_layers.active
    collar_vert = np.zeros(n, dtype=bool)

    def face_bright(fi):
        p = mesh.data.polygons[fi]
        acc = 0.0
        cnt = 0
        for li in p.loop_indices:
            uu = uv.data[li].uv
            xi = int((uu.x % 1.0) * (tw - 1))
            yi = int((uu.y % 1.0) * (th - 1))
            i = (yi * tw + xi) * 4
            acc += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3.0
            cnt += 1
        return acc / max(cnt, 1)

    for p in mesh.data.polygons:
        cz = float((mesh.matrix_world @ p.center).z)
        if not (0.88 < cz < 1.08):
            continue
        if face_bright(p.index) > 0.35:
            continue
        for vi in p.vertices:
            collar_vert[vi] = True

    for i in np.where(collar_vert)[0]:
        tt = float(np.clip((z[i] - 0.90) / 0.12, 0, 1))
        neck_w[i] = max(neck_w[i], 0.28 + 0.40 * tt)

    # Spatial smooth across collar gap (match both sides of tear)
    band = (z > 0.88) & (z < 1.22)
    idxs = np.where(band)[0]
    P = pts[idxs]
    W = neck_w[idxs].copy()
    cell = 0.012
    grid = defaultdict(list)

    def key(p):
        return (int(np.floor(p[0] / cell)), int(np.floor(p[1] / cell)), int(np.floor(p[2] / cell)))

    for li in range(len(idxs)):
        grid[key(P[li])].append(li)

    r2 = 0.018 ** 2
    for _ in range(8):
        W2 = W.copy()
        for li in range(len(idxs)):
            p = P[li]
            kx, ky, kz = key(p)
            acc = cnt = 0.0
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for dz in (-1, 0, 1):
                        for lj in grid.get((kx + dx, ky + dy, kz + dz), ()):
                            d2 = float(np.sum((P[lj] - p) ** 2))
                            if d2 > r2:
                                continue
                            wgt = 1.0 / (1e-6 + d2)
                            acc += W[lj] * wgt
                            cnt += wgt
            if cnt > 0:
                W2[li] = 0.3 * W[li] + 0.7 * (acc / cnt)
        W = W2
    neck_w[idxs] = W

    neck_w[z >= z_face] = 1.0
    neck_w[z <= z_lo] = 0.0
    chest_w = 1.0 - neck_w

    def replace_group(name, arr):
        if name in mesh.vertex_groups:
            mesh.vertex_groups.remove(mesh.vertex_groups[name])
        vg = mesh.vertex_groups.new(name=name)
        buckets = defaultdict(list)
        for i, w in enumerate(arr):
            if w > 1e-4:
                buckets[round(float(w), 3)].append(int(i))
        for w, ids in buckets.items():
            vg.add(ids, float(w), "REPLACE")

    for name in list(mesh.vertex_groups.keys()):
        if name in ("chest", "neck_01", "head", "root", "neck_smooth"):
            mesh.vertex_groups.remove(mesh.vertex_groups[name])

    replace_group("chest", chest_w)
    replace_group("neck_01", neck_w)
    replace_group("head", np.zeros(n))
    mesh.vertex_groups.new(name="root")

    # Corrective smooth for Blender preview (won't export to GLB)
    for m in list(mesh.modifiers):
        if m.type == "CORRECTIVE_SMOOTH" or m.name.startswith("NeckSmooth"):
            mesh.modifiers.remove(m)
    smooth_w = np.clip(1.0 - np.abs(neck_w - 0.5) * 2.0, 0.0, 1.0)
    smooth_w = np.maximum(smooth_w, collar_vert.astype(np.float64) * 0.85)
    smooth_w[z >= z_face] = 0.0
    smooth_w[z <= z_lo] = 0.0
    replace_group("neck_smooth", smooth_w)
    sm = mesh.modifiers.new(name="NeckSmooth", type="CORRECTIVE_SMOOTH")
    sm.factor = 0.55
    sm.iterations = 6
    sm.smooth_type = "LENGTH_WEIGHTED"
    sm.rest_source = "ORCO"
    sm.vertex_group = "neck_smooth"

    for mod in mesh.modifiers:
        if mod.type == "ARMATURE":
            mod.use_deform_preserve_volume = True
            mod.object = arm

    print(
        "blend",
        int(((neck_w > 0.15) & (neck_w < 0.85)).sum()),
        "collar_avg_neck",
        float(neck_w[collar_vert].mean()) if collar_vert.any() else -1,
    )

    # Pose preview
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
    arm.pose.bones["chest"].rotation_euler = (0.03, -0.08, 0.02)
    arm.pose.bones["neck_01"].rotation_euler = (0.18, -0.45, 0.10)
    bpy.ops.object.mode_set(mode="OBJECT")

    scene = bpy.context.scene
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (
        0.78,
        0.88,
        0.75,
        1,
    )
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 900
    cam = bpy.data.objects.get("PreviewCam")
    if not cam:
        cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
        scene.collection.objects.link(cam)
    cam.location = (0.25, -0.95, 1.15)
    cam.rotation_euler = (1.4, 0, 0.15)
    cam.data.lens = 90
    scene.camera = cam
    scene.render.filepath = str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)

    # Rest + save + export
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.object.mode_set(mode="OBJECT")

    # Export GLB (weights only — corrective smooth not in glTF)
    eyes = [o for o in bpy.data.objects if o.name.startswith("AvaEye_")]
    keep = {arm, mesh, *eyes}
    for obj in bpy.data.objects:
        try:
            obj.hide_set(obj not in keep)
        except Exception:
            pass
        obj.hide_render = obj not in keep
        obj.select_set(obj in keep)
    bpy.context.view_layer.objects.active = arm
    # Disable corrective smooth for export consistency with site
    for m in mesh.modifiers:
        if m.type == "CORRECTIVE_SMOOTH":
            m.show_render = False
            m.show_viewport = True
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
        json.dumps({"v": stamp, "reason": "neck-flex-weights", "t": time.strftime("%Y-%m-%d %H:%M:%S")})
        + "\n"
    )
    # re-enable smooth in blend
    for m in mesh.modifiers:
        if m.type == "CORRECTIVE_SMOOTH":
            m.show_render = True

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print("saved", BLEND, "glb v", stamp)


if __name__ == "__main__":
    main()
