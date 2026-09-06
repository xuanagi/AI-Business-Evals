#!/usr/bin/env python3
from __future__ import annotations

import json
import traceback
from pathlib import Path

from eval_core import evaluate


LOG_DIR = Path("/logs/verifier")
GOLD_PATH = Path("/tests/gold/gold_answer.json")


def main() -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    try:
        gold = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
        score = evaluate(gold["output_contract"]["path"], str(GOLD_PATH))
    except Exception as exc:
        score = {
            "reward": 0.0,
            "passed": 0,
            "total": 1,
            "gate_failed": True,
            "checks": [{"name": "evaluator_runtime_error", "passed": False, "detail": repr(exc), "weight": 0.0, "gate": True}],
            "traceback": traceback.format_exc(),
        }

    (LOG_DIR / "score.json").write_text(json.dumps(score, ensure_ascii=False, indent=2), encoding="utf-8")
    (LOG_DIR / "reward.json").write_text(json.dumps({"reward": float(score["reward"])}, ensure_ascii=False), encoding="utf-8")
    (LOG_DIR / "reward.txt").write_text(f'{float(score["reward"]):.10f}\n', encoding="utf-8")
    print(json.dumps(score, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
