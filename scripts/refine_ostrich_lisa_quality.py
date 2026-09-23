"""
Refine OstrichCharacter toward LISA-level polish:
- rebuild manifold mesh via voxel remesh
- bake color/roughness/normal from original textured mesh
- soft studio PBR (fabric sheen + slight SSS)
- rebind armature + keep idle/talk/wave
"""
from __future__ import annotations

import bpy
import bmesh
import math
from mathutils import Vector
from pathlib import Path

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend"
)
OUT_BLEND = BLEND
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb"
)
PREVIEW = Path("/tmp/lisa-character/refined_preview.png")
TEX_DIR = Path("/tmp/lisa-character/baked")
VOXEL = 0.012  # ~detail balance for web character
TARGET_FACES = 55000


def ensure_cycles():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.bake_type = "DIFFUSE"


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    mx = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return mn, mx, mx - mn


def select_only(obj):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def duplicate(obj, name):
    select_only(obj)
    bpy.ops.object.duplicate()
    dup = bpy.context.view_layer.objects.active
    dup.name = name
    return dup


def clear_parents_keep_transform(obj):
    select_only(obj)
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    # remove armature mods
    for m in list(obj.modifiers):
        if m.type == "ARMATURE":
            obj.modifiers.remove(m)


def make_manifold_remesh(src, name="OstrichClean"):
    clean = duplicate(src, name)
    clear_parents_keep_transform(clean)
    # Drop vertex groups on clean mesh (will rebind later)
    clean.vertex_groups.clear()

    select_only(clean)
    # Pre-clean
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0008)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Voxel remesh -> closed manifold
    mod = clean.modifiers.new("VoxelRemesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = VOXEL
    mod.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Smooth
    smooth = clean.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = 0.5
    smooth.iterations = 8
    bpy.ops.object.modifier_apply(modifier=smooth.name)

    # Optional second light remesh if still too dense/sparse
    faces = len(clean.data.polygons)
    print("Remesh faces", faces)
    if faces > TARGET_FACES * 1.6:
        ratio = TARGET_FACES / faces
        dec = clean.modifiers.new("Decimate", "DECIMATE")
        dec.ratio = max(0.2, ratio)
        bpy.ops.object.modifier_apply(modifier=dec.name)
        print("Decimated to", len(clean.data.polygons))

    bpy.ops.object.shade_smooth()
    if hasattr(clean.data, "use_auto_smooth"):
        clean.data.use_auto_smooth = True
        clean.data.auto_smooth_angle = math.radians(55)

    # Smart UV project for baking
    select_only(clean)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return clean


def new_image(name, size=2048):
    img = bpy.data.images.new(name=name, width=size, height=size, alpha=False, float_buffer=False)
    return img


def setup_bake_material(obj, color_img, rough_img, normal_img):
    mat = bpy.data.materials.new(name="BakeTarget")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    tex_c = nodes.new("ShaderNodeTexImage")
    tex_c.image = color_img
    tex_c.location = (-400, 200)
    tex_c.name = "BAKE_COLOR"
    nodes.active = tex_c

    tex_r = nodes.new("ShaderNodeTexImage")
    tex_r.image = rough_img
    tex_r.location = (-400, 0)

    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = normal_img
    tex_n.location = (-400, -200)

    # Keep images in material for bake target selection
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat, tex_c, tex_r, tex_n


def bake_maps(source, target, color_img, rough_img, normal_img):
    ensure_cycles()
    scene = bpy.context.scene
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.margin = 8
    scene.render.bake.cage_extrusion = 0.04
    scene.render.bake.use_cage = False

    # Select source then target (active = target)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    source.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target

    mat, tex_c, tex_r, tex_n = setup_bake_material(target, color_img, rough_img, normal_img)

    def bake(pass_type, node, img, extras=None):
        for n in mat.node_tree.nodes:
            n.select = False
        node.select = True
        mat.node_tree.nodes.active = node
        scene.cycles.bake_type = pass_type
        if extras:
            for k, v in extras.items():
                setattr(scene.render.bake, k, v)
        print("Baking", pass_type, "...")
        bpy.ops.object.bake(type=pass_type)
        img.filepath_raw = str(TEX_DIR / f"{img.name}.png")
        img.file_format = "PNG"
        img.save()
        print("Saved", img.filepath_raw)

    # Diffuse color only
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    bake("DIFFUSE", tex_c, color_img)

    # Roughness
    bake("ROUGHNESS", tex_r, rough_img)

    # Normal
    bake("NORMAL", tex_n, normal_img)

    return mat


def build_lisa_style_material(mat, color_img, rough_img, normal_img):
    """Soft studio / vinyl-toy adjacent PBR for LISA-like feel."""
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()

    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (700, 0)

    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (350, 0)
    # Fabric-ish + soft skin hybrid defaults
    if "Roughness" in bsdf.inputs:
        bsdf.inputs["Roughness"].default_value = 0.48
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.08
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.35
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.18
    if "Sheen Roughness" in bsdf.inputs:
        bsdf.inputs["Sheen Roughness"].default_value = 0.4
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.05
    elif "Subsurface" in bsdf.inputs:
        bsdf.inputs["Subsurface"].default_value = 0.05

    tex_c = nodes.new("ShaderNodeTexImage")
    tex_c.image = color_img
    tex_c.location = (-450, 250)

    tex_r = nodes.new("ShaderNodeTexImage")
    tex_r.image = rough_img
    tex_r.location = (-450, 20)
    if rough_img:
        rough_img.colorspace_settings.name = "Non-Color"

    tex_n = nodes.new("ShaderNodeTexImage")
    tex_n.image = normal_img
    tex_n.location = (-450, -220)
    if normal_img:
        normal_img.colorspace_settings.name = "Non-Color"

    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.location = (-150, -200)
    normal_map.inputs["Strength"].default_value = 0.55

    # Slight color grade: lift contrast toward cleaner product look
    bright = nodes.new("ShaderNodeBrightContrast")
    bright.location = (-150, 220)
    bright.inputs["Bright"].default_value = 0.02
    bright.inputs["Contrast"].default_value = 0.08

    links.new(tex_c.outputs["Color"], bright.inputs["Color"])
    links.new(bright.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex_r.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(tex_n.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    mat.use_backface_culling = True
    return mat


def bone_segment_distance(point, head, tail):
    ab = tail - head
    length2 = ab.length_squared
    if length2 < 1e-12:
        return (point - head).length
    t = max(0.0, min(1.0, (point - head).dot(ab) / length2))
    return (point - (head + ab * t)).length


def paint_proximity_weights(obj, arm, power=2.0, influence=0.32, max_influences=4):
    obj.vertex_groups.clear()
    bones = [b for b in arm.data.bones if b.use_deform]
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in bones}
    segs = []
    for b in bones:
        head = arm.matrix_world @ b.head_local
        tail = arm.matrix_world @ b.tail_local
        radius = max(0.07, (tail - head).length * 0.9)
        if b.name in {"hips", "spine", "chest", "root"}:
            radius *= 1.35
        if "neck" in b.name or b.name == "head":
            radius *= 1.2
        segs.append((b.name, head, tail, radius))

    mw = obj.matrix_world
    for vi, vert in enumerate(obj.data.vertices):
        p = mw @ vert.co
        weights = []
        for name, head, tail, radius in segs:
            d = bone_segment_distance(p, head, tail)
            w = max(0.0, 1.0 - (d / (radius + influence)) ** power)
            if w > 0.001:
                weights.append((name, w))
        if not weights:
            nearest = min(segs, key=lambda s: bone_segment_distance(p, s[1], s[2]))
            groups[nearest[0]].add([vi], 1.0, "REPLACE")
            continue
        weights.sort(key=lambda x: x[1], reverse=True)
        weights = weights[:max_influences]
        total = sum(w for _, w in weights) or 1.0
        for name, w in weights:
            groups[name].add([vi], w / total, "REPLACE")

    mod = next((m for m in obj.modifiers if m.type == "ARMATURE"), None)
    if not mod:
        mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.parent_type = "OBJECT"
    print("Weighted verts", sum(1 for v in obj.data.vertices if v.groups), "/", len(obj.data.vertices))


def count_nonmanifold(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    n = sum(1 for e in bm.edges if not e.is_manifold)
    bm.free()
    return n


def preview_render(arm, obj):
    # Camera / lights
    for name in ("PreviewCam", "Key", "Fill", "Rim"):
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.0, -3.4, 1.15)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam

    def add_area(name, loc, energy, size=2.0):
        data = bpy.data.lights.new(name=name, type="AREA")
        data.energy = energy
        data.size = size
        light = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(light)
        light.location = loc
        return light

    add_area("Key", (1.8, -2.2, 2.6), 550, 2.5)
    add_area("Fill", (-2.2, -1.2, 1.6), 180, 3.0)
    rim = add_area("Rim", (0.2, 2.4, 2.0), 220, 2.0)
    rim.rotation_euler = (math.radians(40), 0, math.radians(180))

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.83, 0.83, 0.83, 1)
        bg.inputs[1].default_value = 1.0

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        scene.render.engine = "CYCLES"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.filepath = str(PREVIEW)
    if arm.animation_data and "idle" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["idle"]
    scene.frame_set(20)
    bpy.ops.render.render(write_still=True)
    print("Preview", PREVIEW)


def export_glb(arm, obj):
    select_only(arm)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    if arm.animation_data is None:
        arm.animation_data_create()
    while arm.animation_data.nla_tracks:
        arm.animation_data.nla_tracks.remove(arm.animation_data.nla_tracks[0])
    for name in ("idle", "talk", "wave"):
        if name not in bpy.data.actions:
            continue
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, bpy.data.actions[name])
    arm.animation_data.action = None

    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_morph=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_draco_mesh_compression_enable=False,
    )
    print("Exported", OUT_GLB, "MB", round(OUT_GLB.stat().st_size / 1e6, 2))


