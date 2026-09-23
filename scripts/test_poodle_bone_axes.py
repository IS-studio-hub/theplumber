import bpy
from mathutils import Vector

path = "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
bpy.ops.wm.open_mainfile(filepath=path)
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
print("bones", [b.name for b in arm.pose.bones])

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)


def head_centroid():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    mesh = ev.to_mesh()
    zs = [v.co.z for v in mesh.vertices]
    zmin, zmax = min(zs), max(zs)
    thr = zmin + (zmax - zmin) * 0.75
    pts = [v.co.copy() for v in mesh.vertices if v.co.z >= thr]
    c = sum(pts, Vector()) / len(pts)
    # snout tip: most negative Y in head band
    tip = min(pts, key=lambda p: p.y)
    ev.to_mesh_clear()
    return c, tip


print("rest", head_centroid())
head = arm.pose.bones["head"]
neck = arm.pose.bones["neck_01"]
for axis, he, ne in [
    ("Y+ head", (0, 0.5, 0), (0, 0.25, 0)),
    ("Y- head", (0, -0.5, 0), (0, -0.25, 0)),
    ("Z+ head", (0, 0, 0.5), (0, 0, 0.25)),
    ("Z- head", (0, 0, -0.5), (0, 0, -0.25)),
    ("X+ head", (0.35, 0, 0), (0.15, 0, 0)),
]:
    head.rotation_euler = he
    neck.rotation_euler = ne
    bpy.context.view_layer.update()
    c, tip = head_centroid()
    print(
        axis,
        "c",
        tuple(round(v, 3) for v in c),
        "tip",
        tuple(round(v, 3) for v in tip),
    )
