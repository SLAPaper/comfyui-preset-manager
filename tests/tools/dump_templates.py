"""Regenerate tests/fixtures/templates.json from workflows/*.yaml.

Run this after an intentional template change:

    python tests/tools/dump_templates.py
"""

import json
import sys
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent.parent
OUTPUT = PLUGIN_DIR / "tests" / "fixtures" / "templates.json"

sys.path.insert(0, str(PLUGIN_DIR))
from workflow_parser import load_bundled_templates


def main() -> None:
    templates = load_bundled_templates()

    OUTPUT.write_text(
        json.dumps(templates, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT} ({len(templates)} templates)")


if __name__ == "__main__":
    main()
