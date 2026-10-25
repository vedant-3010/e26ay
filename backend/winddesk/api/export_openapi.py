"""Write the OpenAPI document to a file: ``python -m winddesk.api.export_openapi OUT.json``.

``make gen-api`` feeds the result to ``openapi-typescript`` (ADR-0005).
"""

import json
import sys
from pathlib import Path

from ..main import create_app


def main(argv: list[str]) -> None:
    if len(argv) != 1:
        raise SystemExit("usage: python -m winddesk.api.export_openapi OUT.json")
    out = Path(argv[0])
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = create_app().openapi()
    out.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
