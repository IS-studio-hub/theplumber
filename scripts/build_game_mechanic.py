"""
Build game-ready Mechanic with SEPARATE parts from welded Meshy mesh.

Splits by albedo + height (Skin / Clothes / Hat), decimates to game budgets,
builds animation armature, assigns spatial weights (no ARMATURE_AUTO).

Outputs:
  friendly_mechanic_game.blend
  website/public/assets/ava/character/ava_game.glb
"""
from __future__ import annotations

import json
import math
import time
from collections import defaultdict, deque
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

SRC = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/friendly_mechanic_rig.blend"
)
DST_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/friendly_mechanic_game.blend"
)
DST_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/website"
    "/public/assets/ava/character/ava_game.glb"
)
PREVIEW = Path("/tmp/ava_eye_work/mechanic_game_preview.png")
LOG = Path("/tmp/ava_eye_work/mechanic_game_build.log")

BUDGETS = {"Body": 16000, "Clothes": 14000, "Hat": 3000}


def log(msg: str) -> None:
    print(msg, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def world_pts(obj):
    me = obj.data
    n = len(me.vertices)
    local = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", local)
    local = local.reshape(n, 3)
    mw = np.array(obj.matrix_world, dtype=np.float64)
    homo = np.ones((n, 4), dtype=np.float64)
    homo[:, :3] = local
    return (homo @ mw.T)[:, :3]


def vertex_albedo(obj):
    mat = obj.material_slots[0].material
    img = next(n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image)
    w, h = img.size
    pixels = list(img.pixels)
    uv = obj.data.uv_layers.active
    n = len(obj.data.vertices)
    acc = np.zeros(n)
    cnt = np.zeros(n)

    def sample(u, v):
        x = int((u % 1.0) * (w - 1))
        y = int((v % 1.0) * (h - 1))
        i = (y * w + x) * 4
        return (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3.0

    for p in obj.data.polygons:
        brs = [sample(uv.data[li].uv.x, uv.data[li].uv.y) for li in p.loop_indices]
        br = sum(brs) / len(brs)
        for vi in p.vertices:
            acc[vi] += br
            cnt[vi] += 1
    return acc / np.maximum(cnt, 1.0)


def label_vertices(obj, pts, bright):
    """Return int label per vertex: 0=Body(skin), 1=Clothes, 2=Hat."""
    z = pts[:, 2]
    labels = np.zeros(len(pts), dtype=np.int32)
    # Default clothes if dark, body if light
    labels[bright >= 0.30] = 0  # skin/body
    labels[bright < 0.30] = 1  # clothes
    # Hat: dark + high
    labels[(bright < 0.35) & (z > 1.52)] = 2
    # Force face/neck skin even if shadowed
    labels[(z > 1.25) & (bright > 0.22) & (z < 1.55)] = 0
    # Beard often dark but should stay with body
    labels[(z > 1.15) & (z < 1.45) & (pts[:, 1] < -0.15) & (bright > 0.08) & (bright < 0.35)] = 0
    return labels


def smooth_labels(obj, labels, iters=4):
    """Majority filter over mesh adjacency so regions are coherent."""
    me = obj.data
    adj = [[] for _ in range(len(me.vertices))]
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    lab = labels.copy()
    for _ in range(iters):
        nxt = lab.copy()
        for i, nbrs in enumerate(adj):
            if not nbrs:
                continue
            votes = [lab[i]] + [lab[j] for j in nbrs]
            # majority
            nxt[i] = max(set(votes), key=votes.count)
        lab = nxt
    return lab


def separate_by_labels(src, labels, collection):
    """Create Body/Clothes/Hat objects by deleting other verts."""
    names = {0: "Body", 1: "Clothes", 2: "Hat"}
    out = {}
    for lid, name in names.items():
        idxs = np.where(labels == lid)[0]
        if len(idxs) < 100:
            log(f"skip {name}: only {len(idxs)} verts")
            continue
        dup = src.copy()
        dup.data = src.data.copy()
        dup.name = name
        dup.data.name = name + "_Mesh"
        collection.objects.link(dup)
        bm = bmesh.new()
        bm.from_mesh(dup.data)
        bm.verts.ensure_lookup_table()
        keep = set(int(i) for i in idxs)
        to_del = [v for v in bm.verts if v.index not in keep]
        bmesh.ops.delete(bm, geom=to_del, context="VERTS")
        bm.to_mesh(dup.data)
        bm.free()
        dup.data.update()
        out[name] = dup
        log(f"{name}: verts={len(dup.data.vertices)} faces={len(dup.data.polygons)}")
    return out


def decimate(obj, budget):
    faces = len(obj.data.polygons)
    if faces <= budget:
        log(f"  keep {obj.name} {faces}")
        return
    ratio = max(0.015, min(0.95, budget / faces))
    mod = obj.modifiers.new("Decimate", type="DECIMATE")
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Limited dissolve for cleaner game mesh
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.dissolve_limited(angle_limit=math.radians(3.0))
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"  {obj.name}: {faces} -> {len(obj.data.polygons)} (ratio={ratio:.3f})")


def build_armature(collection):
    data = bpy.data.armatures.new("GameRigData")
    arm = bpy.data.objects.new("GameRig", data)
    collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones

    def add(name, head, tail, parent=None):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
        return b

    add("root", (0, -0.05, 0.0), (0, -0.05, 0.08))
    add("hips", (0, -0.08, 0.82), (0, -0.08, 0.95), "root")
    add("spine", (0, -0.09, 0.95), (0, -0.10, 1.16), "hips")
    add("chest", (0, -0.10, 1.16), (0, -0.10, 1.38), "spine")
    add("neck_01", (0, -0.09, 1.38), (0, -0.06, 1.52), "chest")
    add("head", (0, -0.05, 1.52), (0, -0.02, 1.78), "neck_01")
    add("clavicle_L", (0.04, -0.09, 1.36), (0.15, -0.07, 1.34), "chest")
    add("clavicle_R", (-0.04, -0.09, 1.36), (-0.15, -0.07, 1.34), "chest")
    add("upperarm_L", (0.15, -0.07, 1.34), (0.40, -0.05, 1.10), "clavicle_L")
    add("upperarm_R", (-0.15, -0.07, 1.34), (-0.40, -0.05, 1.10), "clavicle_R")
    add("forearm_L", (0.40, -0.05, 1.10), (0.50, 0.0, 0.88), "upperarm_L")
    add("forearm_R", (-0.40, -0.05, 1.10), (-0.50, 0.0, 0.88), "upperarm_R")
    bpy.ops.object.mode_set(mode="OBJECT")
    data.display_type = "OCTAHEDRAL"
    arm.show_in_front = True
    return arm


def assign_weights(obj, kind: str):
    pts = world_pts(obj)
    n = len(pts)
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    r = np.sqrt(x * x + (y + 0.08) ** 2)

    bones = [
        "root",
        "hips",
        "spine",
        "chest",
        "neck_01",
        "head",
        "clavicle_L",
        "clavicle_R",
        "upperarm_L",
        "upperarm_R",
        "forearm_L",
        "forearm_R",
    ]
    for vg in list(obj.vertex_groups):
        obj.vertex_groups.remove(vg)

    def ss(t):
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)

    w = {b: np.zeros(n) for b in bones}

    if kind == "Hat":
        w["head"][:] = 1.0
    else:
        w["hips"] = 1.0 - ss((z - 0.78) / 0.14)
        w["spine"] = ss((z - 0.85) / 0.16) * (1 - ss((z - 1.12) / 0.12))
        w["chest"] = ss((z - 1.05) / 0.16) * (1 - ss((z - 1.40) / 0.12))
        w["neck_01"] = ss((z - 1.30) / 0.16) * (1 - ss((z - 1.56) / 0.10))
        w["head"] = ss((z - 1.50) / 0.10)
        side_L = x > 0.10
        side_R = x < -0.10
        arm_zone = (z < 1.40) & (z > 0.78) & (r > 0.17) & (np.abs(x) > 0.09)
        w["clavicle_L"][side_L & (z > 1.28) & (z < 1.42)] = 0.65
        w["clavicle_R"][side_R & (z > 1.28) & (z < 1.42)] = 0.65
        w["upperarm_L"][arm_zone & side_L & (z > 1.02)] = 0.9
        w["upperarm_R"][arm_zone & side_R & (z > 1.02)] = 0.9
        w["forearm_L"][arm_zone & side_L & (z <= 1.02)] = 0.95
        w["forearm_R"][arm_zone & side_R & (z <= 1.02)] = 0.95
        # Clothes: less head, more chest/neck blend at collar
        if kind == "Clothes":
            w["head"] *= 0.15
            w["neck_01"] = np.maximum(w["neck_01"], ss((z - 1.28) / 0.14) * 0.55)

    stack = np.stack([w[b] for b in bones], axis=1)
    tot = np.maximum(stack.sum(axis=1, keepdims=True), 1e-6)
    stack /= tot

    for i, b in enumerate(bones):
        vg = obj.vertex_groups.new(name=b)
        buckets = defaultdict(list)
        for vi, wt in enumerate(stack[:, i]):
            if wt > 1e-4:
                buckets[round(float(wt), 3)].append(int(vi))
        for wt, ids in buckets.items():
            vg.add(ids, float(wt), "REPLACE")


