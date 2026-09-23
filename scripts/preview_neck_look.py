"""Pose neck and render with lights."""
from pathlib import Path
import bpy
from mathutils import Vector

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
OUT = Path("/tmp/lisa-blender-look.png")

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
arm = bpy.data.objects["Armature"]

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)
arm.pose.bones["neck_01"].rotation_euler = (0, -0.45, 0)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")

# World + lights
world = bpy.data.worlds.new("W")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.78, 0.78, 0.78, 1)
bg.inputs[1].default_value = 1.0

for name in ("key", "fill"):
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

def add_light(name, loc, energy):
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.size = 2.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = loc
    return obj

add_light("key", (1.2, -1.5, 1.8), 400)
add_light("fill", (-1.5, -1.0, 1.4), 180)

for obj in list(bpy.data.objects):
    if obj.type == "CAMERA":
        bpy.data.objects.remove(obj, do_unlink=True)
cam_data = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = (0.15, -2.7, 1.35)
cam.rotation_euler = (1.35, 0, 0.05)
cam_data.lens = 55

scene = bpy.context.scene
scene.render.resolution_x = 700
scene.render.resolution_y = 800
scene.render.filepath = str(OUT)
scene.render.film_transparent = False
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    scene.render.engine = "BLENDER_EEVEE"
bpy.ops.render.render(write_still=True)
print("wrote", OUT.stat().st_size)
