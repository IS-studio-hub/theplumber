"""
Rebuild ostrich animations to match reference walk-while-listening-to-music video:
- natural in-place walk cycle (hips, legs, arm swing)
- one hand holding phone at chest
- free arm swings with gait
- ostrich neck bob / sway
- soft finger/wrist curl via hand bones
- simple phone prop parented to hand
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb"
)
TMP = Path("/tmp/lisa-character/ostrich_walk_music.blend")
PREVIEW = Path("/tmp/lisa-character/walk_music_preview.png")


def select_only(obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def ensure_phone(arm):
    """Simple black phone prop parented to left hand (holding music)."""
    if "PhoneProp" in bpy.data.objects:
        phone = bpy.data.objects["PhoneProp"]
    else:
        bpy.ops.mesh.primitive_cube_add(size=1)
        phone = bpy.context.object
        phone.name = "PhoneProp"
        phone.scale = (0.04, 0.007, 0.08)
        bpy.ops.object.transform_apply(scale=True)
        mat = bpy.data.materials.new("PhoneMat")
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (0.04, 0.04, 0.05, 1)
        bsdf.inputs["Roughness"].default_value = 0.35
        bsdf.inputs["Metallic"].default_value = 0.4
        phone.data.materials.append(mat)

    # Parent to hand_L bone
    phone.parent = arm
    phone.parent_type = "BONE"
    phone.parent_bone = "hand_L"
    # Offset into palm (bone-local: along -Y / slightly forward)
    phone.location = (0.02, -0.04, 0.01)
    phone.rotation_euler = (math.radians(15), math.radians(8), math.radians(90))
    print("phone parented to hand_L")
    return phone


def remake_action(arm, name, frames, builder):
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
    print("action", name, "frames", frames)


def set_rot(bone, xyz, frame):
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = tuple(math.radians(v) for v in xyz)
    bone.keyframe_insert("rotation_euler", frame=frame)


def set_loc(bone, xyz, frame):
    bone.location = xyz
    bone.keyframe_insert("location", frame=frame)


def pose_phone_arm(bones, side="L", frame=1, lift=1.0, breath=0.0):
    """Bent elbow, hand at chest holding phone — matches reference."""
    sign = 1 if side == "L" else -1
    ua = f"upper_arm_{side}"
    fa = f"forearm_{side}"
    hand = f"hand_{side}"
    if ua in bones:
        # Drop from T + bring forward; lift scales how high phone sits
        set_rot(
            bones[ua],
            (
                18 + 6 * lift + 2 * breath,
                55 * sign,
                72 * sign + 4 * breath * sign,
            ),
            frame,
        )
    if fa in bones:
        # Strong elbow bend to bring hand to chest
        set_rot(bones[fa], (95 + 8 * lift, 5 * sign, 10 * sign), frame)
    if hand in bones:
        # Wrist curl / grip around phone
        set_rot(bones[hand], (20, -15 * sign, 25 * sign), frame)


def pose_swing_arm(bones, side="R", frame=1, phase=0.0, amp=1.0):
    """Natural walking arm swing on free side."""
    sign = 1 if side == "L" else -1
    # phase: -1 back, +1 forward
    ua = f"upper_arm_{side}"
    fa = f"forearm_{side}"
    hand = f"hand_{side}"
    swing = 28 * phase * amp
    if ua in bones:
        set_rot(
            bones[ua],
            (
                12 + swing * 0.35,
                8 * sign,
                78 * sign + swing * 0.15 * sign,
            ),
            frame,
        )
    if fa in bones:
        set_rot(bones[fa], (18 + abs(phase) * 10 * amp, 0, 8 * sign), frame)
    if hand in bones:
        # Soft open hand with slight finger curl feel
        set_rot(bones[hand], (8 + abs(phase) * 4, -6 * sign, 12 * sign), frame)


def pose_legs(bones, frame, phase):
    """In-place walk: phase 0..1, opposite legs."""
    # phase radians through cycle
    a = math.sin(phase * math.pi * 2)
    b = math.sin(phase * math.pi * 2 + math.pi)  # opposite
    for side, s, ph in (("L", 1, a), ("R", -1, b)):
        thigh = f"thigh_{side}"
        shin = f"shin_{side}"
        foot = f"foot_{side}"
        if thigh in bones:
            set_rot(bones[thigh], (22 * ph, 3 * s, 0), frame)
        if shin in bones:
            # Knee bends more on lift
            lift = max(0.0, -ph)
            set_rot(bones[shin], (35 * lift, 0, 0), frame)
        if foot in bones:
            set_rot(bones[foot], (-8 * ph, 0, 0), frame)


def pose_neck_bob(bones, frame, phase, amp=1.0):
    necks = [n for n in ("neck_01", "neck_02", "neck_03") if n in bones]
    bob = math.sin(phase * math.pi * 2)
    sway = math.sin(phase * math.pi * 2 + 0.6)
    for i, n in enumerate(necks):
        set_rot(
            bones[n],
            (
                (-1.2 - i * 0.5) * bob * amp,
                2.5 * sway * amp * (1 if i % 2 == 0 else -0.6),
                0.8 * bob * amp,
            ),
            frame,
        )
    if "head" in bones:
        set_rot(
            bones["head"],
            (3 * bob * amp, -4 * sway * amp, 1.5 * bob * amp),
            frame,
        )


def build_idle(arm, frames=48):
    """Music-listening walk-in-place — mirrors reference gait + phone hand."""
    bones = arm.pose.bones
    for f in range(1, frames + 1):
        t = (f - 1) / frames
        phase = t  # 0..1 loop
        bpy.context.scene.frame_set(f)

        # Hip sway + vertical bounce like walking
        if "hips" in bones:
            sway = math.sin(phase * math.pi * 2)
            set_loc(bones["hips"], (0.012 * sway, 0, 0.01 * abs(math.sin(phase * math.pi * 2))), f)
            set_rot(bones["hips"], (2 * abs(sway), 6 * sway, 0), f)
        if "spine" in bones:
            set_rot(bones["spine"], (1.5 * abs(math.sin(phase * math.pi * 2)), 3 * math.sin(phase * math.pi * 2), 0), f)
        if "chest" in bones:
            set_rot(bones["chest"], (2.5 * abs(math.sin(phase * math.pi * 2)), 4 * math.sin(phase * math.pi * 2), 0), f)

        pose_legs(bones, f, phase)
        pose_neck_bob(bones, f, phase, amp=1.0)

        # Phone arm steady with tiny breath; free arm swings opposite to L leg
        breath = 0.5 + 0.5 * math.sin(phase * math.pi * 2)
        pose_phone_arm(bones, "L", f, lift=1.0, breath=breath * 0.4)
        # Right arm swings: forward when right leg back
        swing_phase = math.sin(phase * math.pi * 2 + math.pi)
        pose_swing_arm(bones, "R", f, phase=swing_phase, amp=1.0)


def build_talk(arm, frames=40):
    """Same music stance, freer head nods + slight phone gesture."""
    bones = arm.pose.bones
    for f in range(1, frames + 1):
        t = (f - 1) / max(1, frames - 1)
        phase = t
        nod = math.sin(t * math.pi * 3)
        wave = math.sin(t * math.pi * 4)
        bpy.context.scene.frame_set(f)

        if "hips" in bones:
            set_loc(bones["hips"], (0.006 * wave, 0, 0.006 * abs(nod)), f)
            set_rot(bones["hips"], (1, 3 * wave, 0), f)
        if "chest" in bones:
            set_rot(bones["chest"], (3 + 2 * abs(wave), 3 * wave, 1.5 * wave), f)
        if "spine" in bones:
            set_rot(bones["spine"], (1.5, 2 * wave, 0), f)

        pose_legs(bones, f, phase * 0.5)  # softer step while talking
        pose_neck_bob(bones, f, phase, amp=0.7)
        if "head" in bones:
            set_rot(bones["head"], (6 * nod, 5 * wave, 2 * wave), f)

        pose_phone_arm(bones, "L", f, lift=1.0 + 0.08 * abs(wave), breath=abs(nod))
        # Free hand punctuates speech
        pose_swing_arm(bones, "R", f, phase=0.35 * wave, amp=0.7)
        if "forearm_R" in bones:
            set_rot(bones["forearm_R"], (25 + 15 * abs(wave), -8, -12), f)
        if "hand_R" in bones:
            set_rot(bones["hand_R"], (12, -10, 18 + 8 * wave), f)


def build_wave(arm, frames=56):
    """Keep phone in L, wave with R — natural from music stance."""
    bones = arm.pose.bones
    for f, phase in [
        (1, 0.0),
        (frames // 5, 1.0),
        (2 * frames // 5, 0.35),
        (3 * frames // 5, 1.0),
        (4 * frames // 5, 0.35),
        (frames, 0.0),
    ]:
        bpy.context.scene.frame_set(f)
        if "hips" in bones:
            set_loc(bones["hips"], (0, 0, 0.004), f)
            set_rot(bones["hips"], (1, 2, 0), f)
        if "chest" in bones:
            set_rot(bones["chest"], (3, -6 * phase, 0), f)

        pose_phone_arm(bones, "L", f, lift=1.0, breath=0.3)
        # Raise right arm to wave
        if "upper_arm_R" in bones:
            set_rot(bones["upper_arm_R"], (-55 * phase, -25, -70 + 40 * phase), f)
        if "forearm_R" in bones:
            set_rot(bones["forearm_R"], (10, 0, -20 - 45 * phase), f)
        if "hand_R" in bones:
            set_rot(bones["hand_R"], (15, -20, 30 + 20 * phase), f)
        if "head" in bones:
            set_rot(bones["head"], (4, -10 * phase, 0), f)
        for i, n in enumerate(n for n in ("neck_01", "neck_02", "neck_03") if n in bones):
            set_rot(bones[n], (-1 - i * 0.3, -3 * phase, 0), f)
        # Soft standing legs
        for side, s in (("L", 1), ("R", -1)):
            if f"thigh_{side}" in bones:
                set_rot(bones[f"thigh_{side}"], (2, 2 * s, 0), f)
            if f"shin_{side}" in bones:
                set_rot(bones[f"shin_{side}"], (4, 0, 0), f)


def preview(arm):
    for name in list(bpy.data.objects.keys()):
        if name in {"PreviewCam", "Key", "Fill", "Rim"}:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0.2, -2.5, 1.2)
    cam.rotation_euler = (math.radians(88), 0, math.radians(4))
    bpy.context.scene.camera = cam

    for name, loc, e in [
        ("Key", (1.6, -2.0, 2.5), 700),
        ("Fill", (-2.2, -1.2, 1.5), 240),
        ("Rim", (0.2, 2.3, 2.2), 260),
    ]:
        d = bpy.data.lights.new(name, "AREA")
        d.energy = e
        d.size = 2.8
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc

    if arm.animation_data:
        arm.animation_data.action = bpy.data.actions.get("idle")
    bpy.context.scene.frame_set(12)
    bpy.context.view_layer.update()
    try:
        bpy.context.scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
    bpy.context.scene.render.resolution_x = 720
    bpy.context.scene.render.resolution_y = 1100
    bpy.context.scene.render.filepath = str(PREVIEW)
    bpy.ops.render.render(write_still=True)
    print("preview", PREVIEW)


def export(arm, obj, phone):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    if arm.animation_data is None:
        arm.animation_data_create()
    while arm.animation_data.nla_tracks:
        arm.animation_data.nla_tracks.remove(arm.animation_data.nla_tracks[0])
    for name in ("idle", "talk", "wave"):
        if name in bpy.data.actions:
            bpy.data.actions[name].use_fake_user = True
            t = arm.animation_data.nla_tracks.new()
            t.name = name
            t.strips.new(name, 1, bpy.data.actions[name])
    arm.animation_data.action = None

    # Keep only character assets
    keep = {arm, obj, phone}
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    obj.select_set(True)
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

    phone = ensure_phone(arm)
    remake_action(arm, "idle", 48, build_idle)
    remake_action(arm, "talk", 40, build_talk)
    remake_action(arm, "wave", 56, build_wave)

    try:
        preview(arm)
    except Exception as e:
        print("preview fail", e)

    export(arm, obj, phone)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP))
    shutil.copy2(TMP, BLEND)
    print("DONE actions", [a.name for a in bpy.data.actions])


if __name__ == "__main__":
    main()
