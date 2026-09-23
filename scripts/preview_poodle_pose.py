import bpy
from math import radians
from collections import defaultdict

bpy.ops.wm.open_mainfile(
    filepath="/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
print("modifiers", [m.type for m in body.modifiers])
print("vgroups", [g.name for g in body.vertex_groups])
sums = defaultdict(float)
counts = defaultdict(int)
for v in body.data.vertices:
    for g in v.groups:
        name = body.vertex_groups[g.group].name
        sums[name] += g.weight
        if g.weight > 0.2:
            counts[name] += 1
print("weight_sum", dict(sums))
print("verts>0.2", dict(counts), "total", len(body.data.vertices))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for name, yaw in (("neck_01", 0.18), ("neck_02", 0.22), ("head", 0.35)):
    b = arm.pose.bones[name]
    b.rotation_mode = "XYZ"
    b.rotation_euler[2] = yaw
bpy.ops.object.mode_set(mode="OBJECT")

scene = bpy.context.scene
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.engine = "BLENDER_EEVEE"
cam = bpy.data.cameras.new("C")
cobj = bpy.data.objects.new("C", cam)
scene.collection.objects.link(cobj)
scene.camera = cobj
cobj.location = (0, -2.2, 1.35)
cobj.rotation_euler = (radians(82), 0, 0)
light = bpy.data.lights.new("L", "AREA")
light.energy = 400
lobj = bpy.data.objects.new("L", light)
scene.collection.objects.link(lobj)
lobj.location = (1.2, -1.4, 2.0)
scene.render.filepath = "/tmp/poodle-neck-pose.png"
bpy.ops.render.render(write_still=True)
print("wrote /tmp/poodle-neck-pose.png")
