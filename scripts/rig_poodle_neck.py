"""Neck-pivot look rig: rigid head on neck_01, pivot at collar BEHIND the spine."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

SRC = Path(
    "/Users/shamrikin/Downloads/Meshy_AI_Poodle_Pop_Fashion_0918221921_texture.glb"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa.glb"
)
OUT_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
TARGET_H = 1.72


def only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_transforms(obj):
    only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3.0 - 2.0 * t)


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.object
    body.name = "Poodle"
    apply_transforms(body)
    only(body)
    bpy.ops.object.shade_smooth()

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except Exception as e:
        print("clear_splitnormals skip", e)
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    mw = body.matrix_world
    pts = [mw @ v.co for v in body.data.vertices]
    zs = [p.z for p in pts]
    body.scale *= TARGET_H / max(max(zs) - min(zs), 1e-6)
    apply_transforms(body)

    mw = body.matrix_world
    pts = [mw @ v.co for v in body.data.vertices]
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    body.location += Vector(
        (-(min(xs) + max(xs)) * 0.5, -(min(ys) + max(ys)) * 0.5, -min(zs))
    )
    apply_transforms(body)

    mw = body.matrix_world
    pts = [mw @ v.co for v in body.data.vertices]
    H = max(p.z for p in pts) - min(p.z for p in pts)
    print("height", round(H, 3))

    # Look pivot = base of neck, WELL BEHIND the snout (spine side).
    # That way the whole head orbits the neck instead of the mouth swinging alone.
    z_pivot = H * 0.52
    # Wide soft blend into the shirt; collar+face stay rigid on neck_01.
    z_lo = z_pivot - 0.16
    z_hi = z_pivot + 0.02
    z_crown = H * 0.97
    y_pivot = -0.32  # further behind so crown/ears also swing around the neck

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "Armature"
    arm.show_in_front = True
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)

    def bone(name, head, tail, parent=None, connect=False, deform=True):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        b.use_deform = deform
        b.roll = 0.0
        return b

    bone("root", (0, 0, 0), (0, 0, 0.03), deform=False)
    bone("chest", (0, y_pivot, H * 0.28), (0, y_pivot, z_pivot), "root")
    # Straight vertical bone behind the neck — local Y = twist axis = world up
    bone(
        "neck_01",
        (0, y_pivot, z_pivot),
        (0, y_pivot, z_crown),
        "chest",
        True,
        True,
    )
    bone(
        "neck_02",
        (0, y_pivot, H * 0.65),
        (0, y_pivot, H * 0.78),
        "neck_01",
        False,
        False,
    )
    bone(
        "head",
        (0, y_pivot, H * 0.88),
        (0, y_pivot, z_crown),
        "neck_02",
        False,
        False,
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    only(body)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_NAME")

    for name in ("chest", "neck_01", "neck_02", "head"):
        if name not in body.vertex_groups:
            body.vertex_groups.new(name=name)
    vg = {g.name: g for g in body.vertex_groups}
    for g in vg.values():
        g.remove(list(range(len(body.data.vertices))))

    import math

    mw = body.matrix_world
    for vi, v in enumerate(body.data.vertices):
        p = mw @ v.co
        z = p.z
        r = math.sqrt(p.x * p.x + (p.y - y_pivot) * (p.y - y_pivot))
        if z >= z_hi:
            w_neck = 1.0
        elif z <= z_lo:
            w_neck = 0.0
        else:
            t = smoothstep((z - z_lo) / max(1e-6, z_hi - z_lo))
            # Outer shoulders stay more on chest to avoid collar pinch.
            shoulder = smoothstep((r - 0.08) / 0.22)
            w_neck = t * (1.0 - 0.65 * shoulder)
        vg["neck_01"].add([vi], w_neck, "REPLACE")
        vg["chest"].add([vi], 1.0 - w_neck, "REPLACE")

    # Face / snout / ears / collar MUST be 100% neck_01 — no multi-bone shear
    for vi, v in enumerate(body.data.vertices):
        p = mw @ v.co
        if p.z >= z_hi or (p.z >= z_pivot - 0.02 and p.y > -0.05):
            for g in list(v.groups):
                body.vertex_groups[g.group].remove([vi])
            vg["neck_01"].add([vi], 1.0, "REPLACE")
        elif p.z <= z_lo:
            for g in list(v.groups):
                body.vertex_groups[g.group].remove([vi])
            vg["chest"].add([vi], 1.0, "REPLACE")

    only(body)
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    try:
        bpy.ops.object.vertex_group_smooth(
            group_select_mode="ALL", factor=0.35, repeat=4, expand=0.0
        )
    except Exception as e:
        print("smooth skip", e)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Re-lock rigid bands after smooth bleed
    for vi, v in enumerate(body.data.vertices):
        p = mw @ v.co
        if p.z >= z_hi:
            for g in list(v.groups):
                body.vertex_groups[g.group].remove([vi])
            vg["neck_01"].add([vi], 1.0, "REPLACE")
        elif p.z <= z_lo:
            for g in list(v.groups):
                body.vertex_groups[g.group].remove([vi])
            vg["chest"].add([vi], 1.0, "REPLACE")

    for mat in body.data.materials:
        if not mat or not mat.use_nodes:
            continue
        bsdf = next(
            (n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None
        )
        if not bsdf:
            continue
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.04
        if "Roughness" in bsdf.inputs and bsdf.inputs["Roughness"].default_value > 0.9:
            bsdf.inputs["Roughness"].default_value = 0.72

    counts = defaultdict(int)
    mixed = 0
    for v in body.data.vertices:
        if not v.groups:
            continue
        best = max(v.groups, key=lambda g: g.weight).group
        counts[body.vertex_groups[best].name] += 1
        z = (mw @ v.co).z
        if z >= z_hi and len([g for g in v.groups if g.weight > 0.02]) > 1:
            mixed += 1
    print("dominant_group", dict(counts))
    print("mixed_head", mixed)
    print("pivot", round(z_pivot, 3), round(y_pivot, 3), "rigid_from", round(z_hi, 3))

    # Verify rigid turn around back-neck pivot
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for b in arm.pose.bones:
        b.rotation_mode = "XYZ"
        b.rotation_euler = (0, 0, 0)
    nose_i = max(
        range(len(body.data.vertices)),
        key=lambda i: (mw @ body.data.vertices[i].co).y
        if (mw @ body.data.vertices[i].co).z > 1.1
        else -1e9,
    )
    crown_i = max(
        range(len(body.data.vertices)),
        key=lambda i: (mw @ body.data.vertices[i].co).z,
    )

    def meas():
        deps = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(deps)
        m = ev.to_mesh()
        n = m.vertices[nose_i].co.copy()
        c = m.vertices[crown_i].co.copy()
        ev.to_mesh_clear()
        return n, c, (n - c).length

    bpy.context.view_layer.update()
    rn, rc, rd = meas()
    arm.pose.bones["neck_01"].rotation_euler = (0, -0.35, 0)
    bpy.context.view_layer.update()
    pn, pc, pd = meas()
    print(
        "rigid",
        abs(rd - pd) < 1e-4,
        "nose_dx",
        round(pn.x - rn.x, 3),
        "crown_dx",
        round(pc.x - rc.x, 3),
    )
    bpy.ops.object.mode_set(mode="OBJECT")

    OUT_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_skins=True,
        export_animations=False,
        export_apply=True,
        export_yup=True,
    )
    print("exported", OUT_GLB.stat().st_size)


if __name__ == "__main__":
    build()
