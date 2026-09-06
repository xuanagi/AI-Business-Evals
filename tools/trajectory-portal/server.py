#!/usr/bin/env python3
"""Local-only server for the Harbor trajectory portal."""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import mimetypes
import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
import tomllib
import urllib.parse
import webbrowser
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from html.parser import HTMLParser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


PORTAL_DIR = Path(__file__).resolve().parent
DIST_DIR = PORTAL_DIR / "dist"
MAX_LOG_CHARS = 300_000
MAX_PREVIEW_TEXT_CHARS = 40_000
MAX_PREVIEW_ROWS = 30
MAX_PREVIEW_COLUMNS = 16


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return default


def iso_duration_seconds(start: str | None, finish: str | None) -> float | None:
    if not start or not finish:
        return None
    try:
        from datetime import datetime

        return max(0.0, (datetime.fromisoformat(finish.replace("Z", "+00:00")) - datetime.fromisoformat(start.replace("Z", "+00:00"))).total_seconds())
    except (TypeError, ValueError):
        return None


def get_nested(data: dict[str, Any], *keys: str, default: Any = None) -> Any:
    current: Any = data
    for key in keys:
        if not isinstance(current, dict) or key not in current:
            return default
        current = current[key]
    return current


def all_evals(job_result: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    evals = get_nested(job_result, "stats", "evals", default={})
    if not isinstance(evals, dict) or not evals:
        return []
    return [(str(name), value if isinstance(value, dict) else {}) for name, value in evals.items()]


def score_reward(score: dict[str, Any], trial_result: dict[str, Any]) -> float | None:
    reward = get_nested(trial_result, "verifier_result", "rewards", "reward")
    if isinstance(reward, (int, float)):
        return float(reward)
    reward = score.get("reward")
    return float(reward) if isinstance(reward, (int, float)) else None


def numeric_rewards(
    trial_dir: Path, score: dict[str, Any], trial_result: dict[str, Any]
) -> tuple[dict[str, float], list[str], list[dict[str, Any]]]:
    """Read Harbor rewards in authority order and report conflicting auxiliary values."""
    rewards: dict[str, float] = {}
    sources: list[str] = []
    canonical_sources: dict[str, str] = {}
    conflicts: list[dict[str, Any]] = []

    def add(source: str, value: Any) -> None:
        if not isinstance(value, dict):
            return
        added = False
        for key, item in value.items():
            if isinstance(item, (int, float)):
                dimension = str(key)
                numeric = float(item)
                if dimension not in rewards:
                    rewards[dimension] = numeric
                    canonical_sources[dimension] = source
                elif not math.isclose(rewards[dimension], numeric, rel_tol=0, abs_tol=1e-12):
                    conflicts.append({
                        "dimension": dimension,
                        "canonicalSource": canonical_sources[dimension],
                        "canonicalValue": rewards[dimension],
                        "conflictingSource": source,
                        "conflictingValue": numeric,
                    })
                added = True
        if added and source not in sources:
            sources.append(source)

    add("result.json", get_nested(trial_result, "verifier_result", "rewards", default={}))
    add("reward.json", read_json(trial_dir / "verifier" / "reward.json", {}))
    reward_text = trial_dir / "verifier" / "reward.txt"
    if reward_text.is_file():
        try:
            parsed = float(reward_text.read_text(encoding="utf-8", errors="replace").strip())
            add("reward.txt", {"reward": parsed})
        except ValueError:
            pass
    root_score = trial_dir / "verifier" / "score.json"
    if root_score.is_file():
        add("score.json", {"reward": score.get("reward")} if isinstance(score.get("reward"), (int, float)) else {})
    elif not rewards and not step_directories(trial_dir) and not trial_result.get("step_results") and isinstance(score.get("reward"), (int, float)):
        documents = score_documents(trial_dir)
        source = f"{documents[-1][0]}/score.json" if documents and documents[-1][0] else "score.json"
        add(source, {"reward": score.get("reward")})
    return rewards, sources, conflicts


def exception_category(exception: Any) -> str:
    if not exception:
        return ""
    text = json.dumps(exception, ensure_ascii=False).lower() if not isinstance(exception, str) else exception.lower()
    if "cancel" in text:
        return "已取消"
    if "timeout" in text or "timed out" in text:
        return "超时"
    if "verifier" in text or "grader" in text or "test.sh" in text:
        return "评分器"
    if "docker" in text or "environment" in text or "container" in text:
        return "环境"
    if "auth" in text or "credential" in text or "api key" in text:
        return "认证"
    if "node" in text or "npm" in text or "install" in text:
        return "Agent 准备"
    if "artifact" in text:
        return "交付物采集"
    return "Agent / 未分类"


def trial_status(result: dict[str, Any], rewards: dict[str, float]) -> tuple[str, str]:
    exception = result.get("exception_info")
    if exception:
        category = exception_category(exception)
        return ("cancelled" if category == "已取消" else "timeout" if category == "超时" else "errored", category)
    if result.get("finished_at"):
        return ("completed", "运行完成") if rewards else ("unscored", "无评分")
    if rewards:
        return "completed", "运行完成（时间缺失）"
    if result.get("started_at"):
        if get_nested(result, "verifier", "started_at"):
            return "verifying", "评分中"
        return "running", "运行中"
    return "pending", "等待运行"


def phase_durations(result: dict[str, Any], trial_dir: Path | None = None) -> list[dict[str, Any]]:
    phases = [
        ("environment", "环境准备", "environment_setup"),
        ("agentSetup", "Agent 准备", "agent_setup"),
        ("agent", "Agent 执行", "agent_execution"),
        ("verifier", "评分", "verifier"),
    ]
    values = [
        {
            "key": key,
            "label": label,
            "startedAt": get_nested(result, field, "started_at"),
            "finishedAt": get_nested(result, field, "finished_at"),
            "seconds": iso_duration_seconds(get_nested(result, field, "started_at"), get_nested(result, field, "finished_at")),
        }
        for key, label, field in phases
        if get_nested(result, field, "started_at") or get_nested(result, field, "finished_at")
    ]
    if trial_dir is not None:
        manifest = artifact_manifest(trial_dir)
        entries = artifact_entries(trial_dir)
        artifact_dirs = [trial_dir / "artifacts", *[path / "artifacts" for _, path in step_directories(trial_dir)]]
        if manifest or any(path.is_dir() for path in artifact_dirs):
            statuses = {str(entry.get("status") or "unknown") for entry in manifest}
            if "failed" in statuses:
                status, note = "failed", "交付物采集失败；Harbor 未记录该阶段耗时"
            elif (statuses and statuses <= {"empty", "skipped"}) or (
                not manifest
                and not entries
            ):
                status, note = "empty", "没有采集到交付物；Harbor 未记录该阶段耗时"
            else:
                status, note = "completed", "交付物已采集；Harbor manifest 未记录该阶段起止时间"
            values.append({
                "key": "artifact",
                "label": "交付物采集",
                "startedAt": None,
                "finishedAt": None,
                "seconds": None,
                "status": status,
                "note": note,
            })
    return values


def trajectory_validation(path: Path) -> dict[str, Any]:
    trajectory = read_json(path, {})
    if not isinstance(trajectory, dict):
        return {"valid": False, "issues": ["轨迹不是有效 JSON 对象"], "warnings": []}
    steps = trajectory.get("steps")
    if not isinstance(steps, list):
        return {"valid": False, "issues": ["缺少 steps 数组"], "warnings": []}
    issues: list[str] = []
    warnings: list[str] = []
    if not trajectory.get("schema_version"):
        issues.append("缺少 schema_version")
    agent = trajectory.get("agent")
    if not isinstance(agent, dict):
        issues.append("缺少 agent 对象")
    else:
        if not isinstance(agent.get("name"), str) or not agent.get("name"):
            issues.append("agent.name 缺失或不是字符串")
        if not isinstance(agent.get("version"), str) or not agent.get("version"):
            issues.append("agent.version 缺失或不是字符串")
    step_ids = [step.get("step_id") for step in steps if isinstance(step, dict)]
    if len(step_ids) != len(steps):
        issues.append("存在非对象步骤")
    if step_ids and all(isinstance(item, int) for item in step_ids):
        expected = list(range(1, len(step_ids) + 1))
        if step_ids != expected:
            issues.append("步骤编号不是从 1 开始的连续序列")
    elif steps:
        issues.append("存在缺少或非数字的步骤编号")
    from datetime import datetime
    tool_call_ids: set[str] = set()
    referenced_call_ids: set[str] = set()
    for index, step in enumerate(steps, 1):
        if not isinstance(step, dict):
            continue
        timestamp = step.get("timestamp")
        if timestamp:
            try:
                datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
            except ValueError:
                issues.append(f"第 {index} 步时间戳无效")
        source = step.get("source")
        if not source:
            issues.append(f"第 {index} 步缺少来源")
        elif source not in {"system", "user", "agent"}:
            issues.append(f"第 {index} 步来源无效：{source}")
        if "message" not in step:
            issues.append(f"第 {index} 步缺少 message")
        elif not isinstance(step.get("message"), (str, list)):
            issues.append(f"第 {index} 步 message 不是字符串或内容数组")
        tool_calls = step.get("tool_calls", [])
        if tool_calls is not None and not isinstance(tool_calls, list):
            issues.append(f"第 {index} 步 tool_calls 不是数组")
            tool_calls = []
        for call_index, call in enumerate(tool_calls or [], 1):
            if not isinstance(call, dict):
                issues.append(f"第 {index} 步第 {call_index} 个工具调用不是对象")
                continue
            call_id = call.get("tool_call_id")
            if not call_id:
                issues.append(f"第 {index} 步第 {call_index} 个工具调用缺少 tool_call_id")
            elif str(call_id) in tool_call_ids:
                issues.append(f"工具调用 ID 重复：{call_id}")
            else:
                tool_call_ids.add(str(call_id))
            if not call.get("function_name"):
                issues.append(f"第 {index} 步第 {call_index} 个工具调用缺少 function_name")
            if not isinstance(call.get("arguments"), dict):
                issues.append(f"第 {index} 步第 {call_index} 个工具调用 arguments 不是对象")
        observation = step.get("observation")
        if isinstance(observation, dict):
            results = observation.get("results")
            if not isinstance(results, list):
                issues.append(f"第 {index} 步 observation.results 不是数组")
            for result in results if isinstance(results, list) else []:
                if not isinstance(result, dict):
                    issues.append(f"第 {index} 步存在非对象工具结果")
                    continue
                source_call_id = result.get("source_call_id")
                if source_call_id:
                    referenced_call_ids.add(str(source_call_id))
        elif observation is not None:
            issues.append(f"第 {index} 步 observation 不是对象")
    for call_id in sorted(referenced_call_ids - tool_call_ids):
        issues.append(f"工具结果引用了不存在的调用：{call_id}")
    for call_id in sorted(tool_call_ids - referenced_call_ids):
        warnings.append(f"没有按 source_call_id 关联到工具结果：{call_id}")
    return {
        "valid": not issues,
        "issues": issues,
        "warnings": warnings,
        "schemaVersion": trajectory.get("schema_version", ""),
    }


def step_results(result: dict[str, Any], trial_dir: Path | None = None) -> list[dict[str, Any]]:
    raw = result.get("step_results", [])
    values = raw if isinstance(raw, list) else list(raw.values()) if isinstance(raw, dict) else []
    parsed: list[dict[str, Any]] = []
    for index, item in enumerate(values, 1):
        if not isinstance(item, dict):
            continue
        rewards = item.get("verifier_result", {}).get("rewards", {}) if isinstance(item.get("verifier_result"), dict) else {}
        name = item.get("name") or item.get("step_name") or f"步骤 {index}"
        step_artifacts_dir = trial_dir / "steps" / str(name) / "artifacts" if trial_dir is not None else None
        artifact_count = 0
        if step_artifacts_dir is not None and step_artifacts_dir.is_dir():
            artifact_count = sum(1 for path in step_artifacts_dir.rglob("*") if path.is_file() and path.name != "manifest.json")
        exception = item.get("exception_info")
        agent_result = item.get("agent_result") if isinstance(item.get("agent_result"), dict) else {}
        parsed.append({
            "index": index,
            "name": name,
            "reward": rewards.get("reward") if isinstance(rewards.get("reward"), (int, float)) else None,
            "rewards": rewards if isinstance(rewards, dict) else {},
            "exception": exception,
            "startedAt": get_nested(item, "agent_execution", "started_at") or item.get("started_at"),
            "finishedAt": get_nested(item, "verifier", "finished_at") or get_nested(item, "agent_execution", "finished_at") or item.get("finished_at"),
            "seconds": iso_duration_seconds(
                get_nested(item, "agent_execution", "started_at") or item.get("started_at"),
                get_nested(item, "verifier", "finished_at") or get_nested(item, "agent_execution", "finished_at") or item.get("finished_at"),
            ),
            "terminatedEarly": bool(exception),
            "artifactCount": artifact_count,
            "inputTokens": int(agent_result.get("n_input_tokens") or 0),
            "cachedTokens": int(agent_result.get("n_cache_tokens") or 0),
            "outputTokens": int(agent_result.get("n_output_tokens") or 0),
            "costUsd": float(agent_result["cost_usd"]) if isinstance(agent_result.get("cost_usd"), (int, float)) else None,
        })
    if parsed and trial_dir is not None:
        config = read_json(trial_dir / "config.json", {})
        task_path = get_nested(config if isinstance(config, dict) else {}, "task", "path")
        if task_path:
            try:
                task_config = tomllib.loads((Path(str(task_path)).expanduser() / "task.toml").read_text(encoding="utf-8"))
                configured_steps = task_config.get("steps")
                if isinstance(configured_steps, list) and len(parsed) < len(configured_steps):
                    parsed[-1]["terminatedEarly"] = True
            except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError):
                pass
    return parsed


