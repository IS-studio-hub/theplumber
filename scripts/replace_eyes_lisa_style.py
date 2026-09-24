"""Place Lisa DogEye spheres on Mechanic at verified socket centers, then cut painted eyes."""
from __future__ import annotations

import json
import time
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

MECH_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/friendly_mechanic_rig.blend"
)
LISA_BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website"
    "/public/assets/lisa/character/lisa_rigged.blend"
)
EYES_BLEND = Path("/tmp/ava_eye_work/lisa_eyes_only.blend")
SITE_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/website"
    "/public/assets/ava/character/ava.glb"
)
VERSION_JSON = SITE_GLB.with_name("version.json")
PREVIEW = Path("/tmp/ava_eye_work/mechanic_face_after.png")
LOG = Path("/tmp/ava_eye_work/replace_eyes.log")

# Verified from marker compare: iris mid-height between brow (1.52) and lower sclera (1.46)
EYE_TARGETS = {
    "L": Vector((-0.075, -0.355, 1.478)),
    "R": Vector((0.110, -0.360, 1.478)),
}
BALL_R = 0.026
CUT_R = 0.0  # disabled — cutting left jagged sockets


def log(msg: str) -> None:
    print(msg, flush=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def sphere_stats(obj):
    mw = obj.matrix_world
    pts = [mw @ v.co for v in obj.data.vertices]
    center = sum(pts, Vector()) / len(pts)
    radius = sum((p - center).length for p in pts) / len(pts)
    return center, radius


def iris_outward(obj) -> Vector:
    me = obj.data
    uv = me.uv_layers.active
    mw = obj.matrix_world
    best = Vector((0, -1, 0))
    best_d = 1e9
    for p in me.polygons:
        for li in p.loop_indices:
            u = uv.data[li].uv
            d = (u.x - 0.5) ** 2 + (u.y - 0.5) ** 2
            if d < best_d:
                best_d = d
                best = (mw.to_3x3() @ p.normal).normalized()
    return best


def load_lisa_eyes():
    with bpy.data.libraries.load(str(LISA_BLEND), link=False) as (data_from, data_to):
        data_to.materials = [n for n in data_from.materials if n == "DogEye"][:1]
    mat = data_to.materials[0]
    mat.name = "DogEye"

    with bpy.data.libraries.load(str(EYES_BLEND), link=False) as (data_from, data_to):
        data_to.objects = list(data_from.objects)[:1]
        if not data_from.objects:
            data_to.meshes = list(data_from.meshes)[:1]

    if data_to.objects and data_to.objects[0]:
        eye_obj = data_to.objects[0]
        bpy.context.collection.objects.link(eye_obj)
    else:
        eye_obj = bpy.data.objects.new("LisaEyesSrc", data_to.meshes[0])
        bpy.context.collection.objects.link(eye_obj)

    eye_obj.data.materials.clear()
    eye_obj.data.materials.append(mat)

    import bmesh

    mw = eye_obj.matrix_world
    left_f, right_f = [], []
    for p in eye_obj.data.polygons:
        (left_f if (mw @ p.center).x < 0 else right_f).append(p.index)

    def sep(faces, name):
        dup = eye_obj.copy()
        dup.data = eye_obj.data.copy()
        dup.name = name
        bpy.context.collection.objects.link(dup)
        bm = bmesh.new()
        bm.from_mesh(dup.data)
        bm.faces.ensure_lookup_table()
        keep = set(faces)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
        bm.to_mesh(dup.data)
        bm.free()
        dup.data.materials.clear()
        dup.data.materials.append(mat)
        return dup

    left, right = sep(left_f, "LisaEye_L_src"), sep(right_f, "LisaEye_R_src")
    bpy.data.objects.remove(eye_obj, do_unlink=True)
    return mat, left, right


def place_eye(src, name, target, radius, arm, head_bone):
    eye = src.copy()
    eye.data = src.data.copy()
    eye.name = name
    eye.data.name = name + "_Mesh"
    bpy.context.collection.objects.link(eye)

    src_c, src_r = sphere_stats(eye)
    scale = radius / max(src_r, 1e-6)
    outward = iris_outward(eye)
    target_dir = Vector((0.06 if target.x < 0 else -0.06, -1.0, 0.0)).normalized()
    rot = outward.rotation_difference(target_dir).to_matrix().to_4x4()
    # Sit the ball so front equator is near the face surface (slightly behind lids)
    inset = Vector(target) + Vector((0.0, 0.010, 0.0))  # deeper under lids
    xf = Matrix.Translation(inset) @ Matrix.Scale(scale, 4) @ rot @ Matrix.Translation(-src_c)
    eye.matrix_world = xf

    for vg in list(eye.vertex_groups):
        eye.vertex_groups.remove(vg)
    vg = eye.vertex_groups.new(name=head_bone)
    vg.add(list(range(len(eye.data.vertices))), 1.0, "REPLACE")
    for mod in list(eye.modifiers):
        eye.modifiers.remove(mod)
    mod = eye.modifiers.new(name="Armature", type="ARMATURE")
    mod.object = arm
    mod.use_vertex_groups = True
    eye.parent = arm
    eye.parent_type = "OBJECT"
    bpy.context.view_layer.update()
    eye.matrix_world = xf

    bpy.ops.object.select_all(action="DESELECT")
    eye.select_set(True)
    bpy.context.view_layer.objects.active = eye
    bpy.ops.object.shade_smooth()
    c2, r2 = sphere_stats(eye)
    log(f"{name} at {tuple(round(x,4) for x in c2)} r={r2:.4f}")
    return eye


def cut_around(mesh_obj, centers, radius):
    import bmesh

    me = mesh_obj.data
    mw = mesh_obj.matrix_world
    kill = set()
    for p in me.polygons:
        c = mw @ p.center
        n = (mw.to_3x3() @ p.normal).normalized()
        if n.y > -0.25:
            continue
        for center in centers:
            if (c - center).length <= radius:
                kill.add(p.index)
                break
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    to_del = [bm.faces[i] for i in kill if i < len(bm.faces)]
    n = len(to_del)
    bmesh.ops.delete(bm, geom=to_del, context="FACES")
    bm.to_mesh(me)
    bm.free()
    me.update()
    return n


def render_preview(path: Path):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 900
    scene.render.filepath = str(path)
    cam = bpy.data.objects.get("EyeCam")
    if not cam:
        cam = bpy.data.objects.new("EyeCam", bpy.data.cameras.new("EyeCam"))
        scene.collection.objects.link(cam)
    cam.location = (0.0, -0.95, 1.55)
    cam.rotation_euler = (1.5708, 0, 0)
    cam.data.lens = 85
    scene.camera = cam
    if "EyeKey" not in bpy.data.objects:
        light = bpy.data.lights.new("EyeKeyData", type="AREA")
        light.energy = 120
        lob = bpy.data.objects.new("EyeKey", light)
        scene.collection.objects.link(lob)
        lob.location = (0.3, -1.0, 1.9)
    for o in bpy.data.objects:
        if o.name.startswith("EyeMark_"):
            o.hide_render = True
    bpy.ops.render.render(write_still=True)
    log(f"preview {path}")


def export_glb():
    arm = bpy.data.objects["MechanicRig"]
    mesh = bpy.data.objects["Mechanic"]
    eyes = [o for o in bpy.data.objects if o.name.startswith("AvaEye_")]
    keep = {arm, mesh, *eyes}
    for obj in list(bpy.data.objects):
        if obj.name.startswith("EyeMark_") or obj.name.startswith("LisaEye_"):
            continue
        try:
            if obj.name not in {o.name for o in keep}:
                obj.hide_render = True
                obj.select_set(False)
            else:
                obj.hide_render = False
                try:
                    obj.hide_set(False)
                except Exception:
                    pass
                obj.select_set(True)
        except Exception:
            pass
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=str(SITE_GLB),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_animations=False,
        export_skins=True,
        export_morph=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_image_format="AUTO",
    )
    stamp = int(time.time() * 1000)
    VERSION_JSON.write_text(
        json.dumps({"v": stamp, "reason": "lisa-dogeye-v4", "t": time.strftime("%Y-%m-%d %H:%M:%S")})
        + "\n"
    )
    log(f"exported v={stamp}")


