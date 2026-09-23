"""
Refine + rig Meshy ostrich character for web (LISA-style stage).
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix, Euler
from pathlib import Path

SRC = Path("/Users/shamrikin/Downloads/Meshy_AI_Blue_Hoodie_Ostrich_P_0918141516_texture.glb")
OUT_DIR = Path("/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character")
OUT_GLB = OUT_DIR / "ostrich.glb"
OUT_BLEND = OUT_DIR / "ostrich_rigged.blend"
PREVIEW = Path("/tmp/lisa-character/preview.png")

TARGET_FACES = 45000


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model():
    bpy.ops.import_scene.gltf(filepath=str(SRC))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh found")
    # Join if multiple
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_c = Vector((min(v.x for v in corners), min(v.y for v in corners), min(v.z for v in corners)))
    max_c = Vector((max(v.x for v in corners), max(v.y for v in corners), max(v.z for v in corners)))
    return min_c, max_c, max_c - min_c


def normalize_transform(obj):
    # Apply existing transforms
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    min_c, max_c, size = world_bounds(obj)
    # Put origin at bottom center
    center = (min_c + max_c) * 0.5
    bottom = Vector((center.x, center.y, min_c.z))
    bpy.context.scene.cursor.location = bottom
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    obj.location = (0, 0, 0)

    # Scale so height ~= 1.7m
    min_c, max_c, size = world_bounds(obj)
    height = size.z if size.z > 1e-6 else max(size)
    scale = 1.7 / height
    obj.scale = (scale, scale, scale)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # Re-ground
    min_c, max_c, size = world_bounds(obj)
    obj.location.z -= min_c.z
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    print("Normalized size", tuple(round(v, 4) for v in world_bounds(obj)[2]))


def decimate(obj, target_faces=TARGET_FACES):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    me = obj.data
    faces = len(me.polygons)
    print(f"Faces before decimate: {faces}")
    if faces <= target_faces:
        print("Already under target")
        return

    ratio = max(0.01, target_faces / faces)
    mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # Mild smooth shade + auto smooth feel via custom normals off
    bpy.ops.object.shade_smooth()
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = math.radians(60)
    print(f"Faces after decimate: {len(obj.data.polygons)} verts={len(obj.data.vertices)}")


def improve_materials(obj):
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        # Slightly richer look
        if "Specular IOR Level" in bsdf.inputs:
            bsdf.inputs["Specular IOR Level"].default_value = 0.4
        if "Roughness" in bsdf.inputs and not bsdf.inputs["Roughness"].is_linked:
            bsdf.inputs["Roughness"].default_value = 0.55
        mat.use_backface_culling = True


def create_armature(obj):
    min_c, max_c, size = world_bounds(obj)
    h = size.z
    w = size.x
    d = size.y

    bpy.ops.object.armature_add(enter_editmode=True, location=(0, 0, 0))
    arm = bpy.context.object
    arm.name = "OstrichArmature"
    arm.data.name = "OstrichArmature"
    eb = arm.data.edit_bones
    # Remove default bone
    for b in list(eb):
        eb.remove(b)

    def add_bone(name, head, tail, parent=None, connect=False):
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        if parent:
            b.parent = eb[parent]
            b.use_connect = connect
        return b

    # Proportions tuned for biped/bird-like hoodie character
    add_bone("root", (0, 0, 0), (0, 0, 0.05))
    add_bone("hips", (0, 0, h * 0.42), (0, 0, h * 0.50), "root")
    add_bone("spine", (0, 0, h * 0.50), (0, 0, h * 0.62), "hips", True)
    add_bone("chest", (0, 0, h * 0.62), (0, 0, h * 0.74), "spine", True)
    add_bone("neck", (0, 0, h * 0.74), (0, 0, h * 0.86), "chest", True)
    add_bone("head", (0, 0, h * 0.86), (0, 0, h * 0.98), "neck", True)

    # Keep bones near Y=0 — mesh is very thin in depth after import
    # Arms
    add_bone("shoulder_L", (w * 0.08, 0, h * 0.72), (w * 0.20, 0, h * 0.71), "chest")
    add_bone("upper_arm_L", (w * 0.20, 0, h * 0.71), (w * 0.30, 0, h * 0.55), "shoulder_L", True)
    add_bone("forearm_L", (w * 0.30, 0, h * 0.55), (w * 0.34, 0, h * 0.40), "upper_arm_L", True)
    add_bone("hand_L", (w * 0.34, 0, h * 0.40), (w * 0.36, 0, h * 0.34), "forearm_L", True)

    add_bone("shoulder_R", (-w * 0.08, 0, h * 0.72), (-w * 0.20, 0, h * 0.71), "chest")
    add_bone("upper_arm_R", (-w * 0.20, 0, h * 0.71), (-w * 0.30, 0, h * 0.55), "shoulder_R", True)
    add_bone("forearm_R", (-w * 0.30, 0, h * 0.55), (-w * 0.34, 0, h * 0.40), "upper_arm_R", True)
    add_bone("hand_R", (-w * 0.34, 0, h * 0.40), (-w * 0.36, 0, h * 0.34), "forearm_R", True)

    # Legs
    add_bone("thigh_L", (w * 0.07, 0, h * 0.42), (w * 0.09, 0, h * 0.24), "hips")
    add_bone("shin_L", (w * 0.09, 0, h * 0.24), (w * 0.09, 0, h * 0.06), "thigh_L", True)
    add_bone("foot_L", (w * 0.09, 0, h * 0.06), (w * 0.09, 0.08, 0.01), "shin_L", True)

    add_bone("thigh_R", (-w * 0.07, 0, h * 0.42), (-w * 0.09, 0, h * 0.24), "hips")
    add_bone("shin_R", (-w * 0.09, 0, h * 0.24), (-w * 0.09, 0, h * 0.06), "thigh_R", True)
    add_bone("foot_R", (-w * 0.09, 0, h * 0.06), (-w * 0.09, 0.08, 0.01), "shin_R", True)

    bpy.ops.object.mode_set(mode="OBJECT")

    # Ensure mesh is clean for heat weighting
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Parent with automatic weights
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    # Count weighted vertices (ignore heat-weight warnings — often partial)
    weighted = 0
    for vg in obj.vertex_groups:
        for i, _ in enumerate(obj.data.vertices):
            try:
                vg.weight(i)
                weighted += 1
                break
            except RuntimeError:
                continue
    # Faster check: any group has users
    has_weights = any(True for _ in obj.vertex_groups)
    print("Vertex groups:", len(obj.vertex_groups), "has_groups:", has_weights)

    if len(obj.vertex_groups) == 0:
        print("No weights — envelope fallback")
        obj.parent = None
        mod = obj.modifiers.get("Armature")
        if mod:
            obj.modifiers.remove(mod)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")

    print("Armature bound, bones:", len(arm.data.bones))
    return arm


def ensure_pose_mode(arm):
    # Always return to OBJECT first to avoid invalid context
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")


def make_action(arm, name, frames, builder):
    ensure_pose_mode(arm)
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()
    action = bpy.data.actions.new(name=name)
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    builder(arm, frames)
    for fcurve in action.fcurves:
        # Avoid duplicate cycles modifiers
        if not any(m.type == "CYCLES" for m in fcurve.modifiers):
            mod = fcurve.modifiers.new("CYCLES")
            mod.mode_before = "REPEAT"
            mod.mode_after = "REPEAT"
    bpy.ops.object.mode_set(mode="OBJECT")
    print(f"Created action {name} ({frames} frames)")
    return action


def build_idle(arm, frames=60):
    bones = arm.pose.bones
    for f, amt in [(1, 0.0), (frames // 2, 1.0), (frames, 0.0)]:
        bpy.context.scene.frame_set(f)
        # Breath
        if "chest" in bones:
            bones["chest"].rotation_mode = "XYZ"
            bones["chest"].rotation_euler = (math.radians(3 * amt), 0, 0)
            bones["chest"].keyframe_insert("rotation_euler", frame=f)
        if "spine" in bones:
            bones["spine"].rotation_mode = "XYZ"
            bones["spine"].rotation_euler = (math.radians(1.5 * amt), 0, 0)
            bones["spine"].keyframe_insert("rotation_euler", frame=f)
        if "neck" in bones:
            bones["neck"].rotation_mode = "XYZ"
            bones["neck"].rotation_euler = (math.radians(-2 * amt), math.radians(2 * math.sin(amt * math.pi)), 0)
            bones["neck"].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(2 * amt), math.radians(-2 * math.sin(amt * math.pi)), 0)
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        # Subtle arm sway
        for side, sign in (("L", 1), ("R", -1)):
            name = f"upper_arm_{side}"
            if name in bones:
                bones[name].rotation_mode = "XYZ"
                bones[name].rotation_euler = (
                    math.radians(4 * amt * sign * 0.2),
                    math.radians(6 * amt * sign),
                    math.radians(3 * amt),
                )
                bones[name].keyframe_insert("rotation_euler", frame=f)
        if "hips" in bones:
            bones["hips"].location = (0, 0, 0.01 * amt)
            bones["hips"].keyframe_insert("location", frame=f)


def build_talk(arm, frames=40):
    bones = arm.pose.bones
    for f in range(1, frames + 1):
        t = (f - 1) / (frames - 1)
        wave = math.sin(t * math.pi * 4)
        nod = math.sin(t * math.pi * 2)
        bpy.context.scene.frame_set(f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (
                math.radians(6 * nod),
                math.radians(4 * wave),
                math.radians(2 * wave),
            )
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        if "neck" in bones:
            bones["neck"].rotation_mode = "XYZ"
            bones["neck"].rotation_euler = (
                math.radians(3 * nod),
                math.radians(3 * wave),
                0,
            )
            bones["neck"].keyframe_insert("rotation_euler", frame=f)
        if "chest" in bones:
            bones["chest"].rotation_mode = "XYZ"
            bones["chest"].rotation_euler = (math.radians(2 + 2 * abs(wave)), 0, math.radians(wave))
            bones["chest"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            name = f"upper_arm_{side}"
            if name in bones:
                bones[name].rotation_mode = "XYZ"
                bones[name].rotation_euler = (
                    math.radians(8 * abs(wave)),
                    math.radians(10 * sign * (0.4 + 0.3 * wave)),
                    math.radians(5 * wave),
                )
                bones[name].keyframe_insert("rotation_euler", frame=f)


def build_wave(arm, frames=48):
    bones = arm.pose.bones
    for f, phase in [(1, 0), (frames // 3, 1), (2 * frames // 3, 0), (frames, 1)]:
        bpy.context.scene.frame_set(f)
        if "upper_arm_R" in bones:
            bones["upper_arm_R"].rotation_mode = "XYZ"
            bones["upper_arm_R"].rotation_euler = (
                math.radians(-70 * phase),
                math.radians(-20),
                math.radians(-10),
            )
            bones["upper_arm_R"].keyframe_insert("rotation_euler", frame=f)
        if "forearm_R" in bones:
            bones["forearm_R"].rotation_mode = "XYZ"
            bones["forearm_R"].rotation_euler = (0, 0, math.radians(-20 - 25 * phase))
            bones["forearm_R"].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(5), math.radians(-8 * phase), 0)
            bones["head"].keyframe_insert("rotation_euler", frame=f)


def setup_scene_preview(arm, obj):
    # Camera + light for preview render
    bpy.ops.object.mode_set(mode="OBJECT")
    cam_data = bpy.data.cameras.new("PreviewCam")
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -3.2, 1.1)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam

    light_data = bpy.data.lights.new(name="Key", type="AREA")
    light_data.energy = 400
    light = bpy.data.objects.new(name="Key", object_data=light_data)
    bpy.context.scene.collection.objects.link(light)
    light.location = (1.5, -2.0, 2.5)

    fill_data = bpy.data.lights.new(name="Fill", type="AREA")
    fill_data.energy = 120
    fill = bpy.data.objects.new(name="Fill", object_data=fill_data)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = (-2.0, -1.0, 1.5)

    world = bpy.context.scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.82, 0.82, 0.82, 1)
        bg.inputs[1].default_value = 1.0

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in dir(bpy.types) or True else "BLENDER_EEVEE"
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.filepath = str(PREVIEW)
    # play idle
    if arm.animation_data and "idle" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["idle"]
    scene.frame_set(1)
    bpy.ops.render.render(write_still=True)
    print("Wrote preview", PREVIEW)


def export_glb(arm, obj):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm

    # Assign actions as NLA tracks so glTF exports multiple animations
    if arm.animation_data is None:
        arm.animation_data_create()
    # clear nla
    while arm.animation_data.nla_tracks:
        arm.animation_data.nla_tracks.remove(arm.animation_data.nla_tracks[0])

    for action_name in ("idle", "talk", "wave"):
        if action_name not in bpy.data.actions:
            continue
        track = arm.animation_data.nla_tracks.new()
        track.name = action_name
        strip = track.strips.new(action_name, 1, bpy.data.actions[action_name])
        strip.name = action_name

    arm.animation_data.action = None

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_nla_strips=True,
        export_morph=False,
        export_skins=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_apply=False,
    )
    print("Exported", OUT_GLB, "size_mb", round(OUT_GLB.stat().st_size / 1e6, 2))


def main():
    clear_scene()
    obj = import_model()
    obj.name = "OstrichCharacter"
    normalize_transform(obj)
    decimate(obj)
    improve_materials(obj)
    arm = create_armature(obj)

    make_action(arm, "idle", 60, lambda a, f: build_idle(a, f))
    make_action(arm, "talk", 40, lambda a, f: build_talk(a, f))
    make_action(arm, "wave", 48, lambda a, f: build_wave(a, f))

    bpy.ops.object.mode_set(mode="OBJECT")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND))
    print("Saved blend", OUT_BLEND)

    try:
        setup_scene_preview(arm, obj)
    except Exception as e:
        print("Preview render skipped:", e)

    export_glb(arm, obj)
    print("DONE")


if __name__ == "__main__":
    main()
