import os
import json
from pathlib import Path
from aiohttp import web
from server import PromptServer

try:
    from .workflow_parser import load_templates, get_template
    from .node_matcher import match_nodes, apply_preset
    from .preset_manager import load_presets, get_preset, save_preset, delete_preset
    from .mapping_manager import load_mapping, save_mapping
    from .sweep_manager import load_sweeps, get_sweep, save_sweep, delete_sweep, expand
except ImportError:
    # Fallback for testing outside ComfyUI (relative import without package context)
    import importlib.util as _ilu
    import sys
    _dir = Path(__file__).parent
    for _name in ("workflow_parser", "node_matcher", "preset_manager", "mapping_manager", "sweep_manager"):
        _spec = _ilu.spec_from_file_location(_name, str(_dir / f"{_name}.py"))
        _mod = _ilu.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        sys.modules[_name] = _mod
    from workflow_parser import load_templates, get_template
    from node_matcher import match_nodes, apply_preset
    from preset_manager import load_presets, get_preset, save_preset, delete_preset
    from mapping_manager import load_mapping, save_mapping
    from sweep_manager import load_sweeps, get_sweep, save_sweep, delete_sweep, expand

PLUGIN_DIR = Path(__file__).parent

# ComfyUI node registration (empty - this plugin provides API only)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']


