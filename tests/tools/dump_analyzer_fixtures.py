"""Regenerate representative workflow fixtures for template-analyzer tests.

The fixtures come from locally saved workflows and the bundled ComfyUI template
library. Serialized workflows only carry widget values, so this tool maps the
widget names for the node types the analyzer knows about.

Run from the plugin root with ComfyUI's Python:

    python tests/tools/dump_analyzer_fixtures.py
"""

import importlib.util
import json
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent.parent
COMFYUI_DIR = PLUGIN_DIR.parent.parent
OUTPUT = PLUGIN_DIR / "tests" / "fixtures" / "analyzer"

WIDGETS = {
    "KSampler": ["seed", "control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
    "KSamplerAdvanced": [
        "add_noise", "noise_seed", "control_after_generate", "steps", "cfg",
        "sampler_name", "scheduler", "start_at_step", "end_at_step",
        "return_with_leftover_noise",
    ],
    "CLIPTextEncode": ["text"],
    "CLIPLoader": ["clip_name", "type", "device"],
    "DualCLIPLoader": ["clip_name1", "clip_name2", "type", "device"],
    "VAELoader": ["vae_name"],
    "UNETLoader": ["unet_name", "weight_dtype"],
    "UnetLoaderGGUF": ["unet_name"],
    "UnetLoaderGGUFAdvanced": ["unet_name", "dequant_dtype", "patch_dtype", "patch_on_device"],
    "UNETLoaderNF4": ["unet_name", "bnb_dtype"],
    "NunchakuQwenImageDiTLoader": ["model_name", "cpu_offload"],
    "CheckpointLoaderSimple": ["ckpt_name"],
    "CheckpointLoaderGGUF": ["ckpt_name"],
    "CheckpointLoaderNF4": ["ckpt_name", "bnb_dtype"],
    "EmptyLatentImage": ["width", "height", "batch_size"],
    "EmptySD3LatentImage": ["width", "height", "batch_size"],
    "EmptyFlux2LatentImage": ["width", "height", "batch_size"],
    "BasicScheduler": ["scheduler", "steps", "denoise"],
    "Flux2Scheduler": ["steps", "width", "height"],
    "KSamplerSelect": ["sampler_name"],
    "FluxGuidance": ["guidance"],
    "RandomNoise": ["noise_seed", "control_after_generate"],
    "ModelSamplingFlux": ["max_shift", "base_shift", "width", "height"],
    "ModelSamplingAuraFlow": ["shift", "sampling"],
    "CFGGuider": ["cfg"],
    "PrimitiveInt": ["value"],
    "PrimitiveFloat": ["value"],
    "PrimitiveStringMultiline": ["value"],
    "TextEncodeQwenImageEdit": ["prompt"],
    "TextEncodeQwenImageEditPlus": ["prompt"],
    "TextEncodeQwenImage21": ["prompt", "negative_prompt", "resolution"],
}


def _templates_dir() -> Path:
    spec = importlib.util.find_spec("comfyui_workflow_templates_json")
    if spec is None or not spec.submodule_search_locations:
        raise RuntimeError("comfyui_workflow_templates_json is not installed")
    return Path(next(iter(spec.submodule_search_locations))) / "templates"


def _shorten(value):
    if isinstance(value, str) and len(value) > 240:
        return value[:240] + "…"
    return value


def _widgets(node: dict) -> dict:
    named = node.get("widgets_values_named")
    if isinstance(named, dict):
        return {name: _shorten(value) for name, value in named.items()}

    values = node.get("widgets_values")
    if not isinstance(values, list):
        return {}

    names = WIDGETS.get(node.get("type"), [])
    return {
        name: _shorten(value)
        for name, value in zip(names, values)
    }


def _links(workflow: dict) -> dict:
    result = {}
    for link in workflow.get("links") or []:
        if isinstance(link, dict):
            link_id = link.get("id")
            origin_id = link.get("origin_id")
            origin_slot = link.get("origin_slot")
            target_id = link.get("target_id")
            target_slot = link.get("target_slot")
        else:
            link_id, origin_id, origin_slot, target_id, target_slot, *_ = link
        result[str(link_id)] = {
            "origin_id": origin_id,
            "origin_slot": origin_slot,
            "target_id": target_id,
            "target_slot": target_slot,
        }
    return result


def _graph(workflow: dict) -> dict:
    nodes = []
    for node in workflow.get("nodes") or []:
        nodes.append({
            "id": node.get("id"),
            "type": node.get("type"),
            "title": node.get("title", ""),
            "widgets": [
                {"name": name, "value": value}
                for name, value in _widgets(node).items()
            ],
            "inputs": [
                {"name": item.get("name"), "link": item.get("link")}
                for item in node.get("inputs") or []
            ],
        })
    return {"nodes": nodes, "links": _links(workflow)}


def _samples() -> dict[str, Path]:
    templates = _templates_dir()
    return {
        "anima-local": COMFYUI_DIR / "user" / "default" / "workflows" / "Anima.json",
        "flux-local": COMFYUI_DIR / "user" / "default" / "workflows" / "Flux.json",
        "qwen-edit-local": COMFYUI_DIR / "user" / "default" / "workflows" / "qwen_image_edit.json",
        "z-image-local": COMFYUI_DIR / "user" / "default" / "workflows" / "z_image.json",
        "sdxl-local": COMFYUI_DIR / "user" / "default" / "workflows" / "SDXL.json",
        "chroma-template": templates / "image_chroma_text_to_image.json",
        "flux-schnell-template": templates / "flux_schnell.json",
        "hidream-template": templates / "hidream_e1_full.json",
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for sample_id, path in _samples().items():
        if not path.is_file():
            print(f"Skipping {sample_id}: {path} not found")
            continue

        workflow = json.loads(path.read_text(encoding="utf-8"))
        if (workflow.get("definitions") or {}).get("subgraphs"):
            print(f"Skipping {sample_id}: contains subgraphs")
            continue

        data = {
            "sample": sample_id,
            "source": path.name,
            "graph": _graph(workflow),
        }
        output = OUTPUT / f"{sample_id}.json"
        output.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {output.relative_to(PLUGIN_DIR)}")


if __name__ == "__main__":
    main()
