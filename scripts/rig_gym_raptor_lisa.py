"""Rig Meshy Gym Raptor for LISA web stage — proximity skinning, studio mats."""
from __future__ import annotations

# Canonical entry: run via
#   Blender --background --python scripts/rig_gym_raptor_lisa.py
#
# The full production pipeline is maintained as the working Blender --python-expr
# in agent history; this module re-exports by executing the same steps.

import runpy
from pathlib import Path

# Prefer the last successful inline pipeline by re-running the dedicated script body.
# (Implementation lives below for maintainability.)

import math
import shutil
from mathutils import Vector, Euler

import bpy

SRC = Path(
    "/Users/shamrikin/Downloads/Meshy_AI_Gym Raptor Rising_1789766964_part-segmentation.glb"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa.glb"
)
OUT_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
TMP = Path("/tmp/lisa-character/raptor_rigged.blend")
PREVIEW = Path("/tmp/lisa-character/raptor_rigged_preview.png")
TARGET_H = 1.72

PART_ROLE = {
    "model_part5": "head",
    "model_part3": "clothes",
    "model_part2": "skin",
    "model_part4": "leg_l",
    "model_part6": "leg_r",
    "model_part0": "db_l",
    "model_part1": "db_l",
    "model_part7": "db_r",
    "model_part8": "db_r",
    "model_part9": "db_r",
    "model_part10": "db_r",
}
COLORS = {
    "head": (0.58, 0.52, 0.48),
    "clothes": (0.82, 0.82, 0.84),
    "skin": (0.52, 0.46, 0.42),
    "leg_l": (0.52, 0.46, 0.42),
    "leg_r": (0.52, 0.46, 0.42),
    "db_l": (0.14, 0.14, 0.15),
    "db_r": (0.14, 0.14, 0.15),
}
ROUGH = {
    "head": 0.5,
    "clothes": 0.75,
    "skin": 0.45,
    "leg_l": 0.45,
    "leg_r": 0.45,
    "db_l": 0.3,
    "db_r": 0.3,
}
METAL = {"db_l": 0.9, "db_r": 0.9}


