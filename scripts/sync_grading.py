#!/usr/bin/env python3
"""Copy the canonical grader into every self-contained Harbor task."""

from __future__ import annotations

import argparse
import filecmp
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TASK_ROOT = ROOT / "examples" / "harbor-office-tasks"
CANONICAL = ROOT / "grading"
FILES = ("eval_core.py", "score.py")


def task_dirs() -> list[Path]:
    return sorted(path for path in TASK_ROOT.iterdir() if path.is_dir() and (path / "task.toml").is_file())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if a task copy differs")
    args = parser.parse_args()
    drift: list[str] = []
    for task in task_dirs():
        destination = task / "tests" / "grading"
        destination.mkdir(parents=True, exist_ok=True)
        for name in FILES:
            source = CANONICAL / name
            target = destination / name
            same = target.is_file() and filecmp.cmp(source, target, shallow=False)
            if args.check and not same:
                drift.append(str(target.relative_to(ROOT)))
            elif not args.check and not same:
                shutil.copyfile(source, target)
    if drift:
        print("Grader copies are stale; run: python scripts/sync_grading.py")
        for path in drift:
            print(f"  - {path}")
        return 1
    print(f"Grader copies {'match' if args.check else 'synchronized'} for {len(task_dirs())} tasks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
