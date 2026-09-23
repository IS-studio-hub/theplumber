"""
Polish existing rigged ostrich toward LISA studio quality:
- open ostrich_rigged.blend (web-ready polycount + armature)
- light mesh cleanup (keep UVs)
- soft studio Principled (coat / sheen / SSS)
- rebuild idle / talk / wave
- export GLB + preview
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

import bpy

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich_rigged.blend"
)
OUT_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/ostrich.glb"
)
TMP_BLEND = Path("/tmp/lisa-character/ostrich_rigged_polish.blend")
PREVIEW = Path("/tmp/lisa-character/refined_preview.png")


def select_only(obj):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def polish_mesh(obj):
    select_only(obj)
    print("mesh before", len(obj.data.vertices), "verts", len(obj.data.polygons), "faces")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.0004)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0001)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    try:
        bpy.ops.mesh.select_all(action="DESELECT")
        bpy.ops.mesh.select_interior_faces()
        bpy.ops.mesh.delete(type="FACE")
    except Exception as e:
        print("interior cleanup skipped", e)
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.fill_holes(sides=6)
    except Exception:
        pass
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.shade_smooth()
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(45)

    # Soft product silhouette without remeshing (keeps UVs)
    try:
        mod = obj.modifiers.new("WeightedNormal", "WEIGHTED_NORMAL")
        mod.keep_sharp = False
        mod.weight = 50
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as e:
        print("weighted normal skip", e)

    try:
        lap = obj.modifiers.new("LapSmooth", "LAPLACIANSMOOTH")
        lap.iterations = 1
        lap.lambda_factor = 0.12
        lap.use_volume_preserve = True
        bpy.ops.object.modifier_apply(modifier=lap.name)
    except Exception as e:
        print("lap smooth skip", e)

    print("mesh after", len(obj.data.vertices), "verts", len(obj.data.polygons), "faces")


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
        set_if("Specular IOR Level", 0.36)
        set_if("Roughness", 0.48)
        set_if("Coat Weight", 0.16)
        set_if("Coat Roughness", 0.28)
        set_if("Sheen Weight", 0.28)
        set_if("Sheen Roughness", 0.4)
        if "Subsurface Weight" in bsdf.inputs and not bsdf.inputs["Subsurface Weight"].is_linked:
            bsdf.inputs["Subsurface Weight"].default_value = 0.05
        elif "Subsurface" in bsdf.inputs and not bsdf.inputs["Subsurface"].is_linked:
            bsdf.inputs["Subsurface"].default_value = 0.05

        base = bsdf.inputs.get("Base Color")
        if base and base.is_linked:
            from_node = base.links[0].from_node
            from_socket = base.links[0].from_socket
            if from_node.type != "BRIGHTCONTRAST":
                bright = nt.nodes.new("ShaderNodeBrightContrast")
                bright.location = (from_node.location.x + 200, from_node.location.y)
                bright.inputs["Bright"].default_value = 0.03
                bright.inputs["Contrast"].default_value = 0.12
                nt.links.new(from_socket, bright.inputs["Color"])
                for link in list(base.links):
                    nt.links.remove(link)
                nt.links.new(bright.outputs["Color"], base)

        rough = bsdf.inputs.get("Roughness")
        if rough and rough.is_linked and rough.links[0].from_node.type == "TEX_IMAGE":
            tex = rough.links[0].from_node
            ramp = nt.nodes.new("ShaderNodeMapRange")
            ramp.location = (tex.location.x + 220, tex.location.y)
            ramp.inputs["From Min"].default_value = 0.0
            ramp.inputs["From Max"].default_value = 1.0
            ramp.inputs["To Min"].default_value = 0.32
            ramp.inputs["To Max"].default_value = 0.68
            for link in list(rough.links):
                nt.links.remove(link)
            nt.links.new(tex.outputs["Color"], ramp.inputs["Value"])
            nt.links.new(ramp.outputs["Result"], rough)

        mat.use_backface_culling = False
        print("Material polished", mat.name)


def make_action(arm, name, frames, builder):
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.transforms_clear()

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
            bones["head"].rotation_euler = (
                math.radians(2 * amt),
                math.radians(-2 * math.sin(amt * math.pi)),
                0,
            )
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for side, sign in (("L", 1), ("R", -1)):
            bname = f"upper_arm_{side}"
            if bname in bones:
                bones[bname].rotation_mode = "XYZ"
                bones[bname].rotation_euler = (
                    math.radians(2 * amt),
                    math.radians(5 * amt * sign),
                    math.radians(2 * amt),
                )
                bones[bname].keyframe_insert("rotation_euler", frame=f)
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
            bones["head"].rotation_euler = (
                math.radians(8 * nod),
                math.radians(5 * wave),
                math.radians(2 * wave),
            )
            bones["head"].keyframe_insert("rotation_euler", frame=f)
        for i, n in enumerate(neck_bones):
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
            bname = f"upper_arm_{side}"
            if bname in bones:
                bones[bname].rotation_mode = "XYZ"
                bones[bname].rotation_euler = (
                    math.radians(10 * abs(wave)),
                    math.radians(12 * sign * (0.35 + 0.25 * wave)),
                    math.radians(4 * wave),
                )
                bones[bname].keyframe_insert("rotation_euler", frame=f)


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


def preview(arm):
    for name in ("PreviewCam", "Key", "Fill", "Rim"):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    cam = bpy.data.objects.new("PreviewCam", bpy.data.cameras.new("PreviewCam"))
    bpy.context.scene.collection.objects.link(cam)
    cam.location = (0, -3.3, 1.1)
    cam.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.scene.camera = cam

    def area(name, loc, energy):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = 2.5
        o = bpy.data.objects.new(name, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc

    area("Key", (1.8, -2.0, 2.6), 650)
    area("Fill", (-2.1, -1.2, 1.5), 220)
    area("Rim", (0.2, 2.4, 2.2), 280)

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
        scene.frame_set(24)
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
        export_texcoords=True,
        export_normals=True,
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_draco_mesh_compression_enable=False,
    )
    print("exported", OUT_GLB, round(OUT_GLB.stat().st_size / 1e6, 2), "MB")


def main():
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))

    obj = bpy.data.objects.get("OstrichCharacter")
    arm = bpy.data.objects.get("OstrichArmature")
    if not obj or not arm:
        raise RuntimeError("Expected OstrichCharacter + OstrichArmature in blend")

    # Hide / remove helper source mesh from export clutter
    src = bpy.data.objects.get("OstrichSource")
    if src:
        src.hide_render = True
        src.hide_viewport = True

    polish_mesh(obj)
    polish_material(obj)
    make_action(arm, "idle", 60, build_idle)
    make_action(arm, "talk", 40, build_talk)
    make_action(arm, "wave", 48, build_wave)

    TMP_BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(TMP_BLEND))
    shutil.copy2(TMP_BLEND, BLEND)
    print("saved", BLEND)

    try:
        preview(arm)
    except Exception as e:
        print("preview fail", e)

    export(arm, obj)
    print("DONE actions", [a.name for a in bpy.data.actions])


if __name__ == "__main__":
    main()