def trajectory_counts(path: Path) -> tuple[int, int]:
    trajectory = read_json(path, {})
    steps = trajectory.get("steps", []) if isinstance(trajectory, dict) else []
    agent_steps = [step for step in steps if isinstance(step, dict) and step.get("source") == "agent"]
    tool_calls = sum(len(step.get("tool_calls") or []) for step in agent_steps)
    return len(agent_steps), tool_calls


def step_directories(trial_dir: Path) -> list[tuple[str, Path]]:
    steps_dir = trial_dir / "steps"
    if not steps_dir.is_dir():
        return []
    directories = {path.name: path for path in steps_dir.iterdir() if path.is_dir()}
    result = read_json(trial_dir / "result.json", {})
    raw_steps = result.get("step_results", []) if isinstance(result, dict) else []
    ordered_names: list[str] = []
    values = raw_steps if isinstance(raw_steps, list) else list(raw_steps.values()) if isinstance(raw_steps, dict) else []
    for item in values:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("step_name") or "")
        if name in directories and name not in ordered_names:
            ordered_names.append(name)
    ordered_names.extend(sorted(name for name in directories if name not in ordered_names))
    return [(name, directories[name]) for name in ordered_names]


def trajectory_documents(trial_dir: Path) -> list[tuple[str, Path]]:
    documents: list[tuple[str, Path]] = []
    root_path = trial_dir / "agent" / "trajectory.json"
    if root_path.is_file():
        documents.append(("", root_path))
    for step_name, step_dir in step_directories(trial_dir):
        path = step_dir / "agent" / "trajectory.json"
        if path.is_file():
            documents.append((step_name, path))
    return documents


