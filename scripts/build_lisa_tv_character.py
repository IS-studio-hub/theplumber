"""Build a LISA-like CRT-head turtleneck bust and export lisa.glb."""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa.glb"
)
OUT_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
TMP = Path("/tmp/lisa-character/lisa_tv_final.blend")
PREVIEW = Path("/tmp/lisa-character/lisa_tv_preview.png")


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.5, metal=0.0, emit=None, emit_s=0.0, sheen=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metal
    if emit and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_s
    if sheen and "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    return m


def only(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def apply_all(o):
    only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def smooth(o):
    only(o)
    bpy.ops.object.shade_smooth()


def parent_keep(child, parent):
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    child.matrix_world = mw


def bevel(o, width=0.012, segments=4):
    m = o.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    only(o)
    bpy.ops.object.modifier_apply(modifier="Bevel")


def subsurf(o, levels=1):
    m = o.modifiers.new("Sub", "SUBSURF")
    m.levels = levels
    only(o)
    bpy.ops.object.modifier_apply(modifier="Sub")


def make_screen_material():
    """Dark CRT with baked horizontal waveform texture (glTF-safe)."""
    tex_path = Path(
        "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/screen.png"
    )
    m = bpy.data.materials.new("Screen")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    tex_img = nt.nodes.new("ShaderNodeTexImage")
    img = bpy.data.images.load(str(tex_path))
    tex_img.image = img
    nt.links.new(tex_img.outputs["Color"], bsdf.inputs["Base Color"])
    if "Emission Color" in bsdf.inputs:
        nt.links.new(tex_img.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 3.5
    bsdf.inputs["Roughness"].default_value = 0.22
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m


def build():
    clear()
    knit = mat("Knit", (0.55, 0.55, 0.57), rough=0.82, sheen=0.75)
    plastic = mat("Plastic", (0.04, 0.04, 0.045), rough=0.32, metal=0.25)
    chrome = mat("Chrome", (0.72, 0.74, 0.78), rough=0.18, metal=1.0)
    cable_m = mat("Cable", (0.02, 0.02, 0.02), rough=0.5)
    led_m = mat(
        "LED",
        (0.15, 0.45, 1.0),
        rough=0.2,
        emit=(0.25, 0.55, 1.0),
        emit_s=22,
    )
    screen_m = make_screen_material()

    root = bpy.data.objects.new("LisaCharacter", None)
    bpy.context.scene.collection.objects.link(root)
    head = bpy.data.objects.new("HeadPivot", None)
    bpy.context.scene.collection.objects.link(head)
    head.location = (0, 0, 1.46)
    parent_keep(head, root)

    # --- Torso (taller bust silhouette) ---
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=64, ring_count=48, radius=0.25, location=(0, 0, 0)
    )
    torso = bpy.context.object
    torso.name = "Torso"
    torso.scale = (0.92, 0.70, 1.65)
    apply_all(torso)
    bm = bmesh.new()
    bm.from_mesh(torso.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.12], context="VERTS")
    bm.to_mesh(torso.data)
    bm.free()
    torso.data.update()
    subsurf(torso, 1)
    smooth(torso)
    torso.data.materials.clear()
    torso.data.materials.append(knit)
    torso.location = (0, 0.05, 0.98)
    apply_all(torso)
    parent_keep(torso, root)

    # Shoulders
    for side, x in (("L", 0.19), ("R", -0.19)):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=36, ring_count=24, radius=0.09, location=(0, 0, 0)
        )
        s = bpy.context.object
        s.name = f"Shoulder_{side}"
        s.scale = (1.45, 1.05, 0.95)
        apply_all(s)
        s.location = (x, 0.05, 1.05)
        apply_all(s)
        subsurf(s, 1)
        smooth(s)
        s.data.materials.clear()
        s.data.materials.append(knit)
        parent_keep(s, root)

    # Neck + turtleneck collar (under TV)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48, radius=0.088, depth=0.18, location=(0, 0, 0)
    )
    neck = bpy.context.object
    neck.name = "Neck"
    neck.scale = (1.05, 0.95, 1.0)
    apply_all(neck)
    neck.location = (0, 0.04, 1.30)
    apply_all(neck)
    smooth(neck)
    neck.data.materials.clear()
    neck.data.materials.append(knit)
    parent_keep(neck, root)

    # Folded turtleneck ring — keep it compact under the CRT
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.088,
        minor_radius=0.036,
        major_segments=64,
        minor_segments=24,
        location=(0, 0, 0),
    )
    collar = bpy.context.object
    collar.name = "Collar"
    collar.rotation_euler = (math.radians(4), 0, 0)
    collar.scale = (1.12, 1.0, 1.05)
    apply_all(collar)
    collar.location = (0, 0.04, 1.39)
    apply_all(collar)
    subsurf(collar, 1)
    smooth(collar)
    collar.data.materials.clear()
    collar.data.materials.append(knit)
    parent_keep(collar, root)

    # --- CRT TV shell ---
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.02, 1.54))
    tv = bpy.context.object
    tv.scale = (0.24, 0.18, 0.22)
    apply_all(tv)
    bevel(tv, 0.022, 5)

    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.14, 1.54))
    rear = bpy.context.object
    rear.scale = (0.17, 0.14, 0.17)
    apply_all(rear)
    bevel(rear, 0.028, 5)

    bpy.ops.object.select_all(action="DESELECT")
    tv.select_set(True)
    rear.select_set(True)
    bpy.context.view_layer.objects.active = tv
    bpy.ops.object.join()
    tv = bpy.context.object
    tv.name = "TV"
    smooth(tv)
    tv.data.materials.clear()
    tv.data.materials.append(plastic)
    parent_keep(tv, head)

    # Silver bezel frame (thin inset cube ring via scaled cube face)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.195, 1.54))
    bezel = bpy.context.object
    bezel.name = "Bezel"
    bezel.scale = (0.195, 0.012, 0.175)
    apply_all(bezel)
    bevel(bezel, 0.006, 3)
    bezel.data.materials.clear()
    bezel.data.materials.append(chrome)
    parent_keep(bezel, head)

    # Screen plane
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, -0.21, 1.54))
    scr = bpy.context.object
    scr.name = "Screen"
    scr.rotation_euler = (math.radians(90), 0, 0)
    scr.scale = (0.175, 0.155, 1)
    apply_all(scr)
    only(scr)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED")
    bpy.ops.object.mode_set(mode="OBJECT")
    scr.data.materials.clear()
    scr.data.materials.append(screen_m)
    parent_keep(scr, head)

    # Four blue LEDs on TV front frame (bottom-right bezel)
    for i, ox in enumerate((0.0, 0.028, 0.056, 0.084)):
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=10,
            ring_count=6,
            radius=0.0048,
            location=(0.06 + ox, -0.208, 1.448),
        )
        led = bpy.context.object
        led.name = f"LED_{i}"
        led.data.materials.clear()
        led.data.materials.append(led_m)
        parent_keep(led, head)

    # Cables from TV back/sides draping over shoulders (no upward loops)
    cable_paths = [
        [(0.12, 0.08, 1.56), (0.22, 0.06, 1.38), (0.18, 0.08, 1.20), (0.08, 0.06, 1.08)],
        [(0.14, 0.12, 1.60), (0.26, 0.10, 1.40), (0.20, 0.10, 1.24), (0.06, 0.06, 1.10)],
        [(0.08, 0.14, 1.62), (0.18, 0.16, 1.42), (0.12, 0.12, 1.26), (0.03, 0.05, 1.12)],
        [(-0.12, 0.08, 1.56), (-0.22, 0.06, 1.38), (-0.18, 0.08, 1.20), (-0.08, 0.06, 1.08)],
        [(-0.14, 0.12, 1.60), (-0.26, 0.10, 1.40), (-0.20, 0.10, 1.24), (-0.06, 0.06, 1.10)],
        [(-0.08, 0.14, 1.62), (-0.18, 0.16, 1.42), (-0.12, 0.12, 1.26), (-0.03, 0.05, 1.12)],
        [(0.03, 0.16, 1.64), (0.10, 0.18, 1.44), (0.06, 0.12, 1.26), (0.01, 0.05, 1.12)],
        [(-0.03, 0.16, 1.64), (-0.10, 0.18, 1.44), (-0.06, 0.12, 1.26), (-0.01, 0.05, 1.12)],
    ]
    for i, pts in enumerate(cable_paths):
        cu = bpy.data.curves.new(f"C{i}", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.0038
        cu.bevel_resolution = 3
        cu.resolution_u = 16
        sp = cu.splines.new("BEZIER")
        sp.bezier_points.add(len(pts) - 1)
        for bp, co in zip(sp.bezier_points, pts):
            bp.co = Vector(co)
            bp.handle_left_type = "AUTO"
            bp.handle_right_type = "AUTO"
        ob = bpy.data.objects.new(f"Cable{i}", cu)
        bpy.context.scene.collection.objects.link(ob)
        only(ob)
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.object
        ob.data.materials.clear()
        ob.data.materials.append(cable_m)
        smooth(ob)
        parent_keep(ob, head)

    # Preview
    world = bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.78, 0.78, 0.80, 1)
    bg.inputs[1].default_value = 1.0

    camd = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", camd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -2.4, 1.35)
    cam.rotation_euler = (math.radians(90), 0, 0)
    camd.lens = 58
    bpy.context.scene.camera = cam

    for name, loc, e in [
        ("K", (1.5, -1.4, 2.2), 520),
        ("F", (-1.6, -1.0, 1.5), 180),
        ("R", (0.2, 1.8, 2.0), 220),
    ]:
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = e
        ld.size = 2.2
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
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)

    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        print(
            o.name,
            "z",
            round(min(p.z for p in bb), 3),
            round(max(p.z for p in bb), 3),
            "verts",
            len(o.data.vertices),
        )

    for n in list(bpy.data.objects.keys()):
        if n in {"Cam", "K", "F", "R"}:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = root
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=False,
        export_skins=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=False,
    )
    TMP.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP))
    shutil.copy2(TMP, OUT_BLEND)
    print("DONE", round(OUT_GLB.stat().st_size / 1e6, 2), "mb")


if __name__ == "__main__":
    build()