def main():
    LOG.write_text("", encoding="utf-8")
    bpy.ops.wm.open_mainfile(filepath=str(MECH_BLEND))
    mesh = bpy.data.objects["Mechanic"]
    arm = bpy.data.objects["MechanicRig"]
    for o in list(bpy.data.objects):
        if o.name.startswith(("AvaEye_", "LisaEye_", "EyeMark_")):
            bpy.data.objects.remove(o, do_unlink=True)

    mat, lisa_l, lisa_r = load_lisa_eyes()
    head = "head" if "head" in arm.data.bones else arm.data.bones[0].name

    # Place first (no cut) — preview check
    src = {"L": lisa_l, "R": lisa_r}
    for side, target in EYE_TARGETS.items():
        place_eye(src[side], f"AvaEye_{side}", target, BALL_R, arm, head)

    render_preview(Path("/tmp/ava_eye_work/mechanic_eyes_place_only.png"))

    # Cut painted eyes under the spheres
    if CUT_R > 0:
        deleted = cut_around(mesh, list(EYE_TARGETS.values()), CUT_R)
        log(f"cut faces {deleted}")
    else:
        log("skip cut — spheres cover painted irises")

    for o in (lisa_l, lisa_r):
        bpy.data.objects.remove(o, do_unlink=True)

    bpy.ops.wm.save_as_mainfile(filepath=str(MECH_BLEND))
    log(f"saved {MECH_BLEND}")
    render_preview(PREVIEW)
    export_glb()
    log("done")


if __name__ == "__main__":
    main()
