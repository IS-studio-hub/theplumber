"""
Rebuild ostrich toward LISA studio quality from original Meshy GLB.
Keeps original UVs (no remesh/bake), denser decimation, careful cleanup,
soft materials, full armature + idle/talk/wave, studio preview + GLB export.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SRC = Path("/Users/shamrikin/Downloads/Meshy_AI_Blue_Hoodie_Ostrich_P_0918141516_texture.glb")
OUT_DIR = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character"
)
OUT_GLB = OUT_DIR / "ostrich.glb"
OUT_BLEND = OUT_DIR / "ostrich_rigged.blend"
TMP_BLEND = Path("/tmp/lisa-character/ostrich_lisa_quality.blend")
PREVIEW = Path("/tmp/lisa-character/lisa_quality_preview.png")
TARGET_FACES = 110000


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


def normalize(obj, height=1.7):
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx, size = world_bounds(obj)
    center = (mn + mx) * 0.5
    bpy.context.scene.cursor.location = Vector((center.x, center.y, mn.z))
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.location = (0, 0, 0)
    mn, mx, size = world_bounds(obj)
    s = height / max(size.z, 1e-6)
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx, size = world_bounds(obj)
    obj.location.z -= mn.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    print("size", tuple(round(v, 4) for v in world_bounds(obj)[2]))


def clean_mesh(obj):
    select_only(obj)
    print("before clean", len(obj.data.vertices), "v", len(obj.data.polygons), "f")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.00025)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.00005)
    bpy.ops.mesh.delete_loose()
    bpy.ops.mesh.normals_make_consistent(inside=False)

    # Drop tiny disconnected scraps (keep largest island)
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.mesh.select_loose()
    bpy.ops.mesh.delete(type="VERT")

    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Keep largest connected component only
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    islands = []
    seen = set()
    for v in bm.verts:
        if v.index in seen:
            continue
        stack = [v]
        island = []
        seen.add(v.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
        islands.append(island)
    if len(islands) > 1:
        islands.sort(key=len, reverse=True)
        # Keep body + any island with enough mass (shoes / accessories)
        threshold = max(80, int(len(islands[0]) * 0.002))
        keep = set()
        kept_n = 0
        for island in islands:
            if len(island) >= threshold:
                keep.update(island)
                kept_n += 1
        drop = [v for v in bm.verts if v not in keep]
        if drop:
            bmesh.ops.delete(bm, geom=drop, context="VERTS")
        print("islands", len(islands), "kept", kept_n, "verts", len(keep))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    bpy.ops.object.shade_smooth()
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(50)

    print("after clean", len(obj.data.vertices), "v", len(obj.data.polygons), "f")


def soft_sculpt(obj):
    """Very light surface soften — LISA product look without melting detail."""
    select_only(obj)
    try:
        lap = obj.modifiers.new("LapSmooth", "LAPLACIANSMOOTH")
        lap.iterations = 2
        lap.lambda_factor = 0.18
        lap.use_volume_preserve = True
        bpy.ops.object.modifier_apply(modifier=lap.name)
    except Exception as e:
        print("lap skip", e)
    try:
        mod = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        mod.keep_sharp = False
        mod.weight = 50
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        print("wn skip", e)


def decimate(obj, target=TARGET_FACES):
    faces = len(obj.data.polygons)
    print("faces before decimate", faces)
    if faces <= target:
        return
    select_only(obj)
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = max(0.02, target / faces)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    print("faces after decimate", len(obj.data.polygons))


def polish_material(obj):
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue

        def set_if(name, value):
            if name in bsdf.inputs and not bsdf.inputs[name].is_linked:
                bsdf.inputs[name].default_value = value

        set_if("Metallic", 0.0)
        set_if("Specular IOR Level", 0.38)
        set_if("Roughness", 0.46)
        set_if("Coat Weight", 0.18)
        set_if("Coat Roughness", 0.26)
        set_if("Sheen Weight", 0.3)
        set_if("Sheen Roughness", 0.38)
        if "Subsurface Weight" in bsdf.inputs and not bsdf.inputs["Subsurface Weight"].is_linked:
            bsdf.inputs["Subsurface Weight"].default_value = 0.04

        base = bsdf.inputs.get("Base Color")
        if base and base.is_linked and base.links[0].from_node.type != "BRIGHTCONTRAST":
            from_node = base.links[0].from_node
            from_socket = base.links[0].from_socket
            bright = nt.nodes.new("ShaderNodeBrightContrast")
            bright.location = (from_node.location.x + 180, from_node.location.y)
            bright.inputs["Bright"].default_value = 0.04
            bright.inputs["Contrast"].default_value = 0.14
            nt.links.new(from_socket, bright.inputs["Color"])
            for link in list(base.links):
                nt.links.remove(link)
            nt.links.new(bright.outputs["Color"], base)

        rough = bsdf.inputs.get("Roughness")
        if rough and rough.is_linked and rough.links[0].from_node.type == "TEX_IMAGE":
            tex = rough.links[0].from_node
            ramp = nt.nodes.new("ShaderNodeMapRange")
            ramp.location = (tex.location.x + 200, tex.location.y)
            ramp.inputs["To Min"].default_value = 0.28
            ramp.inputs["To Max"].default_value = 0.65
            for link in list(rough.links):
                nt.links.remove(link)
            nt.links.new(tex.outputs["Color"], ramp.inputs["Value"])
            nt.links.new(ramp.outputs["Result"], rough)

        # Critical for Meshy open shells — never cull backfaces
        mat.use_backface_culling = False
        print("material", mat.name)


def create_armature(obj):
    mn, mx, size = world_bounds(obj)
    h, w = size.z, size.x

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "OstrichArmature"
    eb = arm.data.edit_bones
    for b in list(eb):
        eb.remove(b)

    def add(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = parent
            b.use_connect = connect
        return b

    root = add("root", (0, 0, 0), (0, 0, 0.05))
    hips = add("hips", (0, 0, h * 0.48), (0, 0, h * 0.55), root)
    spine = add("spine", hips.tail, (0, 0, h * 0.62), hips, True)
    chest = add("chest", spine.tail, (0, 0, h * 0.72), spine, True)
    neck1 = add("neck_01", chest.tail, (0, 0, h * 0.8), chest, True)
    neck2 = add("neck_02", neck1.tail, (0, 0, h * 0.88), neck1, True)
    neck3 = add("neck_03", neck2.tail, (0, 0, h * 0.94), neck2, True)
    add("head", neck3.tail, (0, 0, h * 1.02), neck3, True)

    for side, sx in (("L", 1), ("R", -1)):
        clav = add(
            f"clavicle_{side}",
            (sx * w * 0.06, 0, h * 0.7),
            (sx * w * 0.14, 0, h * 0.7),
            chest,
        )
        ua = add(
            f"upper_arm_{side}",
            clav.tail,
            (sx * w * 0.32, 0, h * 0.58),
            clav,
            True,
        )
        fa = add(
            f"forearm_{side}",
            ua.tail,
            (sx * w * 0.42, 0, h * 0.42),
            ua,
            True,
        )
        add(f"hand_{side}", fa.tail, (sx * w * 0.46, 0, h * 0.38), fa, True)

        thigh = add(
            f"thigh_{side}",
            (sx * w * 0.07, 0, h * 0.48),
            (sx * w * 0.08, 0, h * 0.28),
            hips,
        )
        shin = add(
            f"shin_{side}",
            thigh.tail,
            (sx * w * 0.08, 0, h * 0.08),
            thigh,
            True,
        )
        add(f"foot_{side}", shin.tail, (sx * w * 0.08, -0.08, 0.02), shin, True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def paint_weights(obj, arm):
    obj.vertex_groups.clear()
    for m in list(obj.modifiers):
        if m.type == "ARMATURE":
            obj.modifiers.remove(m)
    if obj.parent:
        select_only(obj)
        bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    bones = [b for b in arm.data.bones if b.use_deform]
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in bones}
    segs = []
    for b in bones:
        head = arm.matrix_world @ b.head_local
        tail = arm.matrix_world @ b.tail_local
        radius = max(0.07, (tail - head).length * 0.9)
        if b.name in {"hips", "spine", "chest", "root"}:
            radius *= 1.45
        if "neck" in b.name or b.name == "head":
            radius *= 1.3
        segs.append((b.name, head, tail, radius))

    def dist(p, head, tail):
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
            d = dist(p, head, tail)
            w = max(0.0, 1.0 - (d / (radius + 0.28)) ** 2)
            if w > 0.001:
                weights.append((name, w))
        if not weights:
            nearest = min(segs, key=lambda s: dist(p, s[1], s[2]))
            groups[nearest[0]].add([vi], 1.0, "REPLACE")
            continue
        weights.sort(key=lambda x: x[1], reverse=True)
        weights = weights[:4]
        total = sum(w for _, w in weights) or 1.0
        for name, w in weights:
            groups[name].add([vi], w / total, "REPLACE")

    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm
    print("weighted", sum(1 for v in obj.data.vertices if v.groups), "/", len(obj.data.vertices))


def make_action(arm, name, frames, builder):
    select_only(arm)
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    builder(arm, frames)
    for fc in action.fcurves:
        if not any(m.type == "CYCLES" for m in fc.modifiers):
            m = fc.modifiers.new("CYCLES")
            m.mode_before = "REPEAT"
            m.mode_after = "REPEAT"
    bpy.ops.object.mode_set(mode="OBJECT")
    print("action", name)


def build_idle(arm, frames=60):
    bones = arm.pose.bones
    necks = [n for n in ("neck_01", "neck_02", "neck_03") if n in bones]
    for f, amt in [(1, 0.0), (frames // 2, 1.0), (frames, 0.0)]:
        bpy.context.scene.frame_set(f)
        if "chest" in bones:
            bones["chest"].rotation_mode = "XYZ"
            bones["chest"].rotation_euler = (math.radians(2.5 * amt), 0, 0)
            bones["chest"].keyframe_insert("rotation_euler", frame=f)
        if "spine" in bones:
            bones["spine"].rotation_mode = "XYZ"
            bones["spine"].rotation_euler = (math.radians(1.2 * amt), 0, 0)
            bones["spine"].keyframe_insert("rotation_euler", frame=f)
        for i, n in enumerate(necks):
            bones[n].rotation_mode = "XYZ"
            bones[n].rotation_euler = (
                math.radians((-1.5 - i) * amt),
                math.radians(1.5 * math.sin(amt * math.pi) * (1 if i % 2 == 0 else -1)),
                0,
            )
            bones[n].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (
                math.radians(2 * amt),
                math.radians(-2 * math.sin(amt * math.pi)),
                0,
            )
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            b = f"upper_arm_{side}"
            if b in bones:
                bones[b].rotation_mode = "XYZ"
                bones[b].rotation_euler = (
                    math.radians(2 * amt),
                    math.radians(5 * amt * sign),
                    math.radians(2 * amt),
                )
                bones[b].keyframe_insert("rotation_euler", frame=f)
        if "hips" in bones:
            bones["hips"].location = (0, 0, 0.008 * amt)
            bones["hips"].keyframe_insert("location", frame=f)


def build_talk(arm, frames=40):
    bones = arm.pose.bones
    necks = [n for n in ("neck_01", "neck_02", "neck_03") if n in bones]
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        wave = math.sin(t * math.pi * 4)
        nod = math.sin(t * math.pi * 2)
        bpy.context.scene.frame_set(f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (
                math.radians(8 * nod),
                math.radians(5 * wave),
                math.radians(2 * wave),
            )
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for i, n in enumerate(necks):
            bones[n].rotation_mode = "XYZ"
            bones[n].rotation_euler = (
                math.radians((2 + i) * nod * 0.4),
                math.radians(2 * wave),
                0,
            )
            bones[n].keyframe_insert("rotation_euler", frame=f)
        if "chest" in bones:
            bones["chest"].rotation_mode = "XYZ"
            bones["chest"].rotation_euler = (
                math.radians(2 + 2 * abs(wave)),
                0,
                math.radians(1.5 * wave),
            )
            bones["chest"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            b = f"upper_arm_{side}"
            if b in bones:
                bones[b].rotation_mode = "XYZ"
                bones[b].rotation_euler = (
                    math.radians(10 * abs(wave)),
                    math.radians(12 * sign * (0.35 + 0.25 * wave)),
                    math.radians(4 * wave),
                )
                bones[b].keyframe_insert("rotation_euler", frame=f)


def build_wave(arm, frames=48):
    bones = arm.pose.bones
    for f, phase in [(1, 0.0), (frames // 3, 1.0), (2 * frames // 3, 0.35), (frames, 1.0)]:
        bpy.context.scene.frame_set(f)
        if "upper_arm_R" in bones:
            bones["upper_arm_R"].rotation_mode = "XYZ"
            bones["upper_arm_R"].rotation_euler = (
                math.radians(-75 * phase),
                math.radians(-15),
                math.radians(-8),
            )
            bones["upper_arm_R"].keyframe_insert("rotation_euler", frame=f)
        if "forearm_R" in bones:
            bones["forearm_R"].rotation_mode = "XYZ"
            bones["forearm_R"].rotation_euler = (0, 0, math.radians(-15 - 30 * phase))
            bones["forearm_R"].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(4), math.radians(-10 * phase), 0)
            bones["head"].keyframe_insert("rotation_euler", frame=f)


def preview(arm, obj):
    for name in list(bpy.data.objects.keys()):
        if name in {"PreviewCam", "Key", "Fill", "Rim", "Floor"}:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.35, -3.5, 1.15)
    cam.rotation_euler = (math.radians(88), 0, math.radians(6))
    bpy.context.scene.camera = cam

    def area(name, loc, energy, size=2.8):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc
        return o

    area("Key", (2.0, -2.2, 2.8), 900)
    area("Fill", (-2.4, -1.4, 1.6), 280)
    area("Rim", (0.1, 2.6, 2.4), 360)

    floor = bpy.data.objects.new(
        "Floor", bpy.data.meshes.new("Floor")
    )
    bpy.context.scene.collection.objects.link(floor)
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, radius=3.2, segments=64)
    bm.to_mesh(floor.data)
    bm.free()
    floor.rotation_euler = (math.radians(90), 0, 0)
    floor.location.z = 0.001
    mat = bpy.data.materials.new("FloorMat")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.82, 0.82, 0.82, 1)
    bsdf.inputs["Roughness"].default_value = 0.92
    floor.data.materials.append(mat)

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.86, 0.86, 0.86, 1)
        bg.inputs[1].default_value = 1.15

    # Force double-sided display for preview
    for slot in obj.material_slots:
        if slot.material:
            slot.material.use_backface_culling = False

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.render.resolution_x = 960
    scene.render.resolution_y = 1200
    scene.render.filepath = str(PREVIEW)
    scene.render.film_transparent = False
    if arm.animation_data and "idle" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["idle"]
        scene.frame_set(30)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def export(arm, obj):
    select_only(arm)
    obj.select_set(True)
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
        export_texcoords=True,
        export_normals=True,
        export_image_format="JPEG",
        export_jpeg_quality=92,
        export_draco_mesh_compression_enable=False,
    )
    print("exported", OUT_GLB, round(OUT_GLB.stat().st_size / 1e6, 2), "MB")


def main():
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    obj = meshes[0]
    for extra in meshes[1:]:
        bpy.data.objects.remove(extra, do_unlink=True)
    obj.name = "OstrichCharacter"

    normalize(obj)
    clean_mesh(obj)
    decimate(obj, TARGET_FACES)
    soft_sculpt(obj)
    polish_material(obj)

    arm = create_armature(obj)
    paint_weights(obj, arm)
    make_action(arm, "idle", 60, build_idle)
    make_action(arm, "talk", 40, build_talk)
    make_action(arm, "wave", 48, build_wave)

    TMP_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP_BLEND))
    shutil.copy2(TMP_BLEND, OUT_BLEND)

    try:
        preview(arm, obj)
    except Exception as e:
        print("preview fail", e)

    export(arm, obj)
    print("DONE", len(obj.data.polygons), "faces")


if __name__ == "__main__":
    main()
