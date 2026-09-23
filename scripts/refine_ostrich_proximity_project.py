"""
Rebuild clean manifold ostrich + project original textures by proximity,
then apply LISA-like soft studio materials and re-export.
"""
from __future__ import annotations

import bpy
import bmesh
import math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb"
)
PREVIEW = Path("/tmp/lisa-character/refined_preview.png")
TEX_DIR = Path("/tmp/lisa-character/baked")
SRC_GLB = Path(
    "/Users/shamrikin/Downloads/Meshy_AI_Blue_Hoodie_Ostrich_P_0918141516_texture.glb"
)

MAP_SIZE = 1024
VOXEL = 0.011


def select_only(obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector(tuple(min(v[i] for v in corners) for i in range(3)))
    mx = Vector(tuple(max(v[i] for v in corners) for i in range(3)))
    return mn, mx, mx - mn


def normalize_character(obj, height=1.7):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx, size = world_bounds(obj)
    center = (mn + mx) * 0.5
    bpy.context.scene.cursor.location = Vector((center.x, center.y, mn.z))
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.location = (0, 0, 0)
    mn, mx, size = world_bounds(obj)
    scale = height / max(size.z, 1e-6)
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx, size = world_bounds(obj)
    obj.location.z -= mn.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)


def get_source_images(obj):
    """Return (color, rough_or_none, normal_or_none) from principled setup."""
    color = rough = normal = None
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        # Base color image
        base = bsdf.inputs.get("Base Color")
        if base and base.is_linked:
            link = base.links[0].from_node
            if link.type == "TEX_IMAGE":
                color = link.image
            elif link.type == "MIX" or link.type == "MIX_RGB":
                for inp in link.inputs:
                    if inp.is_linked and inp.links[0].from_node.type == "TEX_IMAGE":
                        color = inp.links[0].from_node.image
                        break
        rough_in = bsdf.inputs.get("Roughness")
        if rough_in and rough_in.is_linked and rough_in.links[0].from_node.type == "TEX_IMAGE":
            rough = rough_in.links[0].from_node.image
        nrm_in = bsdf.inputs.get("Normal")
        if nrm_in and nrm_in.is_linked:
            nnode = nrm_in.links[0].from_node
            if nnode.type == "NORMAL_MAP" and nnode.inputs["Color"].is_linked:
                if nnode.inputs["Color"].links[0].from_node.type == "TEX_IMAGE":
                    normal = nnode.inputs["Color"].links[0].from_node.image
            elif nnode.type == "TEX_IMAGE":
                normal = nnode.image
        # fallback: any image nodes
        imgs = [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
        if not color and imgs:
            color = imgs[0]
        if not rough and len(imgs) > 1:
            rough = imgs[1]
        if not normal and len(imgs) > 2:
            normal = imgs[2]
    return color, rough, normal


def sample_image(img, u, v):
    if img is None:
        return (0.7, 0.7, 0.75, 1.0)
    # Ensure pixels loaded
    if not img.has_data:
        img.pixels[0]
    w, h = img.size
    u = u % 1.0
    v = v % 1.0
    x = min(w - 1, max(0, int(u * w)))
    y = min(h - 1, max(0, int(v * h)))
    # Blender pixels are bottom-up float RGBA flattened
    idx = (y * w + x) * 4
    px = img.pixels
    return (px[idx], px[idx + 1], px[idx + 2], px[idx + 3] if idx + 3 < len(px) else 1.0)


def build_bvh_with_uv(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(deps)
    mesh = eval_obj.to_mesh()
    mesh.transform(obj.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.active
    bvh = BVHTree.FromBMesh(bm)
    eval_obj.to_mesh_clear()
    return bvh, bm, uv_layer


def barycentric(p, a, b, c):
    v0 = b - a
    v1 = c - a
    v2 = p - a
    d00 = v0.dot(v0)
    d01 = v0.dot(v1)
    d11 = v1.dot(v1)
    d20 = v2.dot(v0)
    d21 = v2.dot(v1)
    denom = d00 * d11 - d01 * d01
    if abs(denom) < 1e-12:
        return 1.0, 0.0, 0.0
    v = (d11 * d20 - d01 * d21) / denom
    w = (d00 * d21 - d01 * d20) / denom
    u = 1.0 - v - w
    return u, v, w


def project_textures(source, target, color_img_src, map_size=MAP_SIZE):
    """Create new baked images on target UVs by proximity sampling source."""
    TEX_DIR.mkdir(parents=True, exist_ok=True)
    color_dst = bpy.data.images.new("ostrich_color_proj", map_size, map_size, alpha=False)
    rough_dst = bpy.data.images.new("ostrich_rough_proj", map_size, map_size, alpha=False)

    # Init dark gray so misses are obvious but not pure black
    color_dst.pixels = [0.55, 0.55, 0.58, 1.0] * (map_size * map_size)
    rough_dst.pixels = [0.45, 0.45, 0.45, 1.0] * (map_size * map_size)

    bvh, bm, uv_layer = build_bvh_with_uv(source)
    if uv_layer is None:
        print("Source has no UV layer — abort projection")
        bm.free()
        return color_dst, rough_dst

    # Ensure target has UV
    select_only(target)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.012)
    bpy.ops.object.mode_set(mode="OBJECT")

    tbm = bmesh.new()
    tbm.from_mesh(target.data)
    tbm.faces.ensure_lookup_table()
    tuv = tbm.loops.layers.uv.active

    # Rasterize each target face into UV space (coarse: sample per loop + face center)
    cp = list(color_dst.pixels)
    rp = list(rough_dst.pixels)

    def write_px(img_pixels, u, v, rgba):
        x = min(map_size - 1, max(0, int(u * map_size)))
        y = min(map_size - 1, max(0, int(v * map_size)))
        # splat 2x2 for coverage
        for dx in (0, 1):
            for dy in (0, 1):
                xx = min(map_size - 1, x + dx)
                yy = min(map_size - 1, y + dy)
                i = (yy * map_size + xx) * 4
                img_pixels[i : i + 4] = [rgba[0], rgba[1], rgba[2], 1.0]

    hits = 0
    total = 0
    mw = target.matrix_world

    def sample_src_at(world_p):
        loc, normal, index, dist = bvh.find_nearest(world_p)
        if loc is None or index is None or dist > 0.28:
            return None
        src_face = bm.faces[index]
        if len(src_face.loops) < 3:
            return None
        a = src_face.verts[0].co
        b = src_face.verts[1].co
        c = src_face.verts[2].co
        bu, bv, bw = barycentric(loc, a, b, c)
        uv0 = src_face.loops[0][uv_layer].uv
        uv1 = src_face.loops[1][uv_layer].uv
        uv2 = src_face.loops[2][uv_layer].uv
        su = uv0.x * bu + uv1.x * bv + uv2.x * bw
        sv = uv0.y * bu + uv1.y * bv + uv2.y * bw
        return sample_image(color_img_src, su, sv)

    for face in tbm.faces:
        if not tuv or len(face.loops) < 3:
            continue
        # Dense barycentric samples across each triangle fan
        verts = [loop.vert for loop in face.loops]
        uvs = [loop[tuv].uv.copy() for loop in face.loops]
        origin = verts[0]
        ouv = uvs[0]
        for i in range(1, len(verts) - 1):
            tri = (origin, verts[i], verts[i + 1])
            tri_uv = (ouv, uvs[i], uvs[i + 1])
            # 6x6 samples
            steps = 4
            for a in range(steps + 1):
                for b in range(steps + 1 - a):
                    total += 1
                    ca = a / steps
                    cb = b / steps
                    cc = 1.0 - ca - cb
                    p = mw @ (tri[0].co * cc + tri[1].co * ca + tri[2].co * cb)
                    u = tri_uv[0].x * cc + tri_uv[1].x * ca + tri_uv[2].x * cb
                    v = tri_uv[0].y * cc + tri_uv[1].y * ca + tri_uv[2].y * cb
                    rgba = sample_src_at(p)
                    if rgba is None:
                        continue
                    write_px(cp, u, v, rgba)
                    lum = 0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]
                    rough = 0.32 + (1.0 - lum) * 0.38
                    write_px(rp, u, v, (rough, rough, rough, 1.0))
                    hits += 1

    # Dilate colors a few times to fill UV seams/gaps
    def dilate(pixels, passes=5):
        for _ in range(passes):
            nxt = pixels[:]
            for y in range(map_size):
                for x in range(map_size):
                    i = (y * map_size + x) * 4
                    if pixels[i] + pixels[i + 1] + pixels[i + 2] > 0.2:
                        continue
                    acc = [0.0, 0.0, 0.0]
                    n = 0
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        xx, yy = x + dx, y + dy
                        if xx < 0 or yy < 0 or xx >= map_size or yy >= map_size:
                            continue
                        j = (yy * map_size + xx) * 4
                        if pixels[j] + pixels[j + 1] + pixels[j + 2] <= 0.2:
                            continue
                        acc[0] += pixels[j]
                        acc[1] += pixels[j + 1]
                        acc[2] += pixels[j + 2]
                        n += 1
                    if n:
                        nxt[i] = acc[0] / n
                        nxt[i + 1] = acc[1] / n
                        nxt[i + 2] = acc[2] / n
                        nxt[i + 3] = 1.0
            pixels[:] = nxt
        return pixels

    print(f"Projection hits {hits}/{total} ({hits/max(total,1):.1%}) — dilating…")
    cp = dilate(cp, passes=5)
    rp = dilate(rp, passes=5)
    color_dst.pixels = cp
    rough_dst.pixels = rp
    color_dst.filepath_raw = str(TEX_DIR / "ostrich_color_proj.png")
    rough_dst.filepath_raw = str(TEX_DIR / "ostrich_rough_proj.png")
    color_dst.file_format = "PNG"
    rough_dst.file_format = "PNG"
    color_dst.save()
    rough_dst.save()
    print(f"Projection hits {hits}/{total} ({hits/max(total,1):.1%})")
    tbm.free()
    bm.free()
    return color_dst, rough_dst


def build_lisa_material(mat, color_img, rough_img):
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (650, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)

    # Soft product / vinyl-adjacent studio look
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.32
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.12
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = 0.28
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.22
    if "Sheen Roughness" in bsdf.inputs:
        bsdf.inputs["Sheen Roughness"].default_value = 0.45
    if "Subsurface Weight" in bsdf.inputs:
        bsdf.inputs["Subsurface Weight"].default_value = 0.04

    tex_c = nodes.new("ShaderNodeTexImage")
    tex_c.image = color_img
    tex_c.location = (-500, 180)
    bright = nodes.new("ShaderNodeBrightContrast")
    bright.location = (-200, 180)
    bright.inputs["Bright"].default_value = 0.03
    bright.inputs["Contrast"].default_value = 0.12
    links.new(tex_c.outputs["Color"], bright.inputs["Color"])
    links.new(bright.outputs["Color"], bsdf.inputs["Base Color"])

    tex_r = nodes.new("ShaderNodeTexImage")
    tex_r.image = rough_img
    tex_r.location = (-500, -40)
    if rough_img:
        rough_img.colorspace_settings.name = "Non-Color"
    # Soften roughness map
    ramp = nodes.new("ShaderNodeMapRange")
    ramp.location = (-200, -40)
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = 1.0
    ramp.inputs["To Min"].default_value = 0.28
    ramp.inputs["To Max"].default_value = 0.72
    links.new(tex_r.outputs["Color"], ramp.inputs["Value"])
    links.new(ramp.outputs["Result"], bsdf.inputs["Roughness"])

    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_backface_culling = True


def remesh_clean(src):
    select_only(src)
    bpy.ops.object.duplicate()
    clean = bpy.context.view_layer.objects.active
    clean.name = "OstrichCharacter"
    # clear parenting/weights
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for m in list(clean.modifiers):
        clean.modifiers.remove(m)
    clean.vertex_groups.clear()

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0008)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    mod = clean.modifiers.new("VoxelRemesh", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = VOXEL
    mod.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=mod.name)

    smooth = clean.modifiers.new("Smooth", "SMOOTH")
    smooth.factor = 0.65
    smooth.iterations = 12
    bpy.ops.object.modifier_apply(modifier=smooth.name)

    # Mild corrective smooth via laplace if available
    try:
        lap = clean.modifiers.new("LapSmooth", "LAPLACIANSMOOTH")
        lap.iterations = 4
        lap.lambda_factor = 0.35
        bpy.ops.object.modifier_apply(modifier=lap.name)
    except Exception:
        pass

    bpy.ops.object.shade_smooth()
    print("Clean faces", len(clean.data.polygons), "verts", len(clean.data.vertices))
    return clean


