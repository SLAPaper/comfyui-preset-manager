from pathlib import Path

from aiohttp import web
from server import PromptServer

try:
    from .storage import is_safe_id
    from .workflow_parser import get_template, load_templates, save_template, template_source
    from .preset_manager import load_presets, get_preset, save_preset, delete_preset
    from .sweep_manager import load_sweeps, get_sweep, save_sweep, delete_sweep, expand
except ImportError:
    # Fallback for testing outside ComfyUI (relative import without package context)
    import importlib.util as _ilu
    import sys
    _dir = Path(__file__).parent
    for _name in ("storage", "workflow_parser", "preset_manager", "sweep_manager"):
        _spec = _ilu.spec_from_file_location(_name, str(_dir / f"{_name}.py"))
        _mod = _ilu.module_from_spec(_spec)
        _spec.loader.exec_module(_mod)
        sys.modules[_name] = _mod
    from storage import is_safe_id
    from workflow_parser import get_template, load_templates, save_template, template_source
    from preset_manager import load_presets, get_preset, save_preset, delete_preset
    from sweep_manager import load_sweeps, get_sweep, save_sweep, delete_sweep, expand

PLUGIN_DIR = Path(__file__).parent

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
WEB_DIRECTORY = "./web"

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']


def _reject_id():
    raise web.HTTPBadRequest(text='{"error": "Invalid id"}', content_type="application/json")


def _match_ids(request, *names):
    values = tuple(request.match_info.get(name, "") for name in names)
    if not all(is_safe_id(value) for value in values):
        _reject_id()
    return values


def _body_ids(data, *names):
    values = tuple(data.get(name) for name in names)
    if not all(is_safe_id(value) for value in values):
        _reject_id()
    return values


def _register_routes():
    routes = PromptServer.instance.routes

    @routes.get("/preset-manager/workflows")
    async def get_workflows(request):
        templates = load_templates()
        return web.json_response([
            {
                "id": tid,
                "name": t.get("name", tid),
                "description": t.get("description", ""),
                "source": template_source(tid),
            }
            for tid, t in templates.items()
        ])

    @routes.get("/preset-manager/template/{template_id}")
    async def get_template_detail(request):
        (template_id,) = _match_ids(request, "template_id")
        template = get_template(template_id)
        if template is None:
            return web.json_response({"error": "Template not found"}, status=404)
        return web.json_response(template)

    @routes.post("/preset-manager/template")
    async def save_template_endpoint(request):
        data = await request.json()
        (template_id,) = _body_ids(data, "id")
        if template_id.startswith("_"):
            _reject_id()
        if save_template(template_id, data):
            return web.json_response({"status": "ok", "id": template_id})
        return web.json_response({"error": "Invalid template"}, status=400)

    @routes.get("/preset-manager/presets/{template_id}")
    async def get_presets_list(request):
        (template_id,) = _match_ids(request, "template_id")
        return web.json_response([
            {
                "id": p["id"],
                "name": p.get("name", p["id"]),
                "description": p.get("description", ""),
                "source": p.get("source", "user"),
            }
            for p in load_presets(template_id)
        ])

    @routes.get("/preset-manager/preset/{template_id}/{preset_id}")
    async def get_preset_detail(request):
        template_id, preset_id = _match_ids(request, "template_id", "preset_id")
        preset = get_preset(template_id, preset_id)
        if preset is None:
            return web.json_response({"error": "Preset not found"}, status=404)
        return web.json_response(preset)

    @routes.post("/preset-manager/preset")
    async def save_preset_endpoint(request):
        data = await request.json()
        template_id, preset_id = _body_ids(data, "workflow_template", "id")
        if save_preset(template_id, preset_id, data):
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Failed to save"}, status=500)

    @routes.delete("/preset-manager/preset/{template_id}/{preset_id}")
    async def delete_preset_endpoint(request):
        template_id, preset_id = _match_ids(request, "template_id", "preset_id")
        if delete_preset(template_id, preset_id):
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Preset not found"}, status=404)

    @routes.get("/preset-manager/sweeps/{template_id}")
    async def get_sweeps(request):
        (template_id,) = _match_ids(request, "template_id")
        return web.json_response(load_sweeps(template_id))

    @routes.get("/preset-manager/sweep/{template_id}/{sweep_id}")
    async def get_sweep_detail(request):
        template_id, sweep_id = _match_ids(request, "template_id", "sweep_id")
        sweep = get_sweep(template_id, sweep_id)
        if sweep is None:
            return web.json_response({"error": "Sweep not found"}, status=404)
        return web.json_response(sweep)

    @routes.post("/preset-manager/sweep")
    async def save_sweep_endpoint(request):
        data = await request.json()
        template_id, sweep_id = _body_ids(data, "workflow_template", "id")
        if save_sweep(template_id, sweep_id, data):
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Failed to save"}, status=500)

    @routes.delete("/preset-manager/sweep/{template_id}/{sweep_id}")
    async def delete_sweep_endpoint(request):
        template_id, sweep_id = _match_ids(request, "template_id", "sweep_id")
        if delete_sweep(template_id, sweep_id):
            return web.json_response({"status": "ok"})
        return web.json_response({"error": "Sweep not found"}, status=404)

    @routes.post("/preset-manager/sweep/expand")
    async def expand_sweep_endpoint(request):
        data = await request.json()
        (template_id,) = _body_ids(data, "workflow_template")
        sweep = data.get("sweep")
        if not isinstance(sweep, dict):
            return web.json_response({"error": "Missing sweep"}, status=400)

        presets = {p["id"]: p for p in load_presets(template_id)}
        try:
            combos = expand(sweep, presets)
        except KeyError as e:
            return web.json_response({"error": str(e)}, status=400)
        return web.json_response({"combinations": combos})


if hasattr(PromptServer.instance.routes, 'get'):
    _register_routes()