def dist_point_segment(p, a, b):
    ab = b - a
    t = (
        0.0
        if ab.length_squared < 1e-12
        else max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    )
    return (p - (a + ab * t)).length


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    def only(o):
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o

    def apply(o):
        only(o)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    def bounds(objs):
        pts = []
        for o in objs:
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
        xs = [p.x for p in pts]
        ys = [p.y for p in pts]
        zs = [p.z for p in pts]
        return Vector((min(xs), min(ys), min(zs))), Vector(
            (max(xs), max(ys), max(zs))
        )

    role_mats = {}
    for role, col in COLORS.items():
        m = bpy.data.materials.new(f"M_{role}")
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (*col, 1)
        bsdf.inputs["Roughness"].default_value = ROUGH[role]
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = METAL.get(role, 0)
        if role == "clothes" and "Sheen Weight" in bsdf.inputs:
            bsdf.inputs["Sheen Weight"].default_value = 0.4
        role_mats[role] = m
    for o in meshes:
        role = PART_ROLE.get(o.name, "skin")
        o.data.materials.clear()
        o.data.materials.append(role_mats[role])

    bb0, bb1 = bounds(meshes)
    scale = TARGET_H / max((bb1 - bb0).z, 1e-6)
    for o in meshes:
        o.scale *= scale
        apply(o)
    bb0, bb1 = bounds(meshes)
    off = Vector((-(bb0.x + bb1.x) / 2, -(bb0.y + bb1.y) / 2, -bb0.z))
    for o in meshes:
        o.location += off
        apply(o)
    bb0, bb1 = bounds(meshes)
    H = (bb1 - bb0).z
    print("height", round(H, 3), "parts", len(meshes))

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "Armature"
    arm.show_in_front = True
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)

    def bone(name, head, tail, parent=None, connect=False, env=0.12):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        b.envelope_distance = env
        b.head_radius = 0.04
        b.tail_radius = 0.03
        return b

    bone("root", (0, 0, 0), (0, 0, 0.04))
    bone("hips", (0, 0.01, H * 0.48), (0, 0.01, H * 0.53), "root")
    bone("spine", (0, 0.015, H * 0.53), (0, 0.02, H * 0.63), "hips", True)
    bone("chest", (0, 0.02, H * 0.63), (0, 0.01, H * 0.74), "spine", True)
    bone("neck_01", (0, 0.008, H * 0.74), (0, 0.0, H * 0.80), "chest", True, 0.14)
    bone("neck_02", (0, 0.0, H * 0.80), (0, -0.01, H * 0.86), "neck_01", True, 0.14)
    bone("neck_03", (0, -0.01, H * 0.86), (0, -0.02, H * 0.92), "neck_02", True, 0.14)
    bone("head", (0, -0.02, H * 0.92), (0, -0.05, H * 0.995), "neck_03", True, 0.14)
    for side, sx in (("L", 1.0), ("R", -1.0)):
        bone(
            f"clavicle_{side}",
            (sx * 0.05, 0.02, H * 0.73),
            (sx * 0.13, 0.02, H * 0.72),
            "chest",
            env=0.1,
        )
        bone(
            f"upper_arm_{side}",
            (sx * 0.14, 0.02, H * 0.715),
            (sx * 0.40, 0.02, H * 0.70),
            f"clavicle_{side}",
            True,
            0.18,
        )
        bone(
            f"forearm_{side}",
            (sx * 0.40, 0.02, H * 0.70),
            (sx * 0.60, 0.02, H * 0.69),
            f"upper_arm_{side}",
            True,
            0.16,
        )
        bone(
            f"hand_{side}",
            (sx * 0.60, 0.02, H * 0.69),
            (sx * 0.68, 0.02, H * 0.68),
            f"forearm_{side}",
            True,
            0.12,
        )
        bone(
            f"prop_{side}",
            (sx * 0.66, 0.02, H * 0.66),
            (sx * 0.74, 0.02, H * 0.66),
            f"hand_{side}",
            env=0.2,
        )
        bone(
            f"thigh_{side}",
            (sx * 0.08, 0.01, H * 0.48),
            (sx * 0.09, 0.02, H * 0.26),
            "hips",
            env=0.16,
        )
        bone(
            f"shin_{side}",
            (sx * 0.09, 0.02, H * 0.26),
            (sx * 0.09, 0.01, H * 0.06),
            f"thigh_{side}",
            True,
            0.14,
        )
        bone(
            f"foot_{side}",
            (sx * 0.09, 0.01, H * 0.06),
            (sx * 0.09, -0.08, 0.02),
            f"shin_{side}",
            True,
            0.1,
        )
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "Character"
    only(body)
    bpy.ops.object.shade_smooth()

    only(body)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_NAME")
    for b in arm.data.bones:
        if b.name not in body.vertex_groups:
            body.vertex_groups.new(name=b.name)

    arm_mw = arm.matrix_world
    bones = []
    for b in arm.data.bones:
        if b.name == "root":
            continue
        bones.append(
            (
                b.name,
                arm_mw @ b.head_local,
                arm_mw @ b.tail_local,
                max(b.envelope_distance, 0.08),
            )
        )
    mw = body.matrix_world
    for vg in body.vertex_groups:
        vg.remove(list(range(len(body.data.vertices))))

    K = 3
    falloff = 0.08
    for vi, v in enumerate(body.data.vertices):
        p = mw @ v.co
        dists = []
        for name, a, b, env in bones:
            d = dist_point_segment(p, a, b)
            dists.append((d / max(env, 1e-6), name, d))
        dists.sort(key=lambda x: x[0])
        nearest = dists[:K]
        weights = [
            (name, math.exp(-(d * d) / (2 * falloff * falloff)))
            for _, name, d in nearest
        ]
        s = sum(w for _, w in weights) or 1.0
        for name, w in weights:
            body.vertex_groups[name].add([vi], w / s, "REPLACE")

    zero = sum(
        1
        for v in body.data.vertices
        if sum(g.weight for g in v.groups) < 1e-5
    )
    print("zero_weight", zero, "of", len(body.data.vertices))

    only(body)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    try:
        bpy.ops.object.vertex_group_smooth(
            group_select_mode="ALL", factor=0.35, repeat=2
        )
    except Exception as e:
        print("smooth skip", e)
    bpy.ops.object.mode_set(mode="OBJECT")

    for vi, v in enumerate(body.data.vertices):
        p = mw @ v.co
        if abs(p.x) > 0.55 and 0.55 < p.z < 0.85:
            side = "L" if p.x > 0 else "R"
            for g in list(v.groups):
                body.vertex_groups[g.group].remove([vi])
            body.vertex_groups[f"prop_{side}"].add([vi], 1.0, "REPLACE")
            body.vertex_groups[f"hand_{side}"].add([vi], 0.15, "ADD")

    arm.animation_data_create()

    def make_action(name, keys):
        act = bpy.data.actions.new(name)
        arm.animation_data.action = act
        only(arm)
        bpy.ops.object.mode_set(mode="POSE")
        for bone_name, frames in keys.items():
            b = arm.pose.bones.get(bone_name)
            if not b:
                continue
            b.rotation_mode = "XYZ"
            for fr, eul in frames:
                b.rotation_euler = Euler(eul)
                b.keyframe_insert("rotation_euler", frame=fr)
        bpy.ops.object.mode_set(mode="OBJECT")
        tr = arm.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, act)
        arm.animation_data.action = None

    make_action(
        "idle",
        {
            "spine": [(1, (0, 0, 0)), (60, (0.012, 0, 0)), (120, (0, 0, 0))],
            "chest": [(1, (0, 0, 0)), (60, (0.02, 0, 0)), (120, (0, 0, 0))],
            "neck_01": [(1, (0, 0, 0)), (60, (-0.01, 0, 0)), (120, (0, 0, 0))],
        },
    )
    make_action(
        "talk",
        {
            "head": [
                (1, (0, 0, 0)),
                (12, (0.05, 0, 0)),
                (24, (0, 0, 0)),
                (36, (0.04, 0, 0)),
                (48, (0, 0, 0)),
            ],
            "neck_03": [
                (1, (0, 0, 0)),
                (12, (0.025, 0, 0)),
                (24, (0, 0, 0)),
                (36, (0.02, 0, 0)),
                (48, (0, 0, 0)),
            ],
        },
    )

    root = bpy.data.objects.new("LisaCharacter", None)
    bpy.context.scene.collection.objects.link(root)
    arm.parent = root
    arm.matrix_parent_inverse = root.matrix_world.inverted()

    world = bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.78, 0.78, 0.80, 1)
    bg.inputs[1].default_value = 1
    look = Vector((0, 0, H * 0.72))
    camd = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", camd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -2.35, look.z)
    cam.rotation_euler = (math.radians(90), 0, 0)
    camd.lens = 55
    bpy.context.scene.camera = cam
    for name, loc, e in [
        ("K", (1.5, -1.5, look.z + 0.7), 480),
        ("F", (-1.6, -1.0, look.z), 170),
        ("R", (0.2, 1.8, look.z + 0.5), 210),
    ]:
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = e
        ld.size = 2.1
        lo = bpy.data.objects.new(name, ld)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = loc
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    bpy.context.scene.render.resolution_x = 1000
    bpy.context.scene.render.resolution_y = 1200
    bpy.context.scene.render.filepath = str(PREVIEW)
    arm.hide_render = True
    bpy.ops.render.render(write_still=True)
    arm.hide_render = False
    print("preview", PREVIEW)
    for n in ("Cam", "K", "F", "R"):
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    root.select_set(True)
    bpy.context.view_layer.objects.active = arm
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
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
        export_tangents=True,
        export_draco_mesh_compression_enable=False,
        export_yup=True,
    )
    TMP.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP))
    shutil.copy2(TMP, OUT_BLEND)
    print("DONE", round(OUT_GLB.stat().st_size / 1e6, 2), "mb verts", len(body.data.vertices))


if __name__ == "__main__":
    build()