def main():
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))

    src = bpy.data.objects.get("OstrichCharacter")
    arm = bpy.data.objects.get("OstrichArmature")
    if not src or not arm:
        raise RuntimeError("Missing OstrichCharacter or OstrichArmature")

    print("BEFORE nonmanifold", count_nonmanifold(src), "faces", len(src.data.polygons))

    # Hide original during remesh/bake but keep as bake source
    src.name = "OstrichSource"
    clean = make_manifold_remesh(src, "OstrichCharacter")
    print("AFTER remesh nonmanifold", count_nonmanifold(clean), "faces", len(clean.data.polygons))

    color_img = new_image("ostrich_color", 2048)
    rough_img = new_image("ostrich_rough", 2048)
    normal_img = new_image("ostrich_normal", 2048)

    # Source must be visible for bake
    src.hide_render = False
    src.hide_set(False)
    clean.hide_set(False)

    try:
        bake_maps(src, clean, color_img, rough_img, normal_img)
    except Exception as e:
        print("Bake failed, falling back to vertex color-ish material:", e)
        # Fallback: copy first material sockets if bake fails
        if src.material_slots and src.material_slots[0].material:
            clean.data.materials.clear()
            clean.data.materials.append(src.material_slots[0].material.copy())

    # Rebuild polished material on clean mesh
    if clean.data.materials:
        mat = clean.data.materials[0]
    else:
        mat = bpy.data.materials.new("OstrichLisa")
        clean.data.materials.append(mat)
    build_lisa_style_material(mat, color_img, rough_img, normal_img)

    # Hide source mesh
    src.hide_set(True)
    src.hide_render = True

    paint_proximity_weights(clean, arm)

    # Ground clean mesh
    select_only(clean)
    mn, mx, size = world_bounds(clean)
    clean.location.z -= mn.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    try:
        preview_render(arm, clean)
    except Exception as e:
        print("preview failed", e)

    export_glb(arm, clean)
    print("DONE refined")


if __name__ == "__main__":
    main()
