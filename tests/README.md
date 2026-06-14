# ComfyUI Preset Manager - Tests

## Running Tests

Tests must be run with the conftest.py file as the config to mock ComfyUI dependencies:

```bash
# From plugin root directory
python -m pytest tests/ -v -c tests/conftest.py

# Or with explicit path
python -m pytest tests/ -v --conftest=tests/conftest.py
```

## Why `-c tests/conftest.py`?

The plugin's `__init__.py` imports ComfyUI dependencies (aiohttp, server, folder_paths) that are only available at runtime inside ComfyUI. The `tests/conftest.py` file mocks these dependencies before pytest tries to collect tests.

Without the `-c` flag, pytest will try to import `__init__.py` and fail with `ImportError: attempted relative import with no known parent package`.

## Test Structure

- `conftest.py` - Shared fixtures and ComfyUI dependency mocks
- `test_workflow_parser.py` - Tests for template discovery and parsing
- `test_node_matcher.py` - Tests for node matching algorithms
- `test_preset_manager.py` - Tests for preset CRUD operations
