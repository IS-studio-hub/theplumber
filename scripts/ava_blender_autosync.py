"""
AVA → site autosync for Blender.

On every save of the mechanic blend (or any scene with MechanicRig):
  • Export Draco GLB → website/public/assets/ava/character/ava.glb
  • Write version.json so the Next.js character hot-reloads

Usage:
  Blender <friendly_mechanic_rig.blend> --python scripts/ava_blender_autosync.py
  or:  npm run blender:character
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import bpy
from bpy.app.handlers import persistent

BLEND = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/friendly_mechanic_rig.blend"
)
SITE_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber/website"
    "/public/assets/ava/character/ava.glb"
)
VERSION_JSON = SITE_GLB.with_name("version.json")
STARTUP = Path.home() / "Library/Application Support/Blender/4.2/scripts/startup"
STARTUP_SCRIPT = STARTUP / "ava_site_autosync.py"

_exporting = False

# Slim startup module — only registers handlers (no open/export on launch).
_STARTUP_SRC = r'''
"""AVA site autosync — Blender startup (save → export GLB)."""
from __future__ import annotations

import json
import time
from pathlib import Path

import bpy
from bpy.app.handlers import persistent

SITE_GLB = Path(
    "/Users/shamrikin/Desktop/ISstudio/Work/CuttingEdgeSites/the plumber"
    "/website/public/assets/ava/character/ava.glb"
)
VERSION_JSON = SITE_GLB.with_name("version.json")
_exporting = False


def _is_ava_scene(path: str) -> bool:
    name = Path(path or "").name.lower()
    if "friendly_mechanic" in name or "mechanic_rig" in name:
        return True
    return bool(bpy.data.objects.get("MechanicRig"))


def _select_site_character() -> None:
    keep = set()
    for o in bpy.data.objects:
        if o.name in ("Mechanic", "MechanicRig"):
            keep.add(o.name)
        elif o.name.startswith("AvaEye_") and "_Game" not in o.name:
            keep.add(o.name)
    for o in bpy.data.objects:
        try:
            o.hide_set(o.name not in keep)
        except Exception:
            pass
        o.hide_render = o.name not in keep
        o.select_set(o.name in keep)
    arm = bpy.data.objects.get("MechanicRig")
    if arm:
        bpy.context.view_layer.objects.active = arm
    mesh = bpy.data.objects.get("Mechanic")
    if mesh:
        for m in mesh.modifiers:
            if m.type == "CORRECTIVE_SMOOTH":
                m.show_render = False


def export_to_site(reason: str = "manual") -> str:
    global _exporting
    if _exporting:
        return "busy"
    _exporting = True
    try:
        SITE_GLB.parent.mkdir(parents=True, exist_ok=True)
        _select_site_character()
        bpy.ops.export_scene.gltf(
            filepath=str(SITE_GLB),
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12,
        )
        stamp = int(time.time() * 1000)
        VERSION_JSON.write_text(
            json.dumps({
                "v": stamp,
                "reason": reason,
                "t": time.strftime("%Y-%m-%d %H:%M:%S"),
            }) + "\n",
            encoding="utf-8",
        )
        msg = f"AVA synced → site (v={stamp})"
        print(msg)
        return msg
    finally:
        _exporting = False


@persistent
def on_save_post(_dummy):
    if not _is_ava_scene(bpy.data.filepath or ""):
        return
    try:
        export_to_site("save")
    except Exception as e:
        print("AVA autosync failed:", e)


@persistent
def on_load_post(_dummy):
    if on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(on_save_post)


def register():
    if on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(on_save_post)
    if on_load_post not in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.append(on_load_post)
    print("AVA autosync armed →", SITE_GLB)


def unregister():
    if on_save_post in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(on_save_post)
    if on_load_post in bpy.app.handlers.load_post:
        bpy.app.handlers.load_post.remove(on_load_post)


register()
'''


def _select_site_character() -> None:
    """Select only the site character meshes + armature for export."""
    keep_names = set()
    for o in bpy.data.objects:
        if o.name in ("Mechanic", "MechanicRig"):
            keep_names.add(o.name)
        elif o.name.startswith("AvaEye_") and "_Game" not in o.name:
            keep_names.add(o.name)
    for o in bpy.data.objects:
        try:
            o.hide_set(o.name not in keep_names)
        except Exception:
            pass
        o.hide_render = o.name not in keep_names
        o.select_set(o.name in keep_names)
    arm = bpy.data.objects.get("MechanicRig")
    if arm:
        bpy.context.view_layer.objects.active = arm
    mesh = bpy.data.objects.get("Mechanic")
    if mesh:
        for m in mesh.modifiers:
            if m.type == "CORRECTIVE_SMOOTH":
                m.show_render = False


def export_to_site(reason: str = "manual") -> str:
    global _exporting
    if _exporting:
        return "busy"
    _exporting = True
    try:
        SITE_GLB.parent.mkdir(parents=True, exist_ok=True)
        _select_site_character()
        bpy.ops.export_scene.gltf(
            filepath=str(SITE_GLB),
            export_format="GLB",
            use_selection=True,
            export_apply=False,
            export_animations=True,
            export_skins=True,
            export_morph=True,
            export_cameras=False,
            export_lights=False,
            export_yup=True,
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12,
        )
        stamp = int(time.time() * 1000)
        VERSION_JSON.write_text(
            json.dumps(
                {
                    "v": stamp,
                    "reason": reason,
                    "t": time.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
            + "\n",
            encoding="utf-8",
        )
        msg = f"AVA synced → site (v={stamp}, {reason})"
        print(msg)
        return msg
    finally:
        _exporting = False


@persistent
def on_save_post(_dummy):
    path = (bpy.data.filepath or "").lower()
    if "friendly_mechanic" not in path and "mechanic_rig" not in path:
        if not bpy.data.objects.get("MechanicRig"):
            return
    try:
        export_to_site("save")
    except Exception as e:
        print("AVA autosync failed:", e)


def install_startup() -> None:
    STARTUP.mkdir(parents=True, exist_ok=True)
    STARTUP_SCRIPT.write_text(_STARTUP_SRC, encoding="utf-8")
    print("Installed:", STARTUP_SCRIPT)


def register():
    if on_save_post not in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.append(on_save_post)
    print("AVA autosync: save_post armed →", SITE_GLB)


if __name__ == "__main__":
    install_startup()
    if not bpy.data.filepath and BLEND.exists():
        bpy.ops.wm.open_mainfile(filepath=str(BLEND))
        print("Opened", BLEND)
    register()
    try:
        export_to_site("open")
    except Exception as e:
        print("Initial export skipped:", e)