def bind(obj, arm):
    obj.parent = arm
    obj.parent_type = "OBJECT"
    for m in list(obj.modifiers):
        if m.type == "ARMATURE":
            obj.modifiers.remove(m)
    mod = obj.modifiers.new("Armature", type="ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    mod.use_deform_preserve_volume = True


def steal_eyes_early():
    """Duplicate AvaEye_* from the open source scene before we tear it down."""
    eyes = []
    for name in ("AvaEye_L", "AvaEye_R"):
        src = bpy.data.objects.get(name)
        if not src:
            continue
        dup = src.copy()
        dup.data = src.data.copy()
        dup.name = name + "_Game"
        # Clear parenting/mods; rebind later
        dup.parent = None
        for m in list(dup.modifiers):
            dup.modifiers.remove(m)
        eyes.append(dup)
        log(f"stole eye {dup.name} faces={len(dup.data.polygons)}")
    return eyes


def bind_eyes(eyes, collection, arm):
    out = []
    for ob in eyes:
        collection.objects.link(ob)
        for vg in list(ob.vertex_groups):
            ob.vertex_groups.remove(vg)
        vg = ob.vertex_groups.new(name="head")
        vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        mod = ob.modifiers.new("Armature", type="ARMATURE")
        mod.object = arm
        ob.parent = arm
        ob.parent_type = "OBJECT"
        out.append(ob)
        log(f"bound eye {ob.name}")
    return out


def make_fallback_eyes(collection, arm):
    """If source had no eyes, create simple DogEye spheres."""
    tex_path = Path("/tmp/ava_eye_work/DogEyeTexture.png")
    mat = bpy.data.materials.new("DogEyeGame")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex = nt.nodes.new("ShaderNodeTexImage")
    if tex_path.exists():
        tex.image = bpy.data.images.load(str(tex_path))
    bsdf.inputs["Roughness"].default_value = 0.15
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    eyes = []
    for side, loc in (("L", (-0.075, -0.35, 1.48)), ("R", (0.11, -0.35, 1.48))):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.026, location=loc)
        ob = bpy.context.active_object
        ob.name = f"AvaEye_{side}_Game"
        ob.data.materials.append(mat)
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        collection.objects.link(ob)
        vg = ob.vertex_groups.new(name="head")
        vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
        mod = ob.modifiers.new("Armature", type="ARMATURE")
        mod.object = arm
        ob.parent = arm
        eyes.append(ob)
    return eyes


