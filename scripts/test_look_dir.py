import bpy

bpy.ops.wm.open_mainfile(
    filepath="/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)
head = arm.pose.bones["head"]


def tip():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    m = ev.to_mesh()
    cand = [v.co for v in m.vertices if v.co.z > 1.2]
    t = min(cand, key=lambda p: p.y)
    ev.to_mesh_clear()
    return t


r = tip()
head.rotation_euler = (0, 0, -0.4)
bpy.context.view_layer.update()
a = tip()
head.rotation_euler = (0, 0, 0.4)
bpy.context.view_layer.update()
b = tip()
print("rest_tip_x", round(r.x, 4))
print("Zneg_dx", round(a.x - r.x, 4))
print("Zpos_dx", round(b.x - r.x, 4))
