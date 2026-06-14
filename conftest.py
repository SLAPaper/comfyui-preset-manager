"""Conftest at plugin root to mock ComfyUI dependencies."""

import sys
import types

# Mock ComfyUI dependencies that __init__.py imports
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

collect_ignore = ["__init__.py"]
