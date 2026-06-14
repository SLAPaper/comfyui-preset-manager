import os
import json
from pathlib import Path
from aiohttp import web
from server import PromptServer

from .workflow_parser import load_templates, get_template
from .node_matcher import match_nodes, apply_preset
from .preset_manager import load_presets, get_preset, save_preset, delete_preset

PLUGIN_DIR = Path(__file__).parent

# ComfyUI node registration (empty - this plugin provides API only)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

# === API Routes ===

@PromptServer.instance.routes.get("/preset-manager/workflows")
async def get_workflows(request):
    """Get all workflow templates."""
    print("[PresetManager] API: 获取模板列表")
    templates = load_templates()
    # Return list of {id, name, description} for each template
    result = [
        {"id": tid, "name": t.get("name", tid), "description": t.get("description", "")}
        for tid, t in templates.items()
    ]
    return web.json_response(result)

@PromptServer.instance.routes.get("/preset-manager/presets/{template_id}")
async def get_presets_list(request):
    """Get all presets for a template."""
    template_id = request.match_info["template_id"]
    print(f"[PresetManager] API: 获取预设列表 ({template_id})")
    presets = load_presets(template_id)
    # Return list of {id, name, description} for each preset
    result = [
        {"id": p["id"], "name": p.get("name", p["id"]), "description": p.get("description", "")}
        for p in presets
    ]
    return web.json_response(result)

@PromptServer.instance.routes.get("/preset-manager/preset/{template_id}/{preset_id}")
async def get_preset_detail(request):
    """Get a single preset detail."""
    template_id = request.match_info["template_id"]
    preset_id = request.match_info["preset_id"]
    print(f"[PresetManager] API: 获取预设详情 ({template_id}/{preset_id})")
    preset = get_preset(template_id, preset_id)
    if preset is None:
        return web.json_response({"error": "Preset not found"}, status=404)
    return web.json_response(preset)

@PromptServer.instance.routes.post("/preset-manager/preset")
async def save_preset_endpoint(request):
    """Save a new preset."""
    try:
        data = await request.json()
        template_id = data.get("workflow_template")
        preset_id = data.get("id")
        print(f"[PresetManager] API: 保存预设 ({template_id}/{preset_id})")
        if not template_id or not preset_id:
            return web.json_response({"error": "Missing workflow_template or id"}, status=400)
        
        success = save_preset(template_id, preset_id, data)
        if success:
            return web.json_response({"status": "ok"})
        else:
            return web.json_response({"error": "Failed to save"}, status=500)
    except Exception as e:
        print(f"[PresetManager] API: 保存预设异常: {e}")
        return web.json_response({"error": str(e)}, status=500)

@PromptServer.instance.routes.delete("/preset-manager/preset/{template_id}/{preset_id}")
async def delete_preset_endpoint(request):
    """Delete a preset."""
    template_id = request.match_info["template_id"]
    preset_id = request.match_info["preset_id"]
    print(f"[PresetManager] API: 删除预设 ({template_id}/{preset_id})")
    success = delete_preset(template_id, preset_id)
    if success:
        return web.json_response({"status": "ok"})
    else:
        return web.json_response({"error": "Preset not found"}, status=404)

@PromptServer.instance.routes.post("/preset-manager/apply")
async def apply_preset_endpoint(request):
    """Apply a preset to the current workflow."""
    try:
        data = await request.json()
        template_id = data.get("workflow")
        preset_id = data.get("preset")
        print(f"[PresetManager] API: 应用预设 ({template_id}/{preset_id})")
        
        if not template_id or not preset_id:
            return web.json_response({"error": "Missing workflow or preset"}, status=400)
        
        # Load template and preset
        template = get_template(template_id)
        if template is None:
            return web.json_response({"error": f"Template '{template_id}' not found"}, status=404)
        
        preset = get_preset(template_id, preset_id)
        if preset is None:
            return web.json_response({"error": f"Preset '{preset_id}' not found"}, status=404)
        
        # Get current workflow from ComfyUI
        # Note: This requires the frontend to send the current workflow
        current_workflow = data.get("current_workflow")
        if not current_workflow:
            return web.json_response({"error": "Missing current_workflow"}, status=400)
        
        # Apply preset
        modified_workflow = apply_preset(current_workflow, template, preset.get("params", {}))
        
        # Return the modified workflow for frontend to apply
        return web.json_response({
            "status": "ok",
            "workflow": modified_workflow
        })
    except Exception as e:
        print(f"[PresetManager] API: 应用预设异常: {e}")
        return web.json_response({"error": str(e)}, status=500)
