"""
Smoke tests for module imports.
"""


def test_storage_imports(storage):
    assert storage.is_safe_id("sdxl-txt2img")


def test_workflow_parser_imports(workflow_parser):
    assert callable(workflow_parser.load_templates)


def test_preset_manager_imports(preset_manager):
    assert callable(preset_manager.load_presets)


def test_sweep_manager_imports(sweep_manager):
    assert callable(sweep_manager.expand)
