"""Regenerate tests/fixtures/templates.json from workflows/*.yaml.

Run this after an intentional template change:

    python tests/tools/dump_templates.py
"""

import json
from pathlib import Path

import yaml

PLUGIN_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT = PLUGIN_DIR / "tests" / "fixtures" / "templates.json"


def main() -> None:
    templates = {}
    for path in sorted((PLUGIN_DIR / "workflows").glob("*.yaml")):
        templates[path.stem] = yaml.safe_load(path.read_text(encoding="utf-8"))

    OUTPUT.write_text(
        json.dumps(templates, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} ({len(templates)} templates)")


if __name__ == "__main__":
    main()