def paint_weights(obj, arm):
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

    def seg_dist(p, head, tail):
        ab = tail - head
        l2 = ab.length_squared
        if l2 < 1e-12:
            return (p - head).length
        t = max(0.0, min(1.0, (p - head).dot(ab) / l2))
        return (p - (head + ab * t)).length

    mw = obj.matrix_world
    for vi, vert in enumerate(obj.data.vertices):
        p = mw @ vert.co
        weights = []
        for name, head, tail, radius in segs:
            d = seg_dist(p, head, tail)
            w = max(0.0, 1.0 - (d / (radius + 0.3)) ** 2)
            if w > 0.001:
                weights.append((name, w))
        if not weights:
            nearest = min(segs, key=lambda s: seg_dist(p, s[1], s[2]))
            groups[nearest[0]].add([vi], 1.0, "REPLACE")
            continue
        weights.sort(key=lambda x: x[1], reverse=True)
        weights = weights[:4]
        total = sum(w for _, w in weights) or 1.0
        for name, w in weights:
            groups[name].add([vi], w / total, "REPLACE")

    mod = next((m for m in obj.modifiers if m.type == "ARMATURE"), None)
    if not mod:
        mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    print("weights ok", sum(1 for v in obj.data.vertices if v.groups))


def ensure_actions(arm):
    # Keep existing idle/talk/wave if present
    names = [a.name for a in bpy.data.actions]
    print("actions", names)


