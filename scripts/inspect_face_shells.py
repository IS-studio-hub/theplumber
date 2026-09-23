"""Inspect rest vs posed mesh for face tear; find non-manifold / loose snout shells."""
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)
OUT_REST = Path("/tmp/lisa-blender-rest.png")
OUT_POSE = Path("/tmp/lisa-blender-pose.png")

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
mesh = body.data

# Connected components in snout band
from collections import deque

snout_verts = [
    v.index
    for v in mesh.vertices
    if 1.15 < (body.matrix_world @ v.co).z < 1.38
    and (body.matrix_world @ v.co).y > 0.15
]
snout_set = set(snout_verts)
print("snout_verts", len(snout_verts))

# adjacency via edges
adj = defaultdict(set)
for e in mesh.edges:
    a, b = e.vertices
    if a in snout_set and b in snout_set:
        adj[a].add(b)
        adj[b].add(a)

seen = set()
components = []
for v in snout_verts:
    if v in seen:
        continue
    q = deque([v])
    seen.add(v)
    comp = []
    while q:
        cur = q.popleft()
        comp.append(cur)
        for n in adj[cur]:
            if n not in seen:
                seen.add(n)
                q.append(n)
    components.append(comp)

components.sort(key=len, reverse=True)
print("snout_components", len(components), "sizes", [len(c) for c in components[:8]])
for i, comp in enumerate(components[:5]):
    pts = [body.matrix_world @ mesh.vertices[vi].co for vi in comp]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    zs = [p.z for p in pts]
    # weights
    wcounts = defaultdict(int)
    for vi in comp:
        v = mesh.vertices[vi]
        if not v.groups:
            wcounts["NONE"] += 1
            continue
        best = max(v.groups, key=lambda g: g.weight)
        wcounts[body.vertex_groups[best.group].name] += 1
    print(
        f"  comp{i}",
        "n",
        len(comp),
        "x",
        round(min(xs), 3),
        round(max(xs), 3),
        "y",
        round(min(ys), 3),
        round(max(ys), 3),
        "z",
        round(min(zs), 3),
        round(max(zs), 3),
        "w",
        dict(wcounts),
    )


def setup_render():
    world = bpy.data.worlds.get("W") or bpy.data.worlds.new("W")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.78, 0.78, 0.78, 1)
    bg.inputs[1].default_value = 1.0
    for name, loc, energy in (("key", (1.2, -1.5, 1.8), 400), ("fill", (-1.5, -1.0, 1.4), 180)):
        if name in bpy.data.objects:
            continue
        data = bpy.data.lights.new(name=name, type="AREA")
        data.energy = energy
        data.size = 2.0
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        obj.location = loc
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
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"


def render(path):
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print("wrote", path, path.stat().st_size)


setup_render()

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
for b in arm.pose.bones:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
render(OUT_REST)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="POSE")
arm.pose.bones["neck_01"].rotation_euler = (0, -0.45, 0)
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode="OBJECT")
render(OUT_POSE)
