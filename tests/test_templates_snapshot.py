"""
Bundled workflow templates must match the fixture used by the JS matcher tests.

When workflows/*.yaml changes intentionally, regenerate the snapshot:

    python tests/tools/dump_templates.py
"""

import json
from pathlib import Path

FIXTURES = Path(__file__).parent / "fixtures"
SNAPSHOT = FIXTURES / "templates.json"
GRAPHS = FIXTURES / "graphs"


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_bundled_templates_match_snapshot(workflow_parser):
    templates = workflow_parser.load_templates()
    snapshot = _read_json(SNAPSHOT)

    assert templates == snapshot, (
        "workflows/*.yaml no longer matches tests/fixtures/templates.json; "
        "regenerate the snapshot with python tests/tools/dump_templates.py"
    )


def test_every_template_has_a_graph_fixture():
    snapshot = _read_json(SNAPSHOT)
    targets = {
        _read_json(path)["template"]
        for path in GRAPHS.glob("*.json")
    }

    assert targets == set(snapshot), (
        "every template needs one tests/fixtures/graphs/*.json fixture "
        "so the JS matcher tests exercise the real template"
    )