def preview(arm, obj):
    for name in list(bpy.data.objects.keys()):
        if name in {"PreviewCam", "Key", "Fill", "Rim"}:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -3.35, 1.12)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam

    def area(name, loc, energy):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = 2.4
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc

    area("Key", (1.7, -2.1, 2.5), 600)
    area("Fill", (-2.0, -1.3, 1.5), 200)
    area("Rim", (0.3, 2.3, 2.1), 260)

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.84, 0.84, 0.84, 1)
        bg.inputs[1].default_value = 1.0

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.filepath = str(PREVIEW)
    if arm.animation_data and "idle" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["idle"]
        scene.frame_set(25)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def export(arm, obj):
    select_only(arm)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = arm
    if arm.animation_data is None:
        arm.animation_data_create()
    while arm.animation_data.nla_tracks:
        arm.animation_data.nla_tracks.remove(arm.animation_data.nla_tracks[0])
    for name in ("idle", "talk", "wave"):
        if name in bpy.data.actions:
            t = arm.animation_data.nla_tracks.new()
            t.name = name
            t.strips.new(name, 1, bpy.data.actions[name])
    arm.animation_data.action = None
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_skins=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_draco_mesh_compression_enable=False,
    )
    print("exported", OUT_GLB, round(OUT_GLB.stat().st_size / 1e6, 2), "MB")


