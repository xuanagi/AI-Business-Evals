"""Check smoke-trial outcomes: Harbor's CLI exit code alone is not a verdict."""

import json
import sys
from pathlib import Path


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: check_http_smoke.py JOB_DIR [JOB_DIR ...]")
    for directory in sys.argv[1:]:
        trials = list(Path(directory).glob("*/result.json"))
        if len(trials) != 1:
            raise SystemExit(f"Expected one completed smoke trial in {directory}")
        result = json.loads(trials[0].read_text(encoding="utf-8"))
        verifier = result.get("verifier_result") or {}
        if result.get("exception_info") or verifier.get("rewards", {}).get("reward") != 1:
            raise SystemExit(f"Smoke trial did not pass: {trials[0]}")
        print(f"PASS: {directory} reward=1")


if __name__ == "__main__":
    main()
