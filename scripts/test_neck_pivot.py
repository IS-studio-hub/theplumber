import bpy
from mathutils import Vector

bpy.ops.wm.open_mainfile(
    filepath="/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
print("bones", [(b.name, tuple(round(x, 3) for x in b.head_local), tuple(round(x, 3) for x in b.tail_local)) for b in arm.data.bones])
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)
n1 = arm.pose.bones["neck_01"]


def tip_and_collar():
    deps = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(deps)
    m = ev.to_mesh()
    tip = min([v.co for v in m.vertices if v.co.z > 1.25], key=lambda p: p.y)
    # collar region center
    col = [v.co for v in m.vertices if 0.82 < v.co.z < 0.9]
    c = sum(col, Vector()) / max(1, len(col))
    ev.to_mesh_clear()
    return tip, c


r_tip, r_col = tip_and_collar()
n1.rotation_euler = (0, -0.45, 0)
bpy.context.view_layer.update()
a_tip, a_col = tip_and_collar()
n1.rotation_euler = (0, 0.45, 0)
bpy.context.view_layer.update()
b_tip, b_col = tip_and_collar()
print("rest tip", tuple(round(v, 3) for v in r_tip), "collar", tuple(round(v, 3) for v in r_col))
print("Y- tip", tuple(round(v, 3) for v in a_tip), "collar", tuple(round(v, 3) for v in a_col), "tip_dx", round(a_tip.x - r_tip.x, 3))
print("Y+ tip", tuple(round(v, 3) for v in b_tip), "collar", tuple(round(v, 3) for v in b_col), "tip_dx", round(b_tip.x - r_tip.x, 3))
print("collar_moved", round((a_col - r_col).length, 4), round((b_col - r_col).length, 4))
