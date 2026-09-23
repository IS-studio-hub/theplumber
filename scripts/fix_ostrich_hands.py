"""
Replace Melty Meshy hands with clean fingered hands + smoother wrist blend.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector, Euler

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb"
)
TMP = Path("/tmp/lisa-character/ostrich_hands_fixed.blend")
PREVIEW = Path("/tmp/lisa-character/hands_preview.png")

SKIN = (0.86, 0.68, 0.58, 1.0)  # peach skin matching character


def select_only(obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def skin_material():
    name = "HandSkin"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = SKIN
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.3
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.15
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.12
        if "Subsurface Radius" in bsdf.inputs:
            bsdf.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
    return mat


def build_hand_mesh(name: str, mirror: bool = False) -> bpy.types.Object:
    """
    Build a simple anatomical hand in local space:
    - palm along +X (outward), palm faces -Y (toward camera in T-pose)
    - fingers along +X
    """
    bm = bmesh.new()

    def add_ellipsoid(center, radii, segs=12):
        mesh = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs, radius=1.0)
        verts = mesh["verts"]
        for v in verts:
            v.co.x = v.co.x * radii[0] + center[0]
            v.co.y = v.co.y * radii[1] + center[1]
            v.co.z = v.co.z * radii[2] + center[2]
        return verts

    # Palm
    add_ellipsoid((0.045, 0.0, 0.0), (0.045, 0.028, 0.038), segs=14)
    # Wrist stub (blends into sleeve)
    add_ellipsoid((-0.01, 0.0, 0.0), (0.022, 0.024, 0.028), segs=12)

    # Fingers: index..pinky (x, z offsets)
    finger_defs = [
        # (base_x, base_z, length, thick, bend)
        (0.085, 0.028, 0.055, 0.009, 8),   # index
        (0.09, 0.008, 0.06, 0.01, 5),      # middle
        (0.088, -0.012, 0.055, 0.009, 6),  # ring
        (0.08, -0.03, 0.045, 0.008, 10),   # pinky
    ]
    for bx, bz, length, thick, bend in finger_defs:
        # 3 phalanges
        for i, (t0, t1) in enumerate([(0.0, 0.35), (0.32, 0.68), (0.65, 1.0)]):
            cx = bx + length * (t0 + t1) * 0.5
            cy = -0.004 * i  # slight curl toward palm
            cz = bz
            rx = length * (t1 - t0) * 0.55
            add_ellipsoid((cx, cy, cz), (rx, thick * (1 - i * 0.12), thick * (1 - i * 0.1)), segs=10)

    # Thumb
    thumb_base = Vector((0.03, 0.01, 0.04))
    for i, offset in enumerate([(0.0, 0.0, 0.0), (0.025, -0.01, 0.02), (0.045, -0.018, 0.032)]):
        c = thumb_base + Vector(offset)
        thick = 0.011 * (1 - i * 0.1)
        add_ellipsoid(tuple(c), (0.016, thick, thick), segs=10)

    # Merge overlapping
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.006)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)

    # Smooth + subdiv look
    select_only(obj)
    bpy.ops.object.shade_smooth()
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Light sculpt smooth
    try:
        lap = obj.modifiers.new("Lap", "LAPLACIANSMOOTH")
        lap.iterations = 2
        lap.lambda_factor = 0.25
        lap.use_volume_preserve = True
        bpy.ops.object.modifier_apply(modifier=lap.name)
    except Exception:
        pass

    if mirror:
        obj.scale.x = -1
        bpy.ops.object.transform_apply(scale=True)
        # Fix normals after mirror
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")

    obj.data.materials.append(skin_material())
    return obj


def place_hand(hand_obj, arm, side: str):
    """Place hand at hand bone, oriented along bone."""
    bone = arm.pose.bones[f"hand_{side}"] if arm.mode == "POSE" else arm.data.bones[f"hand_{side}"]
    # Use edit/rest bone for bind pose placement
    bone = arm.data.bones[f"hand_{side}"]
    head = arm.matrix_world @ bone.head_local
    tail = arm.matrix_world @ bone.tail_local
    direction = (tail - head).normalized()

    # Build rotation: local +X -> bone direction
    x_axis = direction
    # Prefer world -Y as palm hint, then orthonormalize
    y_hint = Vector((0, -1, 0))
    z_axis = x_axis.cross(y_hint)
    if z_axis.length < 1e-4:
        z_axis = x_axis.cross(Vector((0, 0, 1)))
    z_axis.normalize()
    y_axis = z_axis.cross(x_axis).normalized()
    rot = Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()

    hand_obj.matrix_world = Matrix.Translation(head) @ rot @ Matrix.Translation(Vector((-0.01, 0, 0)))
    # Slight scale to match character
    hand_obj.scale = (1.05, 1.05, 1.05)
    bpy.context.view_layer.update()
    select_only(hand_obj)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def delete_old_hands(obj, arm, radius=0.13):
    """Remove old melted hand verts near hand bones."""
    mw = obj.matrix_world
    centers = []
    for side in ("L", "R"):
        bone = arm.data.bones[f"hand_{side}"]
        head = arm.matrix_world @ bone.head_local
        tail = arm.matrix_world @ bone.tail_local
        centers.append((head + tail) * 0.5)
        centers.append(tail)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    to_del = []
    for v in bm.verts:
        p = mw @ v.co
        if any((p - c).length < radius for c in centers):
            to_del.append(v)
    print("deleting old hand verts", len(to_del))
    bmesh.ops.delete(bm, geom=to_del, context="VERTS")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def weight_hand(hand_obj, arm, side: str):
    """Bind hand fully to hand bone + a bit of forearm."""
    hand_obj.vertex_groups.clear()
    g_hand = hand_obj.vertex_groups.new(name=f"hand_{side}")
    g_fa = hand_obj.vertex_groups.new(name=f"forearm_{side}")
    # Also create empty groups for other bones? Not required for single-bone heavy weight.
    n = len(hand_obj.data.vertices)
    # Wrist verts (lower x in local after apply) get some forearm
    # Use world proximity to forearm bone
    fa = arm.data.bones[f"forearm_{side}"]
    fa_tail = arm.matrix_world @ fa.tail_local
    mw = hand_obj.matrix_world
    for i, v in enumerate(hand_obj.data.vertices):
        p = mw @ v.co
        d = (p - fa_tail).length
        # closer to wrist (forearm tip) => more forearm weight
        w_fa = max(0.0, min(0.45, 1.0 - d / 0.1))
        w_hand = 1.0 - w_fa
        g_hand.add([i], w_hand, "REPLACE")
        g_fa.add([i], w_fa, "REPLACE")

    # Parent with armature
    for m in list(hand_obj.modifiers):
        if m.type == "ARMATURE":
            hand_obj.modifiers.remove(m)
    mod = hand_obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    hand_obj.parent = arm
    print("weighted hand", side, n, "verts")


def smooth_wrist_region(obj, arm, side: str):
    """Light lap smooth around sleeve cuff after hand delete."""
    # Select verts near forearm tip and smooth
    select_only(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    fa = arm.data.bones[f"forearm_{side}"]
    tip = arm.matrix_world @ fa.tail_local
    mw = obj.matrix_world
    for v in obj.data.vertices:
        p = mw @ v.co
        if (p - tip).length < 0.09:
            v.select = True
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.vertices_smooth(factor=0.35, repeat=3)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")


def preview(arm):
    for name in list(bpy.data.objects.keys()):
        if name in {"PreviewCam", "Key", "Fill", "Rim"}:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    bpy.context.scene.collection.objects.link(cam)
    # Close-up on hands / upper body
    cam.location = (0.35, -2.2, 1.25)
    cam.rotation_euler = (math.radians(88), 0, math.radians(8))
    bpy.context.scene.camera = cam
    for name, loc, e in [
        ("Key", (1.5, -2.0, 2.4), 650),
        ("Fill", (-2.0, -1.0, 1.5), 220),
        ("Rim", (0.2, 2.2, 2.0), 240),
    ]:
        d = bpy.data.lights.new(name, "AREA")
        d.energy = e
        d.size = 2.5
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc
    # Rest pose for clear hand view
    if arm.animation_data:
        arm.animation_data.action = None
    bpy.context.scene.frame_set(1)
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 1100
    bpy.context.scene.render.filepath = str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def export(arm, meshes):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    # Keep NLA
    if arm.animation_data is None:
        arm.animation_data_create()
    # Ensure tracks exist
    existing = {t.name for t in arm.animation_data.nla_tracks}
    for name in ("idle", "talk", "wave"):
        if name in bpy.data.actions and name not in existing:
            t = arm.animation_data.nla_tracks.new()
            t.name = name
            t.strips.new(name, 1, bpy.data.actions[name])
    arm.animation_data.action = None

    keep = {arm, *meshes}
    phone = bpy.data.objects.get("PhoneProp")
    if phone:
        keep.add(phone)
    for o in list(bpy.data.objects):
        if o not in keep and o.type in {"MESH", "LIGHT", "CAMERA", "EMPTY"}:
            # keep only our assets
            if o.name.startswith(("Preview", "Key", "Fill", "Rim")):
                bpy.data.objects.remove(o, do_unlink=True)
            elif o not in keep:
                pass

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for m in meshes:
        m.select_set(True)
    if phone:
        phone.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_image_format="JPEG",
        export_jpeg_quality=92,
        export_draco_mesh_compression_enable=False,
    )
    print("exported", OUT_GLB, round(OUT_GLB.stat().st_size / 1e6, 2), "MB")


def main():
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    obj = bpy.data.objects["OstrichCharacter"]
    arm = bpy.data.objects["OstrichArmature"]

    # Clear pose so we place hands on bind pose
    select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    bpy.ops.object.mode_set(mode="OBJECT")
    if arm.animation_data:
        arm.animation_data.action = None

    delete_old_hands(obj, arm, radius=0.14)
    for side in ("L", "R"):
        smooth_wrist_region(obj, arm, side)

    hand_L = build_hand_mesh("Hand_L", mirror=False)
    hand_R = build_hand_mesh("Hand_R", mirror=True)
    place_hand(hand_L, arm, "L")
    place_hand(hand_R, arm, "R")
    weight_hand(hand_L, arm, "L")
    weight_hand(hand_R, arm, "R")

    # Optional: join hands into character for single mesh export simplicity
    # Keep separate so materials stay clean — glTF supports multi-mesh skins.

    try:
        preview(arm)
    except Exception as e:
        print("preview fail", e)

    meshes = [obj, hand_L, hand_R]
    export(arm, meshes)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP))
    shutil.copy2(TMP, BLEND)
    print(
        "DONE hands",
        len(hand_L.data.vertices),
        len(hand_R.data.vertices),
        "body",
        len(obj.data.vertices),
    )


if __name__ == "__main__":
    main()
