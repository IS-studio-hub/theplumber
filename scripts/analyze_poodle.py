"""Dump poodle mesh bounds and Y-quantile stats for neck/head bone placement."""
from __future__ import annotations

from pathlib import Path
from mathutils import Vector
import bpy

SRC = Path(
    "/Users/shamrikin/Downloads/Meshy_AI_Poodle_Pop_Fashion_0918221921_texture.glb"
)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SRC))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print("meshes", [(o.name, len(o.data.vertices), len(o.data.materials)) for o in meshes])

pts = []
for o in meshes:
    mw = o.matrix_world
    for v in o.data.vertices:
        pts.append(mw @ v.co)

xs = [p.x for p in pts]
ys = [p.y for p in pts]
zs = [p.z for p in pts]
print("count", len(pts))
print("min", min(xs), min(ys), min(zs))
print("max", max(xs), max(ys), max(zs))
print("span", max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))

# Decide up axis: largest vertical span among Y and Z
span_y = max(ys) - min(ys)
span_z = max(zs) - min(zs)
up = "Y" if span_y >= span_z * 0.9 else "Z"
print("guess_up", up, "span_y", span_y, "span_z", span_z)

up_vals = ys if up == "Y" else zs
up_vals_sorted = sorted(up_vals)
n = len(up_vals_sorted)


def q(t):
    i = min(n - 1, max(0, int(t * (n - 1))))
    return up_vals_sorted[i]


print("up quantiles", {k: q(k) for k in (0, 0.1, 0.3, 0.5, 0.65, 0.75, 0.82, 0.9, 0.95, 0.99, 1)})

# centroid of top 18% verts (likely head puff)
lo = q(0.82)
head_pts = [p for p in pts if (p.y if up == "Y" else p.z) >= lo]
cx = sum(p.x for p in head_pts) / len(head_pts)
cy = sum(p.y for p in head_pts) / len(head_pts)
cz = sum(p.z for p in head_pts) / len(head_pts)
print("head_centroid", cx, cy, cz, "n", len(head_pts))

# chest centroid (40-65%)
a, b = q(0.4), q(0.65)
chest_pts = [p for p in pts if a <= (p.y if up == "Y" else p.z) <= b]
ccx = sum(p.x for p in chest_pts) / max(1, len(chest_pts))
ccy = sum(p.y for p in chest_pts) / max(1, len(chest_pts))
ccz = sum(p.z for p in chest_pts) / max(1, len(chest_pts))
print("chest_centroid", ccx, ccy, ccz, "n", len(chest_pts))
