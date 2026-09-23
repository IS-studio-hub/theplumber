"""Analyze collar/jaw heights and skin weights on the current rigged poodle."""
from __future__ import annotations

from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/Ginny/website/public/assets/lisa/character/lisa_rigged.blend"
)

bpy.ops.wm.open_mainfile(filepath=str(BLEND))
arm = bpy.data.objects["Armature"]
body = bpy.data.objects["Poodle"]
mw = body.matrix_world
pts = [mw @ v.co for v in body.data.vertices]
zs = [p.z for p in pts]
H = max(zs) - min(zs)
print("H", round(H, 4), "zmin", round(min(zs), 4), "zmax", round(max(zs), 4))

# Bone heads
for b in arm.data.bones:
    print("bone", b.name, "head", tuple(round(x, 4) for x in b.head_local), "tail", tuple(round(x, 4) for x in b.tail_local), "deform", b.use_deform)

# Sample bands: for each 0.02 z slice, report dominant group + avg y (front/back)
vg_names = {g.index: g.name for g in body.vertex_groups}
bands = defaultdict(lambda: defaultdict(int))
band_y = defaultdict(list)
for v in body.data.vertices:
    z = (mw @ v.co).z
    y = (mw @ v.co).y
    key = round(z * 50) / 50  # 0.02 buckets
    if not v.groups:
        bands[key]["NONE"] += 1
        continue
    best = max(v.groups, key=lambda g: g.weight)
    bands[key][vg_names[best.group]] += 1
    band_y[key].append(y)

print("\nZ bands (dominant counts):")
for z in sorted(bands.keys()):
    items = sorted(bands[z].items(), key=lambda kv: -kv[1])
    avg_y = sum(band_y[z]) / max(1, len(band_y[z]))
    print(f"  z={z:5.2f} y_avg={avg_y:6.3f}  {items[:4]}")

# Mixed-weight verts (potential shear sources)
mixed = 0
mixed_faceish = 0
for v in body.data.vertices:
    if len(v.groups) < 2:
        continue
    ws = sorted((g.weight for g in v.groups), reverse=True)
    if ws[1] < 0.05:
        continue
    mixed += 1
    z = (mw @ v.co).z
    if z > H * 0.52:
        mixed_faceish += 1
print("mixed_weight_verts", mixed, "above_0.52H", mixed_faceish)

# Nose tip candidate (max +Y among upper verts) and its weights
upper = [(mw @ v.co, v) for v in body.data.vertices if (mw @ v.co).z > H * 0.55]
nose = max(upper, key=lambda t: t[0].y)
crown = max(upper, key=lambda t: t[0].z)
print("nose", tuple(round(x, 3) for x in nose[0]), "groups", [(vg_names[g.group], round(g.weight, 3)) for g in nose[1].groups])
print("crown", tuple(round(x, 3) for x in crown[0]), "groups", [(vg_names[g.group], round(g.weight, 3)) for g in crown[1].groups])