def preview(arm):
    scene = bpy.context.scene
    if not scene.world:
        scene.world = bpy.data.worlds.new("World")
    scene.world.use_nodes = True
    next(n for n in scene.world.node_tree.nodes if n.type == "BACKGROUND").inputs[0].default_value = (
        0.8,
        0.9,
        0.78,
        1,
    )
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 900
    cam = bpy.data.objects.new("GameCam", bpy.data.cameras.new("GameCam"))
    scene.collection.objects.link(cam)
    cam.location = (0.5, -1.55, 1.15)
    cam.rotation_euler = (1.28, 0, 0.3)
    cam.data.lens = 70
    scene.camera = cam
    light = bpy.data.lights.new("GameKey", "AREA")
    light.energy = 110
    lob = bpy.data.objects.new("GameKey", light)
    scene.collection.objects.link(lob)
    lob.location = (0.4, -1.1, 1.9)

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
    arm.pose.bones["chest"].rotation_euler = (0.05, -0.12, 0.04)
    arm.pose.bones["neck_01"].rotation_euler = (0.18, -0.4, 0.1)
    arm.pose.bones["upperarm_L"].rotation_euler = (0.1, 0, 0.25)
    arm.pose.bones["upperarm_R"].rotation_euler = (0.1, 0, -0.25)
    bpy.ops.object.mode_set(mode="OBJECT")
    scene.render.filepath = str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    log(f"preview {PREVIEW}")
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.object.mode_set(mode="OBJECT")


