"""
Shared fixtures for ComfyUI Preset Manager tests.
"""

import pytest
import tempfile
import shutil
import sys
import types
import importlib.util
from pathlib import Path

# Plugin directory
PLUGIN_DIR = Path(__file__).parent.parent

# Mock ComfyUI dependencies before any imports
# These are only available at runtime inside ComfyUI

# Mock aiohttp
aiohttp = types.ModuleType("aiohttp")
aiohttp.web = types.ModuleType("aiohttp.web")
sys.modules["aiohttp"] = aiohttp
sys.modules["aiohttp.web"] = aiohttp.web

# Mock server module
server = types.ModuleType("server")
server.PromptServer = types.ModuleType("server.PromptServer")
server.PromptServer.instance = types.ModuleType("server.PromptServer.instance")
server.PromptServer.instance.routes = types.ModuleType("server.PromptServer.instance.routes")
sys.modules["server"] = server

# Mock folder_paths module
folder_paths = types.ModuleType("folder_paths")
folder_paths.get_user_directory = lambda: "/tmp/test_user"
sys.modules["folder_paths"] = folder_paths


def _import_module_from_file(module_name: str, file_path: Path):
    """Import a module directly from file path, bypassing __init__.py."""
    # Mock folder_paths if not available (ComfyUI dependency)
    if "folder_paths" not in sys.modules:
        import types
        folder_paths = types.ModuleType("folder_paths")
        
        def get_user_directory():
            return str(Path.home() / "ComfyUI" / "user")
        
        folder_paths.get_user_directory = get_user_directory
        sys.modules["folder_paths"] = folder_paths
    
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def sample_workflow():
    """
    Sample ComfyUI workflow with standard SDXL nodes.
    Mimics a real workflow with KSampler, EmptyLatentImage, and two CLIPTextEncode nodes.
    """
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 42,
                "steps": 20,
                "cfg": 7.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            },
            "_meta": {
                "title": "KSampler"
            }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 512,
                "height": 512,
                "batch_size": 1
            },
            "_meta": {
                "title": "EmptyLatentImage"
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "old positive prompt",
                "clip": ["4", 1]
            },
            "_meta": {
                "title": "CLIPTextEncode (positive)"
            }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "old negative prompt",
                "clip": ["4", 1]
            },
            "_meta": {
                "title": "CLIPTextEncode (negative)"
            }
        }
    }


@pytest.fixture
def sample_template():
    """
    Sample workflow template matching the SDXL workflow structure.
    """
    return {
        "name": "SDXL Text to Image",
        "description": "SDXL 基础文生图 workflow",
        "version": "1.0",
        "node_mapping": {
            "positive_prompt": {
                "match_strategy": "title_keyword",
                "class_type": "CLIPTextEncode",
                "title_keywords": ["positive", "正向"],
                "widget": "text"
            },
            "negative_prompt": {
                "match_strategy": "title_keyword",
                "class_type": "CLIPTextEncode",
                "title_keywords": ["negative", "负向"],
                "widget": "text"
            },
            "sampler": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "sampler_name"
            },
            "scheduler": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "scheduler"
            },
            "steps": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "steps"
            },
            "cfg": {
                "match_strategy": "unique_class",
                "class_type": "KSampler",
                "widget": "cfg"
            },
            "width": {
                "match_strategy": "unique_class",
                "class_type": "EmptyLatentImage",
                "widget": "width"
            },
            "height": {
                "match_strategy": "unique_class",
                "class_type": "EmptyLatentImage",
                "widget": "height"
            }
        },
        "synonyms": {
            "KSamplerAdvanced": "KSampler",
            "KSamplerEfficient": "KSampler"
        }
    }


@pytest.fixture
def sample_preset():
    """
    Sample preset with values for all 8 parameters.
    """
    return {
        "name": "高质量出图",
        "description": "用于最终输出的高质量配置",
        "workflow_template": "sdxl-txt2img",
        "params": {
            "positive_prompt": "masterpiece, best quality, ultra detailed",
            "negative_prompt": "worst quality, low quality, blurry",
            "sampler": "euler_ancestral",
            "scheduler": "normal",
            "steps": 30,
            "cfg": 7.0,
            "width": 1024,
            "height": 1024
        }
    }


@pytest.fixture
def temp_dir():
    """
    Create a temporary directory for test files.
    Automatically cleaned up after test.
    """
    tmpdir = tempfile.mkdtemp()
    yield Path(tmpdir)
    shutil.rmtree(tmpdir)


@pytest.fixture
def workflow_parser():
    """Import and return the workflow_parser module."""
    return _import_module_from_file("workflow_parser", PLUGIN_DIR / "workflow_parser.py")


@pytest.fixture
def node_matcher():
    """Import and return the node_matcher module."""
    return _import_module_from_file("node_matcher", PLUGIN_DIR / "node_matcher.py")


@pytest.fixture
def preset_manager():
    """Import and return the preset_manager module."""
    return _import_module_from_file("preset_manager", PLUGIN_DIR / "preset_manager.py")
