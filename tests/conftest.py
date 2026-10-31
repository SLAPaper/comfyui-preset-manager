"""
Shared fixtures for ComfyUI Preset Manager tests.
"""

import importlib.util
import shutil
import sys
import tempfile
import types
from pathlib import Path

import pytest

PLUGIN_DIR = Path(__file__).parent.parent
USER_DIR = Path(tempfile.mkdtemp(prefix="preset-manager-test-"))

# Mock ComfyUI dependencies before any imports.

aiohttp = types.ModuleType("aiohttp")
aiohttp.web = types.ModuleType("aiohttp.web")
sys.modules["aiohttp"] = aiohttp
sys.modules["aiohttp.web"] = aiohttp.web

server = types.ModuleType("server")
server.PromptServer = types.ModuleType("server.PromptServer")
server.PromptServer.instance = types.ModuleType("server.PromptServer.instance")
server.PromptServer.instance.routes = types.ModuleType("server.PromptServer.instance.routes")
sys.modules["server"] = server

folder_paths = types.ModuleType("folder_paths")
folder_paths.get_user_directory = lambda: str(USER_DIR)
sys.modules["folder_paths"] = folder_paths


def _import_module_from_file(module_name: str, file_path: Path):
    """Import a module directly from file path, bypassing __init__.py."""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _load_storage():
    if "storage" not in sys.modules:
        _import_module_from_file("storage", PLUGIN_DIR / "storage.py")
    return sys.modules["storage"]


@pytest.fixture
def storage():
    """Import and return the storage module."""
    return _load_storage()


@pytest.fixture
def workflow_parser():
    """Import and return the workflow_parser module."""
    _load_storage()
    return _import_module_from_file("workflow_parser", PLUGIN_DIR / "workflow_parser.py")


@pytest.fixture
def preset_manager():
    """Import and return the preset_manager module."""
    _load_storage()
    return _import_module_from_file("preset_manager", PLUGIN_DIR / "preset_manager.py")


@pytest.fixture
def sweep_manager():
    """Import and return the sweep_manager module."""
    _load_storage()
    return _import_module_from_file("sweep_manager", PLUGIN_DIR / "sweep_manager.py")


@pytest.fixture
def temp_dir():
    """Create a temporary directory, cleaned up after the test."""
    tmpdir = tempfile.mkdtemp()
    yield Path(tmpdir)
    shutil.rmtree(tmpdir)