def export(arm, parts, eyes):
    keep = {arm, *parts, *eyes}
    for o in bpy.data.objects:
        try:
            o.hide_set(o not in keep)
        except Exception:
            pass
        o.hide_render = o not in keep
        o.select_set(o in keep)
    bpy.context.view_layer.objects.active = arm
    DST_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(DST_GLB),
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
    DST_GLB.with_name("ava_game_version.json").write_text(
        json.dumps({"v": stamp, "reason": "game-ready-v2", "t": time.strftime("%Y-%m-%d %H:%M:%S")}) + "\n"
    )
    log(f"exported {DST_GLB} v={stamp}")


def main():
    LOG.write_text("", encoding="utf-8")
    log("=== game mechanic v2 ===")
    bpy.ops.wm.open_mainfile(filepath=str(SRC))
    # Capture eyes before we mutate the scene
    stolen_eyes = steal_eyes_early()
    src = bpy.data.objects["Mechanic"]

    # New collection; duplicate source mesh into it
    col = bpy.data.collections.new("GameCharacter")
    bpy.context.scene.collection.children.link(col)
    bpy.ops.object.select_all(action="DESELECT")
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    bpy.ops.object.duplicate()
    work = bpy.context.active_object
    work.name = "MechanicSource"
    for c in list(work.users_collection):
        c.objects.unlink(work)
    col.objects.link(work)

    # Hide clutter
    for o in list(bpy.data.objects):
        if o == work or o in stolen_eyes:
            continue
        if o.name.startswith("AvaEye_") or o.name in (
            "Mechanic",
            "MechanicRig",
            "PreviewCam",
            "EyeCam",
            "EyeKey",
        ):
            try:
                o.hide_set(True)
            except Exception:
                pass

    pts = world_pts(work)
    bright = vertex_albedo(work)
    log(f"source verts={len(pts)} bright=[{bright.min():.2f},{bright.max():.2f}]")
    labels = label_vertices(work, pts, bright)
    labels = smooth_labels(work, labels, iters=5)
    for lid, name in enumerate(("Body", "Clothes", "Hat")):
        log(f"  label {name}: {(labels == lid).sum()} verts")

    parts_map = separate_by_labels(work, labels, col)
    bpy.data.objects.remove(work, do_unlink=True)

    log("decimate:")
    for name, ob in parts_map.items():
        # Clear leftover armature mods before decimate apply
        for m in list(ob.modifiers):
            ob.modifiers.remove(m)
        decimate(ob, BUDGETS.get(name, 3000))

    arm = build_armature(col)
    log("bones " + ", ".join(b.name for b in arm.data.bones))

    parts = []
    for name, ob in parts_map.items():
        assign_weights(ob, name)
        bind(ob, arm)
        parts.append(ob)
        log(f"bound {name} faces={len(ob.data.polygons)} vgroups={len(ob.vertex_groups)}")

    if stolen_eyes:
        eyes = bind_eyes(stolen_eyes, col, arm)
    else:
        eyes = make_fallback_eyes(col, arm)
    total = sum(len(p.data.polygons) for p in parts)
    log(f"TOTAL faces={total} parts={len(parts)} eyes={len(eyes)}")

    preview(arm)
    export(arm, parts, eyes)
    bpy.ops.wm.save_as_mainfile(filepath=str(DST_BLEND))
    log(f"saved {DST_BLEND}")
    log("done")


if __name__ == "__main__":
    main()
