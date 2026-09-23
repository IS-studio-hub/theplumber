"""
Fix empty skin weights, enrich neck chain, recreate clips, re-export GLB.
"""
import bpy
import math
from mathutils import Vector
from pathlib import Path

BLEND = Path("/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend")
OUT_GLB = Path("/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb")
PREVIEW = Path("/tmp/lisa-character/preview2.png")


def bone_segment_distance(point, head, tail):
    """Distance from point to bone segment."""
    ab = tail - head
    length2 = ab.length_squared
    if length2 < 1e-12:
        return (point - head).length
    t = max(0.0, min(1.0, (point - head).dot(ab) / length2))
    proj = head + ab * t
    return (point - proj).length


def paint_proximity_weights(obj, arm, power=2.0, influence=0.35, max_influences=4):
    """Assign smooth skin weights by proximity to bone segments."""
    # Clear existing groups
    obj.vertex_groups.clear()

    # Collect deform bones (skip root helper if desired — keep it lightly)
    bones = [b for b in arm.data.bones if b.use_deform]
    groups = {b.name: obj.vertex_groups.new(name=b.name) for b in bones}

    # World-space bone heads/tails
    bone_segments = []
    for b in bones:
        head = arm.matrix_world @ b.head_local
        tail = arm.matrix_world @ b.tail_local
        # Longer bones / torso get slightly larger radius
        radius = max(0.08, (tail - head).length * 0.85)
        if b.name in {"hips", "spine", "chest", "root"}:
            radius *= 1.4
        if "neck" in b.name or b.name == "head":
            radius *= 1.15
        bone_segments.append((b.name, head, tail, radius))

    mw = obj.matrix_world
    for vi, vert in enumerate(obj.data.vertices):
        p = mw @ vert.co
        dists = []
        for name, head, tail, radius in bone_segments:
            d = bone_segment_distance(p, head, tail)
            # Soft falloff
            w = max(0.0, 1.0 - (d / (radius + influence)) ** power)
            if w > 0.001:
                dists.append((name, w))
        if not dists:
            # Assign to nearest bone fully
            nearest = min(
                bone_segments,
                key=lambda s: bone_segment_distance(p, s[1], s[2]),
            )
            groups[nearest[0]].add([vi], 1.0, "REPLACE")
            continue
        dists.sort(key=lambda x: x[1], reverse=True)
        dists = dists[:max_influences]
        total = sum(w for _, w in dists) or 1.0
        for name, w in dists:
            groups[name].add([vi], w / total, "REPLACE")

    # Ensure armature modifier
    mod = None
    for m in obj.modifiers:
        if m.type == "ARMATURE":
            mod = m
            break
    if not mod:
        mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    obj.parent = arm
    obj.parent_type = "OBJECT"

    weighted = sum(1 for v in obj.data.vertices if v.groups)
    print(f"Proximity weights: {weighted}/{len(obj.data.vertices)} verts weighted, groups={len(groups)}")


def ensure_neck_chain(arm, obj):
    """Add extra neck bones for smoother ostrich neck if missing."""
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    if "neck_01" in eb:
        bpy.ops.object.mode_set(mode="OBJECT")
        return

    if "neck" in eb and "chest" in eb and "head" in eb:
        chest = eb["chest"]
        head = eb["head"]
        # Remove old single neck
        if "neck" in eb:
            # reconnect head temporarily
            old = eb["neck"]
            n0_head = old.head.copy()
            n0_tail = old.tail.copy()
            parent_name = old.parent.name if old.parent else "chest"
            eb.remove(old)
        else:
            n0_head = chest.tail.copy()
            n0_tail = head.head.copy()
            parent_name = "chest"

        # Three neck bones
        span = head.head - chest.tail
        for i in range(3):
            b = eb.new(f"neck_0{i+1}")
            b.head = chest.tail + span * (i / 3.0)
            b.tail = chest.tail + span * ((i + 1) / 3.0)
            if i == 0:
                b.parent = eb[parent_name]
                b.use_connect = True
            else:
                b.parent = eb[f"neck_0{i}"]
                b.use_connect = True
        head.parent = eb["neck_03"]
        head.use_connect = True

    bpy.ops.object.mode_set(mode="OBJECT")
    print("Neck chain bones:", [b.name for b in arm.data.bones if "neck" in b.name])


def make_action(arm, name, frames, builder):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()

    # Replace existing
    if name in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[name])
    action = bpy.data.actions.new(name=name)
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
    print("Action", name)


def build_idle(arm, frames=60):
    bones = arm.pose.bones
    neck_bones = [n for n in ("neck_01", "neck_02", "neck_03", "neck") if n in bones]
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
        for i, n in enumerate(neck_bones):
            bones[n].rotation_mode = "XYZ"
            bones[n].rotation_euler = (
                math.radians((-1.5 - i) * amt),
                math.radians(1.5 * math.sin(amt * math.pi) * (1 if i % 2 == 0 else -1)),
                0,
            )
            bones[n].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(2 * amt), math.radians(-2 * math.sin(amt * math.pi)), 0)
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            name = f"upper_arm_{side}"
            if name in bones:
                bones[name].rotation_mode = "XYZ"
                bones[name].rotation_euler = (math.radians(2 * amt), math.radians(5 * amt * sign), math.radians(2 * amt))
                bones[name].keyframe_insert("rotation_euler", frame=f)
        if "hips" in bones:
            bones["hips"].location = (0, 0, 0.008 * amt)
            bones["hips"].keyframe_insert("location", frame=f)


