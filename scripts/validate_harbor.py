#!/usr/bin/env python3
"""Cross-platform structural and regression validation for Harbor examples."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tarfile
import tomllib
from pathlib import Path, PurePosixPath


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET = ROOT / "examples" / "harbor-office-tasks"
CANONICAL_GRADER = ROOT / "grading"
REQUIRED = (
    "task.toml", "instruction.md", "README.md", "environment/Dockerfile",
    "environment/docker-compose.yaml", "environment/workspace.tar.gz",
    "tests/test.sh", "tests/gold/gold_answer.json", "tests/grading/eval_core.py",
    "tests/grading/score.py",
)
DEFAULT_IGNORES = ("__pycache__/", ".pyc", ".DS_Store", ".swp", ".swo", "~")
MARKDOWN_LINK_IGNORED_DIRS = {".git", ".pytest_cache", "harbor-jobs", "node_modules"}


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def task_files(task: Path) -> list[Path]:
    files: list[Path] = []
    for name in ("task.toml", "instruction.md", "README.md", "trajectory.json"):
        path = task / name
        if path.is_file():
            files.append(path)
    for name in ("environment", "tests", "solution", "steps"):
        directory = task / name
        if directory.is_dir():
            files.extend(path for path in directory.rglob("*") if path.is_file())
    filtered = []
    for path in files:
        relative = path.relative_to(task).as_posix()
        if "__pycache__/" in relative or relative.endswith((".pyc", ".swp", ".swo", "~")) or relative.endswith(".DS_Store"):
            continue
        filtered.append(path)
    return sorted(filtered, key=lambda path: path.relative_to(task).as_posix())


def task_digest(task: Path) -> str:
    outer = hashlib.sha256()
    for path in task_files(task):
        relative = path.relative_to(task).as_posix()
        content_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        outer.update(f"{relative}\0{content_hash}\n".encode())
    return "sha256:" + outer.hexdigest()


def validate_archive(task: Path, instruction: str, gold: dict, errors: list[str]) -> None:
    archive = task / "environment" / "workspace.tar.gz"
    try:
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            names = [PurePosixPath(member.name).as_posix().lstrip("./") for member in members]
            for member, name in zip(members, names):
                path = PurePosixPath(name)
                if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk():
                    fail(errors, f"{task.name}: unsafe archive member {member.name!r}")
                if "\ufffd" in member.name:
                    fail(errors, f"{task.name}: archive member has replacement characters: {member.name!r}")
            input_files = [name for member, name in zip(members, names) if member.isfile() and name.startswith("input/")]
            output_files = [name for member, name in zip(members, names) if member.isfile() and name.startswith("output/")]
            if not input_files:
                fail(errors, f"{task.name}: archive has no input files")
            if output_files:
                fail(errors, f"{task.name}: archive output/ must be empty: {output_files}")
            if not any(name == "input" or name.startswith("input/") for name in names):
                fail(errors, f"{task.name}: archive is missing input/")
            if not any(name == "output" or name.startswith("output/") for name in names):
                fail(errors, f"{task.name}: archive is missing output/")
            leaked = [name for name in input_files if re.search(r"(?:gold|answer|solution|result|secret|token|credential)", name, re.I)]
            if leaked:
                fail(errors, f"{task.name}: suspicious answer/secret-like input names: {leaked}")
            references = re.findall(r"`input/([^`]+)`", instruction)
            for reference in references:
                expected = "input/" + reference.rstrip("/")
                if not any(name == expected or name.startswith(expected + "/") for name in names):
                    fail(errors, f"{task.name}: instruction references missing archive path {expected!r}")
    except (tarfile.TarError, OSError) as exc:
        fail(errors, f"{task.name}: invalid workspace.tar.gz: {exc}")

    expected_output = gold.get("output_contract", {}).get("path", "")
    relative_output = expected_output.removeprefix("/workspace/")
    if not relative_output or f"`{relative_output}`" not in instruction:
        fail(errors, f"{task.name}: instruction and gold output paths differ ({expected_output!r})")


def validate_markdown_links(errors: list[str]) -> None:
    pattern = re.compile(r"\[[^\]]+\]\(([^)]+)\)")
    for path in ROOT.rglob("*.md"):
        if MARKDOWN_LINK_IGNORED_DIRS.intersection(path.relative_to(ROOT).parts):
            continue
        for target in pattern.findall(path.read_text(encoding="utf-8")):
            clean = target.strip().strip("<>").split("#", 1)[0]
            if not clean or re.match(r"(?:https?|mailto|app):", clean):
                continue
            candidate = (path.parent / clean).resolve()
            if not candidate.exists():
                fail(errors, f"broken Markdown link: {path.relative_to(ROOT)} -> {target}")


def validate_docker(dataset: Path, errors: list[str]) -> None:
    try:
        subprocess.run(["docker", "info"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    except (FileNotFoundError, subprocess.SubprocessError) as exc:
        fail(errors, f"Docker validation requested but daemon is unavailable: {exc}")
        return
    sample = next(path for path in sorted(dataset.iterdir()) if (path / "task.toml").is_file())
    try:
        subprocess.run(
            ["docker", "build", "--tag", "agentic-office-evals-validation:local", str(sample / "environment")],
            check=True,
            timeout=1800,
        )
    except subprocess.SubprocessError as exc:
        fail(errors, f"Dockerfile build check failed: {exc}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", nargs="?", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--docker", action="store_true", help="also require a live Docker daemon and build one representative task image")
    args = parser.parse_args()
    dataset = args.dataset.resolve()
    errors: list[str] = []

    manifest_path = dataset / "dataset.toml"
    if not manifest_path.is_file():
        print(f"ERROR: missing {manifest_path}", file=sys.stderr)
        return 1
    try:
        manifest = tomllib.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"ERROR: invalid dataset.toml: {exc}", file=sys.stderr)
        return 1

    tasks = sorted(path for path in dataset.iterdir() if path.is_dir() and (path / "task.toml").is_file())
    refs = manifest.get("tasks", [])
    refs_by_name = {item.get("name"): item for item in refs}
    if len(refs_by_name) != len(refs):
        fail(errors, "dataset.toml contains duplicate task names")
    seen_names: set[str] = set()
    configured_names: set[str] = set()
    dockerfiles: set[bytes] = set()

    for task in tasks:
        for relative in REQUIRED:
            if not (task / relative).is_file():
                fail(errors, f"{task.name}: missing {relative}")
        if any(not (task / relative).is_file() for relative in REQUIRED):
            continue
        try:
            config = tomllib.loads((task / "task.toml").read_text(encoding="utf-8"))
            gold = json.loads((task / "tests" / "gold" / "gold_answer.json").read_text(encoding="utf-8"))
        except Exception as exc:
            fail(errors, f"{task.name}: TOML/JSON parse failed: {exc}")
            continue
        task_config = config.get("task", {})
        metadata = config.get("metadata", {})
        name = task_config.get("name", "")
        configured_names.add(name)
        if name != name.lower() or not re.fullmatch(r"[a-z0-9][a-z0-9._-]*/[a-z0-9][a-z0-9._-]*", name):
            fail(errors, f"{task.name}: task.name must be a lowercase org/name")
        if name in seen_names:
            fail(errors, f"duplicate task.name: {name}")
        seen_names.add(name)
        if not task_config.get("authors"):
            fail(errors, f"{task.name}: authors must not be empty")
        if metadata.get("example_only") is not True:
            fail(errors, f"{task.name}: metadata.example_only must be true")
        if metadata.get("source_case") != task.name or gold.get("case_id") != task.name:
            fail(errors, f"{task.name}: directory, source_case, and gold case_id must match")
        if not metadata.get("license"):
            fail(errors, f"{task.name}: metadata.license is required")
        if metadata.get("content_origin") == "adapted" and not (task / "tests" / "LICENSE.workbuddy-bench").is_file():
            fail(errors, f"{task.name}: adapted task must package tests/LICENSE.workbuddy-bench")

        instruction = (task / "instruction.md").read_text(encoding="utf-8")
        validate_archive(task, instruction, gold, errors)
        dockerfile = (task / "environment" / "Dockerfile").read_text(encoding="utf-8")
        dockerfiles.add(dockerfile.encode("utf-8"))
        if not re.search(r"^FROM\s+\S+@sha256:[0-9a-f]{64}$", dockerfile, re.M):
            fail(errors, f"{task.name}: Docker base image is not digest-pinned")
        if "@openai/codex" in dockerfile:
            fail(errors, f"{task.name}: task image must not preinstall a specific Agent")
        if re.search(r'"[^"\n]+>=', dockerfile):
            fail(errors, f"{task.name}: direct Python dependencies must use exact versions")
        if "libreoffice-calc" not in dockerfile:
            fail(errors, f"{task.name}: LibreOffice Calc is required for formula recalculation")
        if config.get("verifier", {}).get("network_mode") != "public":
            fail(errors, f"{task.name}: verifier phase must use public for this Windows Docker-compatible example")
        if config.get("agent", {}).get("network_mode") != "public":
            fail(errors, f"{task.name}: agent phase must use public for Docker-provider compatibility")

        for filename in ("eval_core.py", "score.py"):
            if (task / "tests" / "grading" / filename).read_bytes() != (CANONICAL_GRADER / filename).read_bytes():
                fail(errors, f"{task.name}: stale grader copy {filename}; run python scripts/sync_grading.py")
        try:
            compile((task / "tests" / "grading" / "eval_core.py").read_text(encoding="utf-8"), "eval_core.py", "exec")
            compile((task / "tests" / "grading" / "score.py").read_text(encoding="utf-8"), "score.py", "exec")
        except SyntaxError as exc:
            fail(errors, f"{task.name}: grader syntax error: {exc}")

        reference = refs_by_name.get(name)
        computed = task_digest(task)
        if reference is None:
            fail(errors, f"{task.name}: task is absent from dataset.toml")
        elif reference.get("digest") != computed:
            fail(errors, f"{task.name}: stale digest; manifest={reference.get('digest')} computed={computed}")

    if configured_names != set(refs_by_name):
        fail(errors, f"dataset/task membership differs: local={sorted(configured_names)} manifest={sorted(refs_by_name)}")
    if len(dockerfiles) != 1:
        fail(errors, "example Dockerfiles drifted; keep the shared environment definition identical")
    if not (ROOT / "tests" / "test_grading_regression.py").is_file():
        fail(errors, "missing positive/negative grader regression tests")
    validate_markdown_links(errors)
    if args.docker:
        validate_docker(dataset, errors)

    if errors:
        print(f"Validation failed with {len(errors)} issue(s):", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1
    docker_note = "including Dockerfile build check" if args.docker else "Docker build skipped (pass --docker to require it)"
    print(f"OK: {len(tasks)} Harbor tasks passed structure, digest, archive, license, grader, and link checks; {docker_note}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