def _register_routes():
    """Register API routes with ComfyUI's PromptServer."""
    routes = PromptServer.instance.routes

    @routes.get("/preset-manager/workflows")
    async def get_workflows(request):
        """Get all workflow templates."""
        print("[PresetManager] API: 获取模板列表")
        templates = load_templates()
        result = [
            {"id": tid, "name": t.get("name", tid), "description": t.get("description", "")}
            for tid, t in templates.items()
        ]
        return web.json_response(result)

    @routes.get("/preset-manager/presets/{template_id}")
    async def get_presets_list(request):
        """Get all presets for a template."""
        template_id = request.match_info["template_id"]
        print(f"[PresetManager] API: 获取预设列表 ({template_id})")
        presets = load_presets(template_id)
        result = [
            {"id": p["id"], "name": p.get("name", p["id"]), "description": p.get("description", "")}
            for p in presets
        ]
        return web.json_response(result)

    @routes.get("/preset-manager/template/{template_id}")
    async def get_template_detail(request):
        """Get a workflow template with full node_mapping."""
        template_id = request.match_info["template_id"]
        print(f"[PresetManager] API: 获取模板详情 ({template_id})")
        template = get_template(template_id)
        if template is None:
            return web.json_response({"error": "Template not found"}, status=404)
        return web.json_response(template)

    @routes.get("/preset-manager/preset/{template_id}/{preset_id}")
    async def get_preset_detail(request):
        """Get a single preset detail."""
        template_id = request.match_info["template_id"]
        preset_id = request.match_info["preset_id"]
        print(f"[PresetManager] API: 获取预设详情 ({template_id}/{preset_id})")
        preset = get_preset(template_id, preset_id)
        if preset is None:
            return web.json_response({"error": "Preset not found"}, status=404)
        return web.json_response(preset)

    @routes.post("/preset-manager/preset")
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

    @routes.delete("/preset-manager/preset/{template_id}/{preset_id}")
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

    @routes.post("/preset-manager/apply")
    async def apply_preset_endpoint(request):
        """Apply a preset to the current workflow."""
        try:
            data = await request.json()
            template_id = data.get("workflow")
            preset_id = data.get("preset")
            print(f"[PresetManager] API: 应用预设 ({template_id}/{preset_id})")

            if not template_id or not preset_id:
                return web.json_response({"error": "Missing workflow or preset"}, status=400)

            template = get_template(template_id)
            if template is None:
                return web.json_response({"error": f"Template '{template_id}' not found"}, status=404)

            preset = get_preset(template_id, preset_id)
            if preset is None:
                return web.json_response({"error": f"Preset '{preset_id}' not found"}, status=404)

            current_workflow = data.get("current_workflow")
            if not current_workflow:
                return web.json_response({"error": "Missing current_workflow"}, status=400)

            modified_workflow = apply_preset(current_workflow, template, preset.get("params", {}))

            return web.json_response({
                "status": "ok",
                "workflow": modified_workflow
            })
        except Exception as e:
            print(f"[PresetManager] API: 应用预设异常: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.get("/preset-manager/sweeps/{template_id}")
    async def get_sweeps(request):
        """Get sweep list for a template."""
        template_id = request.match_info["template_id"]
        print(f"[PresetManager] API: 获取扫描配置列表 ({template_id})")
        return web.json_response(load_sweeps(template_id))

    @routes.get("/preset-manager/sweep/{template_id}/{sweep_id}")
    async def get_sweep_detail(request):
        """Get a single sweep config."""
        template_id = request.match_info["template_id"]
        sweep_id = request.match_info["sweep_id"]
        print(f"[PresetManager] API: 获取扫描配置详情 ({template_id}/{sweep_id})")
        sweep = get_sweep(template_id, sweep_id)
        if sweep is None:
            return web.json_response({"error": "Sweep not found"}, status=404)
        return web.json_response(sweep)

    @routes.post("/preset-manager/sweep")
    async def save_sweep_endpoint(request):
        """Create or update a sweep config."""
        try:
            data = await request.json()
            template_id = data.get("workflow_template")
            sweep_id = data.get("id")
            print(f"[PresetManager] API: 保存扫描配置 ({template_id}/{sweep_id})")

            if not template_id or not sweep_id:
                return web.json_response({"error": "Missing workflow_template or id"}, status=400)

            save_sweep(template_id, sweep_id, data)
            return web.json_response({"status": "ok"})
        except Exception as e:
            print(f"[PresetManager] API: 保存扫描配置异常: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.delete("/preset-manager/sweep/{template_id}/{sweep_id}")
    async def delete_sweep_endpoint(request):
        """Delete a sweep config."""
        template_id = request.match_info["template_id"]
        sweep_id = request.match_info["sweep_id"]
        print(f"[PresetManager] API: 删除扫描配置 ({template_id}/{sweep_id})")
        if delete_sweep(template_id, sweep_id):
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Sweep not found"}, status=404)

    @routes.post("/preset-manager/sweep/expand")
    async def expand_sweep_endpoint(request):
        """Expand a sweep config into its list of combinations."""
        try:
            data = await request.json()
            template_id = data.get("workflow_template")
            sweep = data.get("sweep")
            print(f"[PresetManager] API: 展开扫描配置 ({template_id})")

            if not template_id or sweep is None:
                return web.json_response({"error": "Missing workflow_template or sweep"}, status=400)

            presets = {p["id"]: get_preset(template_id, p["id"]) for p in load_presets(template_id)}
            combos = expand(sweep, presets)
            return web.json_response({"combinations": combos})
        except KeyError as e:
            return web.json_response({"error": str(e)}, status=400)
        except Exception as e:
            print(f"[PresetManager] API: 展开扫描配置异常: {e}")
            return web.json_response({"error": str(e)}, status=500)

    @routes.get("/preset-manager/mapping")
    async def get_mapping_endpoint(request):
        """Get all workflow name → template ID mappings."""
        print("[PresetManager] API: 获取映射列表")
        mapping = load_mapping()
        return web.json_response(mapping)

    @routes.post("/preset-manager/mapping")
    async def save_mapping_endpoint(request):
        """Save workflow name → template ID mapping."""
        try:
            data = await request.json()
            workflow_name = data.get("workflow_name")
            template_id = data.get("template_id")
            print(f"[PresetManager] API: 保存映射 ({workflow_name} -> {template_id})")

            if not workflow_name or not template_id:
                return web.json_response({"error": "Missing workflow_name or template_id"}, status=400)

            mapping = load_mapping()
            mapping[workflow_name] = template_id
            success = save_mapping(mapping)

            if success:
                return web.json_response({"status": "ok"})
            else:
                return web.json_response({"error": "Failed to save mapping"}, status=500)
        except Exception as e:
            print(f"[PresetManager] API: 保存映射异常: {e}")
            return web.json_response({"error": str(e)}, status=500)


# Register routes when loaded by ComfyUI (skip during testing)
if hasattr(PromptServer.instance.routes, 'get'):
    _register_routes()