def main():
    # Fresh import from original Meshy + rebuild rig from previous blend armature actions
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC_GLB))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    src = meshes[0]
    src.name = "OstrichSource"
    normalize_character(src)

    # Append armature + actions from previous blend
    with bpy.data.libraries.load(str(BLEND)) as (data_from, data_to):
        data_to.objects = [name for name in data_from.objects if "Armature" in name]
        data_to.actions = list(data_from.actions)
    for obj in data_to.objects:
        if obj is not None:
            bpy.context.scene.collection.objects.link(obj)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    arm.name = "OstrichArmature"
    print("Imported actions", [a.name for a in bpy.data.actions])

    color_src, rough_src, normal_src = get_source_images(src)
    print("Source images", getattr(color_src, "name", None), getattr(rough_src, "name", None))

    clean = remesh_clean(src)
    normalize_character(clean)

    color_dst, rough_dst = project_textures(src, clean, color_src)
    # Fill remaining dark gaps with a soft blue fabric tone based on neighborhood later if needed

    mat = bpy.data.materials.new("OstrichLisaMat")
    mat.use_nodes = True
    clean.data.materials.clear()
    clean.data.materials.append(mat)
    build_lisa_material(mat, color_dst, rough_dst)

    src.hide_set(True)
    src.hide_render = True

    paint_weights(clean, arm)
    ensure_actions(arm)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    try:
        preview(arm, clean)
    except Exception as e:
        print("preview fail", e)
    export(arm, clean)

    # Stats
    dark = 0
    px = list(color_dst.pixels)
    n = len(px) // 4
    for i in range(0, len(px), 4):
        if px[i] + px[i + 1] + px[i + 2] < 0.15:
            dark += 1
    print(f"projected dark ratio {dark/n:.1%}")
    print("DONE")


if __name__ == "__main__":
    main()