def combined_trajectory(trial_dir: Path) -> dict[str, Any]:
    documents = trajectory_documents(trial_dir)
    if not documents:
        return {}
    loaded = [(step_name, read_json(path, {})) for step_name, path in documents]
    loaded = [(step_name, value) for step_name, value in loaded if isinstance(value, dict)]
    if not loaded:
        return {}
    if len(loaded) == 1 and not loaded[0][0]:
        return loaded[0][1]
    steps: list[dict[str, Any]] = []
    next_step_id = 1
    for step_name, trajectory in loaded:
        for raw_step in trajectory.get("steps", []) if isinstance(trajectory.get("steps"), list) else []:
            if not isinstance(raw_step, dict):
                continue
            step = dict(raw_step)
            step["original_step_id"] = step.get("step_id")
            step["step_id"] = next_step_id
            step["portal_step_name"] = step_name
            steps.append(step)
            next_step_id += 1
    first = loaded[0][1]
    return {
        "schema_version": first.get("schema_version", ""),
        "session_id": first.get("session_id"),
        "agent": first.get("agent", {}),
        "steps": steps,
        "portal_step_documents": [step_name for step_name, _ in loaded],
    }


def combined_trajectory_validation(trial_dir: Path) -> dict[str, Any]:
    documents = trajectory_documents(trial_dir)
    if not documents:
        return {"valid": False, "issues": ["未找到轨迹文件"], "warnings": []}
    issues: list[str] = []
    warnings: list[str] = []
    schemas: set[str] = set()
    for step_name, path in documents:
        result = trajectory_validation(path)
        label = f"步骤 {step_name}" if step_name else "Trial"
        issues.extend(f"{label}：{issue}" for issue in result.get("issues", []))
        warnings.extend(f"{label}：{warning}" for warning in result.get("warnings", []))
        if result.get("schemaVersion"):
            schemas.add(str(result["schemaVersion"]))
    return {
        "valid": not issues,
        "issues": issues,
        "warnings": warnings,
        "schemaVersion": next(iter(schemas)) if len(schemas) == 1 else " / ".join(sorted(schemas)),
    }


def agent_totals(result: dict[str, Any]) -> tuple[int, int, int, float | None]:
    contexts: list[dict[str, Any]] = []
    if isinstance(result.get("agent_result"), dict):
        contexts = [result["agent_result"]]
    elif isinstance(result.get("step_results"), list):
        contexts = [item["agent_result"] for item in result["step_results"] if isinstance(item, dict) and isinstance(item.get("agent_result"), dict)]
    return (
        sum(int(item.get("n_input_tokens") or 0) for item in contexts),
        sum(int(item.get("n_cache_tokens") or 0) for item in contexts),
        sum(int(item.get("n_output_tokens") or 0) for item in contexts),
        sum(float(item.get("cost_usd") or 0) for item in contexts) if any(isinstance(item.get("cost_usd"), (int, float)) for item in contexts) else None,
    )


def artifact_manifest(trial_dir: Path) -> list[dict[str, Any]]:
    manifests: list[dict[str, Any]] = []
    locations = [("", trial_dir / "artifacts"), *[(name, path / "artifacts") for name, path in step_directories(trial_dir)]]
    for step_name, artifact_dir in locations:
        manifest = read_json(artifact_dir / "manifest.json", [])
        if not isinstance(manifest, list):
            continue
        for raw_entry in manifest:
            if isinstance(raw_entry, dict):
                entry = dict(raw_entry)
                if step_name:
                    entry["stepName"] = step_name
                manifests.append(entry)
    return manifests


def artifact_entries(trial_dir: Path) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    locations = [("", trial_dir / "artifacts"), *[(name, path / "artifacts") for name, path in step_directories(trial_dir)]]
    for step_name, artifact_dir in locations:
        if not artifact_dir.is_dir():
            continue
        for path in sorted(artifact_dir.rglob("*")):
            if path.name == "manifest.json" or not path.is_file():
                continue
            relative = path.relative_to(artifact_dir).as_posix()
            storage = path.relative_to(trial_dir).as_posix()
            entries.append({
                "name": path.name,
                "relativePath": f"{step_name}/{relative}" if step_name else relative,
                "storagePath": storage,
                "stepName": step_name or None,
                "size": path.stat().st_size,
            })
    return entries