def build_talk(arm, frames=40):
    bones = arm.pose.bones
    neck_bones = [n for n in ("neck_01", "neck_02", "neck_03", "neck") if n in bones]
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        wave = math.sin(t * math.pi * 4)
        nod = math.sin(t * math.pi * 2)
        bpy.context.scene.frame_set(f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(8 * nod), math.radians(5 * wave), math.radians(2 * wave))
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for i, n in enumerate(neck_bones):
            bones[n].rotation_mode = "XYZ"
            bones[n].rotation_euler = (math.radians((2 + i) * nod * 0.4), math.radians(2 * wave), 0)
            bones[n].keyframe_insert("rotation_euler", frame=f)
        if "chest" in bones:
            bones["chest"].rotation_mode = "XYZ"
            bones["chest"].rotation_euler = (math.radians(2 + 2 * abs(wave)), 0, math.radians(1.5 * wave))
            bones["chest"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            name = f"upper_arm_{side}"
            if name in bones:
                bones[name].rotation_mode = "XYZ"
                bones[name].rotation_euler = (
                    math.radians(10 * abs(wave)),
                    math.radians(12 * sign * (0.35 + 0.25 * wave)),
                    math.radians(4 * wave),
                )
                bones[name].keyframe_insert("rotation_euler", frame=f)


def build_wave(arm, frames=48):
    bones = arm.pose.bones
    for f, phase in [(1, 0.0), (frames // 3, 1.0), (2 * frames // 3, 0.35), (frames, 1.0)]:
        bpy.context.scene.frame_set(f)
        if "upper_arm_R" in bones:
            bones["upper_arm_R"].rotation_mode = "XYZ"
            bones["upper_arm_R"].rotation_euler = (math.radians(-75 * phase), math.radians(-15), math.radians(-8))
            bones["upper_arm_R"].keyframe_insert("rotation_euler", frame=f)
        if "forearm_R" in bones:
            bones["forearm_R"].rotation_mode = "XYZ"
            bones["forearm_R"].rotation_euler = (0, 0, math.radians(-15 - 30 * phase))
            bones["forearm_R"].keyframe_insert("rotation_euler", frame=f)
        if "head" in bones:
            bones["head"].rotation_mode = "XYZ"
            bones["head"].rotation_euler = (math.radians(4), math.radians(-10 * phase), 0)
            bones["head"].keyframe_insert("rotation_euler", frame=f)


def export_glb(arm, obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm

    if arm.animation_data is None:
        arm.animation_data_create()
    while arm.animation_data.nla_tracks:
        arm.animation_data.nla_tracks.remove(arm.animation_data.nla_tracks[0])
    for action_name in ("idle", "talk", "wave"):
        if action_name not in bpy.data.actions:
            continue
        track = arm.animation_data.nla_tracks.new()
        track.name = action_name
        track.strips.new(action_name, 1, bpy.data.actions[action_name])
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
        export_jpeg_quality=82,
        export_apply=False,
    )
    print("Exported", OUT_GLB, "MB", round(OUT_GLB.stat().st_size / 1e6, 2))


def preview(arm, obj):
    # Reuse / create camera
    cam = bpy.data.objects.get("PreviewCam")
    if not cam:
        cam_data = bpy.data.cameras.new("PreviewCam")
        cam = bpy.data.objects.new("PreviewCam", cam_data)
        bpy.context.scene.collection.objects.link(cam)
        cam.location = (0, -3.2, 1.1)
        cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam
    if arm.animation_data and "idle" in bpy.data.actions:
        arm.animation_data.action = bpy.data.actions["idle"]
    # Pose frame mid-idle to show deformation
    bpy.context.scene.frame_set(30)
    bpy.context.scene.render.filepath = str(PREVIEW)
    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 900
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    bpy.ops.render.render(write_still=True)
    print("Preview", PREVIEW)


def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    obj = bpy.data.objects["OstrichCharacter"]
    arm = bpy.data.objects["OstrichArmature"]

    ensure_neck_chain(arm, obj)
    paint_proximity_weights(obj, arm)
    make_action(arm, "idle", 60, build_idle)
    make_action(arm, "talk", 40, build_talk)
    make_action(arm, "wave", 48, build_wave)

    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    try:
        preview(arm, obj)
    except Exception as e:
        print("preview failed", e)
    export_glb(arm, obj)

    # Verify skin in re-import sanity: check weighted verts still
    weighted = sum(1 for v in obj.data.vertices if v.groups)
    print("FINAL weighted verts", weighted)
    print("DONE")


if __name__ == "__main__":
    main()