def artifact_target(state: "PortalState", job_key: str, trial_name: str, relative_path: str) -> Path:
    trial = state.resolve_trial(job_key, trial_name)
    normalized = Path(relative_path)
    requested = (trial / normalized).resolve() if normalized.parts and normalized.parts[0] in {"artifacts", "steps"} else (trial / "artifacts" / normalized).resolve()
    allowed_roots = [(trial / "artifacts").resolve(), *[(path / "artifacts").resolve() for _, path in step_directories(trial)]]
    if not any(_is_relative_to(requested, root) for root in allowed_roots):
        raise ValueError("Artifact 路径越界")
    if not requested.is_file():
        raise ValueError("Artifact 不存在")
    return requested


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def decode_text(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def trim_preview_text(text: str) -> tuple[str, bool]:
    normalized = text.replace("\x00", "").strip()
    return normalized[:MAX_PREVIEW_TEXT_CHARS], len(normalized) > MAX_PREVIEW_TEXT_CHARS


def spreadsheet_sheet(name: str, rows: list[list[str]], total_rows: int | None = None, total_columns: int | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "rows": rows[:MAX_PREVIEW_ROWS],
        "totalRows": total_rows if total_rows is not None else len(rows),
        "totalColumns": total_columns if total_columns is not None else max((len(row) for row in rows), default=0),
    }


def preview_delimited(path: Path, delimiter: str) -> dict[str, Any]:
    text = decode_text(path.read_bytes())
    all_rows = [[str(value) for value in row] for row in csv.reader(io.StringIO(text), delimiter=delimiter)]
    total_columns = max((len(row) for row in all_rows), default=0)
    rows = [row[:MAX_PREVIEW_COLUMNS] for row in all_rows[:MAX_PREVIEW_ROWS]]
    return {
        "kind": "spreadsheet",
        "name": path.name,
        "sheets": [spreadsheet_sheet(path.stem, rows, len(all_rows), total_columns)],
        "truncated": len(all_rows) > MAX_PREVIEW_ROWS or total_columns > MAX_PREVIEW_COLUMNS,
    }


def excel_column_index(reference: str) -> int:
    letters = "".join(character for character in reference if character.isalpha()).upper()
    index = 0
    for character in letters:
        index = index * 26 + ord(character) - ord("A") + 1
    return max(0, index - 1)


def preview_xlsx(path: Path) -> dict[str, Any]:
    main_ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel_ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    package_rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall(f"{{{main_ns}}}si"):
                shared.append("".join(node.text or "" for node in item.iter(f"{{{main_ns}}}t")))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {
            relationship.attrib.get("Id", ""): relationship.attrib.get("Target", "")
            for relationship in relationships.findall(f"{{{package_rel_ns}}}Relationship")
        }
        sheets: list[dict[str, Any]] = []
        was_truncated = False
        for sheet in workbook.findall(f".//{{{main_ns}}}sheet"):
            sheet_name = sheet.attrib.get("name", "工作表")
            relation_id = sheet.attrib.get(f"{{{rel_ns}}}id", "")
            target = targets.get(relation_id, "")
            archive_name = target.lstrip("/") if target.startswith("/") else f"xl/{target.lstrip('./')}"
            archive_name = archive_name.replace("xl/xl/", "xl/")
            if archive_name not in archive.namelist():
                continue
            sheet_root = ET.fromstring(archive.read(archive_name))
            dimension = sheet_root.find(f"{{{main_ns}}}dimension")
            dimension_ref = dimension.attrib.get("ref", "") if dimension is not None else ""
            last_cell = dimension_ref.split(":")[-1] if dimension_ref else ""
            total_columns = excel_column_index(last_cell) + 1 if last_cell else 0
            digits = "".join(character for character in last_cell if character.isdigit())
            total_rows = int(digits) if digits else 0
            row_values: dict[int, list[str]] = {}
            for row in sheet_root.findall(f".//{{{main_ns}}}sheetData/{{{main_ns}}}row"):
                row_number = int(row.attrib.get("r", "0") or 0)
                if row_number < 1 or row_number > MAX_PREVIEW_ROWS:
                    continue
                values: list[str] = []
                for cell in row.findall(f"{{{main_ns}}}c"):
                    column_index = excel_column_index(cell.attrib.get("r", "A1"))
                    if column_index >= MAX_PREVIEW_COLUMNS:
                        continue
                    while len(values) <= column_index:
                        values.append("")
                    cell_type = cell.attrib.get("t")
                    value_node = cell.find(f"{{{main_ns}}}v")
                    formula_node = cell.find(f"{{{main_ns}}}f")
                    if cell_type == "inlineStr":
                        inline = cell.find(f"{{{main_ns}}}is")
                        value = "".join(node.text or "" for node in inline.iter(f"{{{main_ns}}}t")) if inline is not None else ""
                    else:
                        value = value_node.text if value_node is not None and value_node.text is not None else ""
                        if cell_type == "s" and value.isdigit() and int(value) < len(shared):
                            value = shared[int(value)]
                        elif cell_type == "b":
                            value = "TRUE" if value == "1" else "FALSE"
                    formula = formula_node.text if formula_node is not None and formula_node.text is not None else ""
                    if formula:
                        value = f"{value} [={formula}]" if value else f"={formula}"
                    values[column_index] = value
                row_values[row_number] = values
            preview_row_count = min(max(total_rows, max(row_values, default=0)), MAX_PREVIEW_ROWS)
            rows = [row_values.get(row_number, []) for row_number in range(1, preview_row_count + 1)]
            actual_rows = max(total_rows, len(rows))
            actual_columns = max(total_columns, max((len(row) for row in rows), default=0))
            was_truncated = was_truncated or actual_rows > MAX_PREVIEW_ROWS or actual_columns > MAX_PREVIEW_COLUMNS
            sheets.append(spreadsheet_sheet(sheet_name, rows, actual_rows, actual_columns))
        return {"kind": "spreadsheet", "name": path.name, "sheets": sheets, "truncated": was_truncated}


def xml_text(archive: zipfile.ZipFile, member: str, paragraph_tag: str, text_tag: str) -> list[str]:
    root = ET.fromstring(archive.read(member))
    paragraphs: list[str] = []
    for paragraph in root.iter(paragraph_tag):
        text = "".join(node.text or "" for node in paragraph.iter(text_tag)).strip()
        if text:
            paragraphs.append(text)
    return paragraphs


class PreviewHtmlParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.ignored_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style"}:
            self.ignored_depth += 1
        elif tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style"} and self.ignored_depth:
            self.ignored_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.ignored_depth:
            self.parts.append(data)


def artifact_preview(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    try:
        if suffix == ".xlsx":
            return preview_xlsx(path)
        if suffix in {".csv", ".tsv"}:
            return preview_delimited(path, "\t" if suffix == ".tsv" else ",")
        if suffix == ".docx":
            ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            with zipfile.ZipFile(path) as archive:
                paragraphs = xml_text(archive, "word/document.xml", f"{ns}p", f"{ns}t")
            text, truncated = trim_preview_text("\n\n".join(paragraphs))
            return {"kind": "document", "name": path.name, "text": text, "truncated": truncated}
        if suffix == ".pptx":
            ns = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
            with zipfile.ZipFile(path) as archive:
                members = sorted(
                    (name for name in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", name)),
                    key=lambda name: int(re.search(r"(\d+)", Path(name).stem).group(1)),
                )
                slides = []
                for index, member in enumerate(members, 1):
                    root = ET.fromstring(archive.read(member))
                    slide_text = "\n".join(node.text or "" for node in root.iter(f"{ns}t") if (node.text or "").strip())
                    slides.append(f"第 {index} 页\n{slide_text}")
            text, truncated = trim_preview_text("\n\n".join(slides))
            return {"kind": "presentation", "name": path.name, "text": text, "truncated": truncated}
        if suffix in {".html", ".htm"}:
            parser = PreviewHtmlParser()
            parser.feed(decode_text(path.read_bytes()))
            text, truncated = trim_preview_text("".join(parser.parts))
            return {"kind": "html", "name": path.name, "text": text, "truncated": truncated}
        if suffix in {".txt", ".md", ".json", ".log", ".yaml", ".yml", ".xml"}:
            text, truncated = trim_preview_text(decode_text(path.read_bytes()))
            return {"kind": "text", "name": path.name, "text": text, "truncated": truncated}
    except (OSError, KeyError, ValueError, zipfile.BadZipFile, ET.ParseError, csv.Error) as exc:
        return {"kind": "unsupported", "name": path.name, "message": f"无法生成预览：{exc}"}
    return {"kind": "unsupported", "name": path.name, "message": "该文件类型暂不支持在线预览，请下载后打开。"}


def failed_score_checks(trials: list[dict[str, Any]]) -> int | None:
    failed = 0
    has_score = False
    for trial in trials:
        passed = trial.get("passed")
        total = trial.get("total")
        if not isinstance(passed, (int, float)) or not isinstance(total, (int, float)):
            continue
        has_score = True
        failed += max(0, int(total - passed))
    return failed if has_score else None


def score_documents(trial_dir: Path) -> list[tuple[str, Path]]:
    documents: list[tuple[str, Path]] = []
    root = trial_dir / "verifier" / "score.json"
    if root.is_file():
        documents.append(("", root))
    for step_name, step_dir in step_directories(trial_dir):
        path = step_dir / "verifier" / "score.json"
        if path.is_file():
            documents.append((step_name, path))
    return documents


def primary_score(trial_dir: Path) -> dict[str, Any]:
    root = trial_dir / "verifier" / "score.json"
    documents = score_documents(trial_dir)
    selected = root if root.is_file() else documents[-1][1] if documents else None
    if selected is None:
        return {}
    score = read_json(selected, {})
    return score if isinstance(score, dict) else {}


def primary_verifier_dir(trial_dir: Path) -> Path:
    root = trial_dir / "verifier"
    if any((root / name).is_file() for name in ("score.json", "reward-details.json", "ctrf.json")):
        return root
    steps = step_directories(trial_dir)
    return steps[-1][1] / "verifier" if steps else root


def step_score_bundles(trial_dir: Path) -> list[dict[str, Any]]:
    bundles: list[dict[str, Any]] = []
    for step_name, step_dir in step_directories(trial_dir):
        score = read_json(step_dir / "verifier" / "score.json", {})
        reward_details = read_json(step_dir / "verifier" / "reward-details.json", {})
        ctrf = read_json(step_dir / "verifier" / "ctrf.json", {})
        if any(bool(value) for value in (score, reward_details, ctrf)):
            bundles.append({
                "stepName": step_name,
                "score": score if isinstance(score, dict) else {},
                "rewardDetails": reward_details,
                "ctrf": ctrf,
            })
    return bundles


def agent_log_entries(trial_dir: Path) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    locations = [("Trial", trial_dir / "agent"), *[(f"步骤 {name}", path / "agent") for name, path in step_directories(trial_dir)]]
    for label, agent_dir in locations:
        if not agent_dir.is_dir():
            continue
        for path in sorted(agent_dir.rglob("*")):
            if not path.is_file() or path.name == "trajectory.json" or path.suffix.lower() not in {".txt", ".log", ".jsonl"}:
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")[-MAX_LOG_CHARS:]
            except OSError:
                continue
            entries.append({"label": f"{label} · {path.name}", "path": path.relative_to(trial_dir).as_posix(), "content": content})
    for path in sorted(trial_dir.iterdir()):
        if not path.is_file() or not path.name.lower().startswith("agent.") or path.suffix.lower() not in {".txt", ".log", ".jsonl"}:
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")[-MAX_LOG_CHARS:]
        except OSError:
            continue
        entries.append({"label": path.name, "path": path.name, "content": content})
    return entries


def partial_trial_summary(trial_dir: Path, config: dict[str, Any]) -> dict[str, Any] | None:
    if not config:
        return None
    task = config.get("task") if isinstance(config.get("task"), dict) else {}
    agent = config.get("agent") if isinstance(config.get("agent"), dict) else {}
    kwargs = agent.get("kwargs") if isinstance(agent.get("kwargs"), dict) else {}
    task_source = task.get("source") or task.get("path") or ""
    task_name = task.get("name") or (Path(str(task.get("path"))).name if task.get("path") else "")
    if not task_name:
        return None
    has_activity = (trial_dir / "lock.json").is_file() or any(
        path.is_file() for dirname in ("agent", "verifier", "artifacts", "steps") for path in (trial_dir / dirname).rglob("*")
    )
    trajectory_paths = trajectory_documents(trial_dir)
    counts = [trajectory_counts(path) for _, path in trajectory_paths]
    started = None
    try:
        from datetime import datetime, timezone
        started = datetime.fromtimestamp((trial_dir / "config.json").stat().st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    except OSError:
        pass
    return {
        "name": trial_dir.name,
        "taskName": str(task_name),
        "taskLabel": str(task_name).split("/")[-1],
        "taskChecksum": "",
        "model": agent.get("model_name", ""),
        "agent": agent.get("name") or agent.get("import_path") or "",
        "agentVersion": agent.get("version") or kwargs.get("version") or "",
        "reasoningEffort": kwargs.get("reasoning_effort", ""),
        "reward": None, "rewards": {}, "rewardSources": [], "rewardConflicts": [],
        "passed": None, "total": None, "gateFailed": False,
        "exception": None, "exceptionCategory": "",
        "status": "running" if has_activity else "pending",
        "statusLabel": "运行中" if has_activity else "等待运行",
        "startedAt": started, "finishedAt": None, "phases": [], "agentSeconds": None,
        "inputTokens": 0, "cachedTokens": 0, "outputTokens": 0, "costUsd": None,
        "agentSteps": sum(item[0] for item in counts), "toolCalls": sum(item[1] for item in counts), "hasTrajectory": bool(trajectory_paths),
        "trajectoryValidation": combined_trajectory_validation(trial_dir),
        "artifacts": artifact_entries(trial_dir), "artifactManifest": artifact_manifest(trial_dir), "stepResults": [],
        "isRegrade": False, "sourceTrial": {}, "sourceReward": None, "regradeDelta": None,
        "taskVersion": task.get("version") or task.get("ref") or "", "taskSource": task_source,
        "verifierMode": "", "taskConfig": task, "agentConfig": agent,
        "environmentConfig": config.get("environment") if isinstance(config.get("environment"), dict) else {},
        "verifierConfig": config.get("verifier") if isinstance(config.get("verifier"), dict) else {},
    }


def source_trial_reward(trial_dir: Path, source_trial: Any) -> float | None:
    if not isinstance(source_trial, dict):
        return None
    candidates: list[Path] = []
    source_path = source_trial.get("path")
    if source_path:
        candidates.append(Path(str(source_path)).expanduser())
    source_id = source_trial.get("trial_id")
    if source_id:
        cache_dir = trial_dir.parent / ".sources" / str(source_id)
        candidates.append(cache_dir)
        if cache_dir.is_dir():
            # Harbor downloads Hub-backed sources under
            # .sources/<trial_id>/<original_trial_name>.
            candidates.extend(path for path in cache_dir.iterdir() if path.is_dir())
    for candidate in candidates:
        if not candidate.is_absolute():
            candidate = (trial_dir.parent / candidate).resolve()
        result = read_json(candidate / "result.json", {})
        score = read_json(candidate / "verifier" / "score.json", {})
        if not isinstance(result, dict):
            result = {}
        if not isinstance(score, dict):
            score = {}
        rewards, _, _ = numeric_rewards(candidate, score, result)
        reward = rewards.get("reward")
        if isinstance(reward, (int, float)):
            return float(reward)
    return None


def trial_summary(trial_dir: Path) -> dict[str, Any] | None:
    result = read_json(trial_dir / "result.json")
    trial_config = read_json(trial_dir / "config.json", {})
    if not isinstance(trial_config, dict):
        trial_config = {}
    if not isinstance(result, dict) or not result.get("task_name"):
        return partial_trial_summary(trial_dir, trial_config)
    score = primary_score(trial_dir)
    rewards, reward_sources, reward_conflicts = numeric_rewards(trial_dir, score, result)
    status, status_label = trial_status(result, rewards)
    result_config = result.get("config") if isinstance(result.get("config"), dict) else {}
    effective_config = result_config or trial_config
    source_trial = effective_config.get("source_trial") or get_nested(trial_config, "provenance", "source_trial")
    task_config = effective_config.get("task") if isinstance(effective_config.get("task"), dict) else {}
    trajectory_paths = trajectory_documents(trial_dir)
    counts = [trajectory_counts(path) for _, path in trajectory_paths]
    agent_steps, tool_calls = sum(item[0] for item in counts), sum(item[1] for item in counts)
    agent = get_nested(result, "config", "agent", default={})
    agent = agent if isinstance(agent, dict) else {}
    kwargs = agent.get("kwargs") if isinstance(agent.get("kwargs"), dict) else {}
    reward = rewards.get("reward")
    original_reward = source_trial_reward(trial_dir, source_trial)
    input_tokens, cached_tokens, output_tokens, cost_usd = agent_totals(result)
    agent_seconds = iso_duration_seconds(get_nested(result, "agent_execution", "started_at"), get_nested(result, "agent_execution", "finished_at"))
    if agent_seconds is None and isinstance(result.get("step_results"), list):
        durations = [iso_duration_seconds(get_nested(item, "agent_execution", "started_at"), get_nested(item, "agent_execution", "finished_at")) for item in result["step_results"] if isinstance(item, dict)]
        known_durations = [value for value in durations if isinstance(value, (int, float))]
        agent_seconds = sum(known_durations) if known_durations else None
    return {
        "name": trial_dir.name,
        "taskName": result.get("task_name", ""),
        "taskLabel": str(result.get("task_name", "")).split("/")[-1],
        "taskChecksum": result.get("task_checksum", ""),
        "model": agent.get("model_name") or get_nested(result, "agent_info", "model_info", "name", default=""),
        "agent": agent.get("name") or get_nested(result, "agent_info", "name", default=""),
        "agentVersion": agent.get("version") or get_nested(result, "agent_info", "version", default=""),
        "reasoningEffort": kwargs.get("reasoning_effort", ""),
        "reward": reward,
        "rewards": rewards,
        "rewardSources": reward_sources,
        "rewardConflicts": reward_conflicts,
        "passed": score.get("passed"),
        "total": score.get("total"),
        "gateFailed": bool(score.get("gate_failed", False)),
        "exception": result.get("exception_info"),
        "exceptionCategory": exception_category(result.get("exception_info")),
        "status": status,
        "statusLabel": status_label,
        "startedAt": result.get("started_at"),
        "finishedAt": result.get("finished_at"),
        "phases": phase_durations(result, trial_dir),
        "agentSeconds": agent_seconds,
        "inputTokens": input_tokens,
        "cachedTokens": cached_tokens,
        "outputTokens": output_tokens,
        "costUsd": cost_usd,
        "agentSteps": agent_steps,
        "toolCalls": tool_calls,
        "hasTrajectory": bool(trajectory_paths),
        "trajectoryValidation": combined_trajectory_validation(trial_dir),
        "artifacts": artifact_entries(trial_dir),
        "artifactManifest": artifact_manifest(trial_dir),
        "stepResults": step_results(result, trial_dir),
        "isRegrade": bool(source_trial),
        "sourceTrial": source_trial if isinstance(source_trial, dict) else {},
        "sourceReward": original_reward,
        "regradeDelta": reward - original_reward if isinstance(reward, (int, float)) and isinstance(original_reward, (int, float)) else None,
        "taskVersion": task_config.get("version") or task_config.get("ref") or "",
        "taskSource": task_config.get("source") or task_config.get("path") or "",
        "verifierMode": result.get("verifier_environment_mode") or get_nested(effective_config, "verifier", "environment_mode", default=""),
        "taskConfig": task_config,
        "agentConfig": effective_config.get("agent") if isinstance(effective_config.get("agent"), dict) else {},
        "environmentConfig": effective_config.get("environment") if isinstance(effective_config.get("environment"), dict) else {},
        "verifierConfig": effective_config.get("verifier") if isinstance(effective_config.get("verifier"), dict) else {},
    }


def job_candidates(root: Path) -> list[tuple[str, Path]]:
    if (root / "result.json").is_file() or ((root / "config.json").is_file() and any(path.is_dir() and not path.name.startswith(".") for path in root.iterdir())):
        return [(root.name, root)]
    candidates = []
    for path in root.iterdir():
        if not path.is_dir() or path.name.startswith("."):
            continue
        if (path / "result.json").is_file() or (path / "config.json").is_file():
            candidates.append((path.name, path))
    return candidates


def is_trial_candidate(path: Path) -> bool:
    if not path.is_dir() or path.name.startswith("."):
        return False
    markers = ("result.json", "config.json", "lock.json", "agent", "verifier", "artifacts", "steps")
    return any((path / marker).exists() for marker in markers)


def mark_attempts(trials: list[dict[str, Any]]) -> None:
    groups: dict[str, list[dict[str, Any]]] = {}
    for trial in trials:
        groups.setdefault(str(trial.get("taskName", "")), []).append(trial)
    for group in groups.values():
        group.sort(key=lambda item: (str(item.get("startedAt") or ""), str(item.get("name") or "")))
        for index, trial in enumerate(group, 1):
            trial["attempt"] = index
            trial["attemptCount"] = len(group)


def scan_jobs(root: Path, diagnostics: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    candidates = job_candidates(root)
    if diagnostics is not None:
        diagnostics["jobsDiscovered"] = len(candidates)
        diagnostics.setdefault("jobsSkipped", 0)
        diagnostics.setdefault("trialsDiscovered", 0)
        diagnostics.setdefault("trialsSkipped", 0)
        diagnostics.setdefault("issues", [])

    def add_issue(kind: str, path: Path, message: str) -> None:
        if diagnostics is None or len(diagnostics["issues"]) >= 30:
            return
        diagnostics["issues"].append({"kind": kind, "path": str(path), "message": message})

    for key, job_dir in candidates:
        job_result = read_json(job_dir / "result.json", {})
        if not isinstance(job_result, dict) or not job_result:
            if diagnostics is not None:
                diagnostics["jobsSkipped"] += 1
            add_issue("job_result", job_dir / "result.json", "Job result.json 无法解析或为空")
            continue
        trials: list[dict[str, Any]] = []
        for child in sorted(path for path in job_dir.iterdir() if is_trial_candidate(path)):
            if diagnostics is not None:
                diagnostics["trialsDiscovered"] += 1
            summary = trial_summary(child)
            if summary is None:
                if diagnostics is not None:
                    diagnostics["trialsSkipped"] += 1
                add_issue("trial_result", child, "Trial 的 result.json/config.json 无法解析或缺少任务信息")
                continue
            trials.append(summary)
        mark_attempts(trials)
        evals = all_evals(job_result)
        eval_names = [name for name, _ in evals]
        dataset_names = sorted({name.split("__")[-1] for name in eval_names if name})
        metric_values = [dict(metric, evalName=name) for name, data in evals for metric in data.get("metrics", []) if isinstance(metric, dict)]
        primary_metric = next((metric for metric in metric_values if metric.get("name") in {"reward", "mean"}), metric_values[0] if metric_values else {})
        mean = primary_metric.get("mean") if len(evals) == 1 and isinstance(primary_metric, dict) else None
        models = sorted({str(trial["model"]) for trial in trials if trial.get("model")})
        efforts = sorted({str(trial["reasoningEffort"]) for trial in trials if trial.get("reasoningEffort")})
        model = models[0] if len(models) == 1 else f"多个模型（{len(models)}）" if models else ""
        effort = efforts[0] if len(efforts) == 1 else f"多个配置（{len(efforts)}）" if efforts else ""
        stats = job_result.get("stats") if isinstance(job_result.get("stats"), dict) else {}
        trial_costs = [trial.get("costUsd") for trial in trials if not trial.get("isRegrade") and isinstance(trial.get("costUsd"), (int, float))]
        has_regrades = any(trial.get("isRegrade") for trial in trials)
        if trial_costs:
            job_cost = sum(trial_costs)
        elif has_regrades:
            # Job-level Harbor stats can include the source Agent cost again for a
            # regrade. Without primary Trial cost records, the non-duplicated total
            # cannot be reconstructed reliably.
            job_cost = None
        else:
            job_cost = stats.get("cost_usd")
        jobs.append(
            {
                "key": key,
                "name": job_dir.name,
                "path": str(job_dir),
                "id": job_result.get("id"),
                "evalName": eval_names[0] if len(eval_names) == 1 else f"多个评测分组（{len(eval_names)}）" if eval_names else "",
                "evalNames": eval_names,
                "datasetNames": dataset_names,
                "model": model,
                "models": models,
                "reasoningEffort": effort,
                "reasoningEfforts": efforts,
                "mean": mean,
                "metrics": metric_values,
                "failedChecks": failed_score_checks(trials),
                "startedAt": job_result.get("started_at"),
                "finishedAt": job_result.get("finished_at"),
                "jobSeconds": iso_duration_seconds(job_result.get("started_at"), job_result.get("finished_at")),
                "totalTrials": job_result.get("n_total_trials", len(trials)),
                "completedTrials": stats.get("n_completed_trials", 0),
                "erroredTrials": stats.get("n_errored_trials", 0),
                "cancelledTrials": stats.get("n_cancelled_trials", 0),
                "retries": stats.get("n_retries", 0),
                "inputTokens": stats.get("n_input_tokens", 0),
                "cachedTokens": stats.get("n_cache_tokens", 0),
                "outputTokens": stats.get("n_output_tokens", 0),
                "costUsd": job_cost,
                "trials": trials,
            }
        )
    jobs.sort(key=lambda item: item.get("finishedAt") or item.get("startedAt") or "", reverse=True)
    return jobs


def workspace_payload(root: Path) -> dict[str, Any]:
    from datetime import datetime, timezone

    diagnostics: dict[str, Any] = {
        "jobsDiscovered": 0,
        "jobsSkipped": 0,
        "trialsDiscovered": 0,
        "trialsSkipped": 0,
        "issues": [],
        "refreshedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    return {"root": str(root), "jobs": scan_jobs(root, diagnostics), "diagnostics": diagnostics}


@dataclass
class PortalState:
    root: Path
    children: dict[str, subprocess.Popen[Any]] = field(default_factory=dict)
    lock: threading.RLock = field(default_factory=threading.RLock)

    def set_root(self, requested: str) -> Path:
        path = Path(requested).expanduser().resolve()
        if not path.is_dir():
            raise ValueError("所选路径不是有效文件夹")
        with self.lock:
            self.root = path
        return path

    def resolve_job(self, key: str) -> Path:
        with self.lock:
            root = self.root.resolve()
        if (root / "result.json").is_file() and key == root.name:
            return root
        candidate = (root / key).resolve()
        if candidate.parent != root or not candidate.is_dir() or not (candidate / "result.json").is_file():
            raise ValueError("Job 不存在或不在当前根目录中")
        return candidate

    def resolve_trial(self, job_key: str, trial_name: str) -> Path:
        job = self.resolve_job(job_key)
        trial = (job / trial_name).resolve()
        if trial.parent != job or not trial.is_dir() or not any((trial / name).is_file() for name in ("result.json", "config.json")):
            raise ValueError("Trial 不存在或不属于所选 Job")
        return trial

    def stop_children(self) -> None:
        with self.lock:
            for process in self.children.values():
                if process.poll() is None:
                    process.terminate()


def trial_detail(state: PortalState, job_key: str, trial_name: str, includes: set[str] | None = None) -> dict[str, Any]:
    trial = state.resolve_trial(job_key, trial_name)
    summary = trial_summary(trial)
    if summary is None:
        raise ValueError("Trial 结果无法解析")
    requested_sections = (includes or set()) & {"trajectory", "log"}
    logs = agent_log_entries(trial) if "log" in requested_sections else []
    agent_log = "\n\n".join(f"===== {entry['label']} =====\n{entry['content']}" for entry in logs)
    score = primary_score(trial)
    verifier_dir = primary_verifier_dir(trial)
    return {
        "summary": summary,
        "result": read_json(trial / "result.json", {}),
        "score": score,
        "rewardDetails": read_json(verifier_dir / "reward-details.json", {}),
        "ctrf": read_json(verifier_dir / "ctrf.json", {}),
        "stepScores": step_score_bundles(trial),
        "trialConfig": read_json(trial / "config.json", {}),
        "trajectory": combined_trajectory(trial) if "trajectory" in requested_sections else {},
        "trajectoryFiles": [
            {
                "stepName": step_name or None,
                "label": f"步骤 {step_name}" if step_name else "Trial",
                "path": path.relative_to(trial).as_posix(),
            }
            for step_name, path in trajectory_documents(trial)
        ],
        "agentLog": agent_log,
        "agentLogs": logs,
        "loadedSections": sorted(requested_sections),
    }


def free_port(start: int = 18100, end: int = 18199) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("没有可用的本地 Viewer 端口")


def wait_for_port(port: int, process: subprocess.Popen[Any], timeout: float = 8.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Harbor Viewer 启动失败")
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.settimeout(0.15)
            if probe.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.1)
    raise RuntimeError("Harbor Viewer 启动超时")


def creation_flags() -> int:
    return subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0


def node_environment_status() -> dict[str, bool]:
    return {
        "node": shutil.which("node") is not None,
        "npm": shutil.which("npm") is not None,
        "npx": shutil.which("npx") is not None,
    }


def install_tool(tool: str) -> dict[str, Any]:
    if tool != "rlviz":
        raise ValueError("不支持安装该工具")
    environment = node_environment_status()
    if not all(environment.values()):
        missing = "、".join(name for name, present in environment.items() if not present)
        raise RuntimeError(f"未检测到 {missing}；请先安装 Node.js LTS 基础环境")

    npm = shutil.which("npm")
    if not npm:  # Defensive guard for type narrowing and future edits.
        raise RuntimeError("未找到 npm；请先安装 Node.js LTS 基础环境")
    try:
        completed = subprocess.run(
            [npm, "install", "--global", "rlviz", "--no-audit", "--no-fund"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
            creationflags=creation_flags(),
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("RLViz 安装超时，请检查网络后重试") from exc
    if completed.returncode != 0:
        detail = (completed.stdout or "").strip()[-1200:]
        raise RuntimeError(f"RLViz 安装失败（npm exit {completed.returncode}）{': ' + detail if detail else ''}")
    return {"ok": True, "message": "RLViz 已安装，正在启动"}


def launch_tool(state: PortalState, tool: str, job_key: str, trial_name: str | None, trajectory_path: str | None = None) -> dict[str, Any]:
    job = state.resolve_job(job_key)
    if tool == "harbor":
        executable = shutil.which("harbor")
        if not executable:
            raise RuntimeError("未找到 harbor 命令")
        process_key = f"harbor:{job}"
        with state.lock:
            previous = state.children.get(process_key)
            if previous and previous.poll() is None:
                port = getattr(previous, "portal_port", None)
                return {"ok": True, "url": f"http://127.0.0.1:{port}", "message": "Harbor Viewer 已在运行"}
            port = free_port()
            process = subprocess.Popen(
                [executable, "view", str(job), "--jobs", "--host", "127.0.0.1", "--port", str(port)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=creation_flags(),
            )
            setattr(process, "portal_port", port)
            state.children[process_key] = process
        wait_for_port(port, process)
        return {"ok": True, "url": f"http://127.0.0.1:{port}", "message": "Harbor Viewer 已启动"}

    if tool == "rlviz":
        executable = shutil.which("rlviz")
        if not executable:
            raise RuntimeError("未找到 rlviz；请先安装 RLViz")
        command = [executable, "open", str(job)]
        target_label = job.name
    elif tool == "agentviz":
        executable = shutil.which("npx")
        if not executable:
            raise RuntimeError("未找到 npx；请先安装 Node.js")
        if not trial_name:
            raise ValueError("AgentViz 需要先选择一个 Trial")
        trial = state.resolve_trial(job_key, trial_name)
        documents = trajectory_documents(trial)
        if not documents:
            raise ValueError("所选 Trial 没有 trajectory.json")
        if trajectory_path:
            selected = next((path for _, path in documents if path.relative_to(trial).as_posix() == trajectory_path), None)
            if selected is None:
                raise ValueError("所选轨迹文件不存在")
            trajectory = selected
        elif len(documents) == 1:
            trajectory = documents[0][1]
        else:
            raise ValueError("多步 Trial 需要先选择要在 AgentViz 中打开的步骤")
        command = [executable, "--yes", "agentviz", str(trajectory)]
        target_label = trial.name
    else:
        raise ValueError("不支持的工具")

    process = subprocess.Popen(command, creationflags=creation_flags())
    with state.lock:
        state.children[f"{tool}:{target_label}:{process.pid}"] = process
    return {"ok": True, "message": f"{tool} 已启动"}


def tool_status() -> dict[str, bool]:
    environment = node_environment_status()
    return {
        "harbor": shutil.which("harbor") is not None,
        "rlviz": shutil.which("rlviz") is not None,
        "agentviz": environment["npx"],
        **environment,
    }


def choose_directory(initial: Path) -> str | None:
    picker = (
        "import sys, tkinter as tk; from tkinter import filedialog; "
        "root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); "
        "path=filedialog.askdirectory(initialdir=sys.argv[1]); print(path); root.destroy()"
    )
    try:
        completed = subprocess.run(
            [sys.executable, "-c", picker, str(initial)],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=300,
            creationflags=creation_flags(),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    selected = completed.stdout.strip()
    return selected or None


class PortalHandler(SimpleHTTPRequestHandler):
    server_version = "TrajectoryPortal/1.0"

    @property
    def state(self) -> PortalState:
        return getattr(self.server, "portal_state")

    def log_message(self, format: str, *args: Any) -> None:
        sys.stdout.write("[portal] " + format % args + "\n")

    def valid_host(self) -> bool:
        host = self.headers.get("Host", "").split(":", 1)[0].strip("[]").lower()
        return host in {"127.0.0.1", "localhost"}

    def valid_write_request(self) -> bool:
        origin = self.headers.get("Origin")
        if origin:
            parsed = urllib.parse.urlparse(origin)
            request_host = self.headers.get("Host", "").lower()
            if parsed.scheme != "http" or parsed.netloc.lower() != request_host:
                return False
        if self.headers.get("Sec-Fetch-Site", "").lower() in {"cross-site", "same-site"}:
            return False
        return self.headers.get_content_type() == "application/json"

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        if length < 0 or length > 1_000_000:
            raise ValueError("请求内容过大")
        data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        if not isinstance(data, dict):
            raise ValueError("请求格式无效")
        return data

    def do_GET(self) -> None:  # noqa: N802
        if not self.valid_host():
            self.send_json({"error": "invalid host"}, HTTPStatus.FORBIDDEN)
            return
        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)
        try:
            if parsed.path == "/api/workspace":
                self.send_json(workspace_payload(self.state.root))
                return
            if parsed.path == "/api/tools/status":
                self.send_json(tool_status())
                return
            if parsed.path == "/api/trial":
                includes = {item for value in query.get("include", []) for item in value.split(",") if item}
                self.send_json(trial_detail(self.state, query.get("job", [""])[0], query.get("trial", [""])[0], includes))
                return
            if parsed.path == "/api/artifact-preview":
                requested = artifact_target(
                    self.state,
                    query.get("job", [""])[0],
                    query.get("trial", [""])[0],
                    query.get("path", [""])[0],
                )
                self.send_json(artifact_preview(requested))
                return
            if parsed.path == "/api/artifact":
                self.serve_artifact(query)
                return
            if parsed.path.startswith("/api/"):
                self.send_json({"error": "API 不存在"}, HTTPStatus.NOT_FOUND)
                return
            self.serve_frontend(parsed.path)
        except (ValueError, RuntimeError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - last-resort local error boundary
            self.send_json({"error": f"处理失败：{exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:  # noqa: N802
        if not self.valid_host():
            self.send_json({"error": "invalid host"}, HTTPStatus.FORBIDDEN)
            return
        if not self.valid_write_request():
            self.send_json({"error": "write request must be same-origin JSON"}, HTTPStatus.FORBIDDEN)
            return
        parsed = urllib.parse.urlparse(self.path)
        try:
            if parsed.path == "/api/workspace":
                payload = self.read_body()
                root = self.state.set_root(str(payload.get("path", "")))
                self.send_json(workspace_payload(root))
                return
            if parsed.path == "/api/select-directory":
                selected = choose_directory(self.state.root)
                if selected:
                    root = self.state.set_root(selected)
                    self.send_json(workspace_payload(root))
                else:
                    self.send_json({"cancelled": True})
                return
            if parsed.path == "/api/tools/launch":
                payload = self.read_body()
                self.send_json(
                    launch_tool(
                        self.state,
                        str(payload.get("tool", "")),
                        str(payload.get("job", "")),
                        str(payload.get("trial")) if payload.get("trial") else None,
                        str(payload.get("trajectoryPath")) if payload.get("trajectoryPath") else None,
                    )
                )
                return
            if parsed.path == "/api/tools/install":
                payload = self.read_body()
                self.send_json(install_tool(str(payload.get("tool", ""))))
                return
            self.send_json({"error": "API 不存在"}, HTTPStatus.NOT_FOUND)
        except (ValueError, RuntimeError, json.JSONDecodeError) as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover
            self.send_json({"error": f"处理失败：{exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def serve_artifact(self, query: dict[str, list[str]]) -> None:
        requested = artifact_target(
            self.state,
            query.get("job", [""])[0],
            query.get("trial", [""])[0],
            query.get("path", [""])[0],
        )
        content = requested.read_bytes()
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        filename = urllib.parse.quote(requested.name)
        self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{filename}")
        self.end_headers()
        self.wfile.write(content)

    def serve_frontend(self, request_path: str) -> None:
        if not DIST_DIR.is_dir():
            raise RuntimeError("Portal 尚未构建，请在 tools/trajectory-portal 中运行 npm install 和 npm run build")
        relative = request_path.lstrip("/") or "index.html"
        candidate = (DIST_DIR / relative).resolve()
        try:
            candidate.relative_to(DIST_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        if not candidate.is_file():
            candidate = DIST_DIR / "index.html"
        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="启动本地 Harbor trajectory Portal")
    parser.add_argument("--root", type=Path, default=Path.cwd() / "harbor-jobs", help="Harbor job 根目录")
    parser.add_argument("--port", type=int, default=8765, help="本地服务端口")
    parser.add_argument("--no-open", action="store_true", help="不要自动打开浏览器")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        print(f"Job 根目录不存在：{root}", file=sys.stderr)
        return 2
    if not DIST_DIR.is_dir():
        print("Portal 尚未构建，请先运行 npm install 和 npm run build。", file=sys.stderr)
        return 2
    state = PortalState(root=root)
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), PortalHandler)
    except OSError as exc:
        print(f"无法监听本地端口 {args.port}：{exc}", file=sys.stderr)
        return 2
    setattr(server, "portal_state", state)
    url = f"http://127.0.0.1:{args.port}"
    print(f"Trajectory Portal: {url}")
    print(f"Job 根目录: {root}")
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        state.stop_children()
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
