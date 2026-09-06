from __future__ import annotations

import importlib.util
import json
import sys
import threading
import urllib.error
import urllib.request
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest


SERVER_PATH = Path(__file__).parents[1] / "tools" / "trajectory-portal" / "server.py"
SPEC = importlib.util.spec_from_file_location("trajectory_portal_server", SERVER_PATH)
assert SPEC and SPEC.loader
SERVER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SERVER
SPEC.loader.exec_module(SERVER)


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_http_trial_without_model_or_trajectory(tmp_path):
    trial = tmp_path / "http-trial"
    write_json(trial / "result.json", {
        "task_name": "http-reconciliation",
        "config": {"agent": {"import_path": "harbor_agents.http_json:HttpJsonAgent", "model_name": None}},
        "agent_info": {"name": "http-json", "version": "demo-v1", "model_info": None},
        "agent_result": {"metadata": {"transport": "http", "request_seconds": 0.01}},
        "verifier_result": {"rewards": {"reward": 1.0}},
        "finished_at": "2026-09-05T00:01:00Z",
    })
    write_json(trial / "verifier/score.json", {"reward": 1.0, "passed": 6, "total": 6, "checks": []})
    (trial / "agent").mkdir()
    (trial / "agent/http-call.jsonl").write_text('{"status": 200}\n')
    summary = SERVER.trial_summary(trial)
    assert summary["agent"] == "http-json"
    assert summary["agentVersion"] == "demo-v1"
    assert not summary["model"] and not summary["hasTrajectory"]
    assert summary["reward"] == 1.0 and summary["passed"] == 6
    assert SERVER.agent_log_entries(trial)[0]["path"] == "agent/http-call.jsonl"


def make_job(root: Path) -> tuple[Path, Path]:
    job = root / "demo-job"
    trial = job / "demo-trial"
    write_json(
        job / "result.json",
        {
            "id": "job-1",
            "started_at": "2026-01-01T00:00:00",
            "finished_at": "2026-01-01T00:02:00",
            "n_total_trials": 1,
            "stats": {
                "n_completed_trials": 1,
                "n_errored_trials": 0,
                "n_input_tokens": 100,
                "n_output_tokens": 20,
                "evals": {"codex__demo": {"metrics": [{"mean": 0.75}]}},
            },
        },
    )
    write_json(
        trial / "result.json",
        {
            "task_name": "demo/task-one",
            "task_id": "task-one@1",
            "task_checksum": "sha256:demo-checksum",
            "source": "demo-suite",
            "config": {
                "agent": {
                    "name": "codex",
                    "model_name": "demo-model",
                    "kwargs": {"reasoning_effort": "medium"},
                }
            },
            "agent_result": {"n_input_tokens": 100, "n_output_tokens": 20, "cost_usd": 1.25},
            "agent_execution": {
                "started_at": "2026-01-01T00:00:10Z",
                "finished_at": "2026-01-01T00:01:10Z",
            },
        },
    )
    write_json(
        trial / "verifier" / "score.json",
        {
            "reward": 0.75,
            "passed": 2,
            "total": 3,
            "gate_failed": False,
            "checks": [{"name": "output_exists", "passed": True, "weight": 0, "evaluator_type": "program"}],
        },
    )
    write_json(
        trial / "agent" / "trajectory.json",
        {
            "schema_version": "ATIF-v1.7",
            "session_id": "session-1",
            "agent": {"name": "demo", "version": "1"},
            "steps": [
                {
                    "step_id": 1,
                    "timestamp": "2026-01-01T00:00:15Z",
                    "source": "agent",
                    "message": "检查",
                    "tool_calls": [{"tool_call_id": "call-1", "function_name": "exec", "arguments": {}}],
                    "observation": {"results": [{"source_call_id": "call-1", "content": "ok"}]},
                },
                {"step_id": 2, "timestamp": "2026-01-01T00:00:20Z", "source": "agent", "message": "完成", "tool_calls": []},
            ],
        },
    )
    artifact = trial / "artifacts" / "workspace" / "output" / "result.xlsx"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(b"xlsx")
    write_json(
        trial / "artifacts" / "manifest.json",
        [{"source": "/workspace/output", "destination": "artifacts/workspace/output", "status": "ok", "type": "directory"}],
    )
    return job, trial


def test_scan_jobs_and_trial_detail(tmp_path: Path) -> None:
    _, trial = make_job(tmp_path)
    jobs = SERVER.scan_jobs(tmp_path)
    assert len(jobs) == 1
    assert jobs[0]["mean"] == 0.75
    assert jobs[0]["failedChecks"] == 1
    assert jobs[0]["model"] == "demo-model"
    assert jobs[0]["trials"][0]["taskChecksum"] == "sha256:demo-checksum"
    assert jobs[0]["trials"][0]["status"] == "completed"
    assert jobs[0]["trials"][0]["toolCalls"] == 1
    assert jobs[0]["trials"][0]["artifacts"][0]["name"] == "result.xlsx"
    assert jobs[0]["trials"][0]["trajectoryValidation"]["valid"] is True
    assert jobs[0]["trials"][0]["phases"][-1]["key"] == "artifact"

    state = SERVER.PortalState(root=tmp_path)
    detail = SERVER.trial_detail(state, "demo-job", trial.name, {"trajectory"})
    assert detail["summary"]["reward"] == 0.75
    assert detail["score"]["checks"][0]["evaluator_type"] == "program"
    assert detail["trajectory"]["schema_version"] == "ATIF-v1.7"


def test_path_confinement(tmp_path: Path) -> None:
    make_job(tmp_path)
    state = SERVER.PortalState(root=tmp_path)
    try:
        state.resolve_job("../outside")
    except ValueError as exc:
        assert "不在当前根目录" in str(exc)
    else:
        raise AssertionError("path traversal must be rejected")


def test_root_can_be_a_single_job(tmp_path: Path) -> None:
    job, _ = make_job(tmp_path)
    jobs = SERVER.scan_jobs(job)
    assert [item["name"] for item in jobs] == ["demo-job"]


def test_diagnostics_count_unreadable_jobs_and_trials(tmp_path: Path) -> None:
    job, _ = make_job(tmp_path)
    write_json(tmp_path / "broken-job" / "config.json", {"agents": []})
    write_json(job / "missing-result-trial" / "config.json", {"task": {"path": "demo"}})

    payload = SERVER.workspace_payload(tmp_path)

    assert payload["diagnostics"]["jobsDiscovered"] == 2
    assert payload["diagnostics"]["jobsSkipped"] == 1
    assert payload["diagnostics"]["trialsDiscovered"] == 2
    assert payload["diagnostics"]["trialsSkipped"] == 0
    assert {issue["kind"] for issue in payload["diagnostics"]["issues"]} == {"job_result"}
    pending = next(trial for trial in payload["jobs"][0]["trials"] if trial["name"] == "missing-result-trial")
    assert pending["status"] == "pending"


def test_trajectory_validation_checks_tool_references_and_required_fields(tmp_path: Path) -> None:
    path = tmp_path / "trajectory.json"
    write_json(
        path,
        {
            "steps": [
                {
                    "step_id": 2,
                    "source": "agent",
                    "tool_calls": [{"tool_call_id": "call-1"}],
                    "observation": {"results": [{"source_call_id": "missing-call"}]},
                }
            ]
        },
    )

    validation = SERVER.trajectory_validation(path)

    assert validation["valid"] is False
    assert any("schema_version" in issue for issue in validation["issues"])
    assert any("agent" in issue for issue in validation["issues"])
    assert any("function_name" in issue for issue in validation["issues"])
    assert any("arguments" in issue for issue in validation["issues"])
    assert any("不存在的调用" in issue for issue in validation["issues"])
    assert any("source_call_id" in warning for warning in validation["warnings"])
    assert not any("session_id" in issue for issue in validation["issues"])
    assert not any("时间戳" in issue for issue in validation["issues"])


def test_regrade_exposes_score_delta_and_job_cost_excludes_reused_agent_cost(tmp_path: Path) -> None:
    job, source = make_job(tmp_path)
    regrade = job / "regrade-trial"
    write_json(
        regrade / "config.json",
        {
            "task": {"path": "demo-task", "source": "demo-suite"},
            "source_trial": {"action": "regrade", "type": "local", "path": str(source)},
        },
    )
    write_json(
        regrade / "result.json",
        {
            "task_name": "demo/task-one",
            "task_checksum": "sha256:demo-checksum",
            "started_at": "2026-01-01T00:03:00Z",
            "finished_at": "2026-01-01T00:04:00Z",
            "config": {
                "task": {"path": "demo-task", "source": "demo-suite"},
                "agent": {"name": "codex", "model_name": "demo-model", "kwargs": {"reasoning_effort": "medium"}},
                "source_trial": {"action": "regrade", "type": "local", "path": str(source)},
            },
            "agent_result": {"cost_usd": 99.0},
        },
    )
    write_json(regrade / "verifier" / "score.json", {"reward": 1.0, "passed": 3, "total": 3})

    jobs = SERVER.scan_jobs(tmp_path)
    regrade_summary = next(trial for trial in jobs[0]["trials"] if trial["name"] == "regrade-trial")

    assert regrade_summary["isRegrade"] is True
    assert regrade_summary["sourceReward"] == 0.75
    assert regrade_summary["regradeDelta"] == 0.25
    assert jobs[0]["costUsd"] == 1.25


def test_step_results_expose_nested_timing_artifacts_and_early_termination(tmp_path: Path) -> None:
    task_dir = tmp_path / "task"
    task_dir.mkdir()
    (task_dir / "task.toml").write_text(
        '[[steps]]\nname = "step-one"\n\n[[steps]]\nname = "step-two"\n',
        encoding="utf-8",
    )
    trial = tmp_path / "trial"
    write_json(trial / "config.json", {"task": {"path": str(task_dir)}})
    artifact = trial / "steps" / "step-one" / "artifacts" / "workspace" / "result.txt"
    artifact.parent.mkdir(parents=True)
    artifact.write_text("done", encoding="utf-8")
    write_json(trial / "steps" / "step-one" / "artifacts" / "manifest.json", [])

    steps = SERVER.step_results(
        {
            "step_results": [
                {
                    "step_name": "step-one",
                    "agent_execution": {
                        "started_at": "2026-01-01T00:00:00Z",
                        "finished_at": "2026-01-01T00:00:10Z",
                    },
                    "verifier": {
                        "started_at": "2026-01-01T00:00:10Z",
                        "finished_at": "2026-01-01T00:00:12Z",
                    },
                    "verifier_result": {"rewards": {"reward": 0.5}},
                }
            ]
        },
        trial,
    )

    assert steps[0]["seconds"] == 12.0
    assert steps[0]["artifactCount"] == 1
    assert steps[0]["terminatedEarly"] is True


def test_artifact_phase_treats_manifest_only_directory_as_empty(tmp_path: Path) -> None:
    trial = tmp_path / "trial"
    write_json(trial / "artifacts" / "manifest.json", [])

    phases = SERVER.phase_durations({}, trial)

    assert phases == [
        {
            "key": "artifact",
            "label": "交付物采集",
            "startedAt": None,
            "finishedAt": None,
            "seconds": None,
            "status": "empty",
            "note": "没有采集到交付物；Harbor 未记录该阶段耗时",
        }
    ]


def test_source_trial_reward_reads_hub_cache_layout(tmp_path: Path) -> None:
    regrade = tmp_path / "regrade-trial"
    cached_source = tmp_path / ".sources" / "trial-id" / "downloaded-trial"
    write_json(cached_source / "result.json", {"task_name": "demo/task"})
    write_json(cached_source / "verifier" / "score.json", {"reward": 0.625})

    assert SERVER.source_trial_reward(regrade, {"trial_id": "trial-id"}) == 0.625


def test_result_reward_is_authoritative_and_conflicts_are_reported(tmp_path: Path) -> None:
    _, trial = make_job(tmp_path)
    result = json.loads((trial / "result.json").read_text(encoding="utf-8"))
    result["verifier_result"] = {"rewards": {"reward": 0.25}}
    write_json(trial / "result.json", result)

    summary = SERVER.trial_summary(trial)

    assert summary is not None
    assert summary["reward"] == 0.25
    assert summary["rewardSources"] == ["result.json", "score.json"]
    assert summary["rewardConflicts"] == [
        {
            "dimension": "reward",
            "canonicalSource": "result.json",
            "canonicalValue": 0.25,
            "conflictingSource": "score.json",
            "conflictingValue": 0.75,
        }
    ]


def test_multistep_harbor_layout_is_aggregated(tmp_path: Path) -> None:
    job, _ = make_job(tmp_path)
    trial = job / "multi-step-trial"
    write_json(
        trial / "result.json",
        {
            "task_name": "demo/multi-step",
            "task_checksum": "sha256:multi",
            "started_at": "2026-01-02T00:00:00Z",
            "finished_at": "2026-01-02T00:01:00Z",
            "config": {"agent": {"name": "codex", "model_name": "multi-model"}},
            "verifier_result": {"rewards": {"reward": 0.75}},
            "step_results": [
                {
                    "step_name": "z-collect",
                    "agent_result": {"n_input_tokens": 120, "n_cache_tokens": 20, "n_output_tokens": 30, "cost_usd": 0.4},
                    "agent_execution": {"started_at": "2026-01-02T00:00:00Z", "finished_at": "2026-01-02T00:00:10Z"},
                    "verifier_result": {"rewards": {"reward": 0.5}},
                },
                {
                    "step_name": "a-deliver",
                    "agent_result": {"n_input_tokens": 180, "n_cache_tokens": 30, "n_output_tokens": 20, "cost_usd": 0.6},
                    "agent_execution": {"started_at": "2026-01-02T00:00:20Z", "finished_at": "2026-01-02T00:00:40Z"},
                    "verifier_result": {"rewards": {"reward": 1.0}},
                },
            ],
        },
    )
    for index, step_name in enumerate(("z-collect", "a-deliver"), 1):
        step = trial / "steps" / step_name
        write_json(
            step / "agent" / "trajectory.json",
            {
                "schema_version": "ATIF-v1.7",
                "agent": {"name": "codex", "version": "1"},
                "steps": [{"step_id": 1, "source": "agent", "message": f"step {index}"}],
            },
        )
        (step / "agent" / "runtime.log").write_text(f"log {step_name}", encoding="utf-8")
        write_json(step / "verifier" / "score.json", {"reward": index / 2, "passed": index, "total": index})
    artifact = trial / "steps" / "a-deliver" / "artifacts" / "workspace" / "output.txt"
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text("done", encoding="utf-8")
    write_json(trial / "steps" / "a-deliver" / "artifacts" / "manifest.json", [])

    summary = SERVER.trial_summary(trial)
    assert summary is not None
    assert summary["reward"] == 0.75
    assert summary["rewardConflicts"] == []
    assert summary["hasTrajectory"] is True
    assert (summary["agentSteps"], summary["toolCalls"]) == (2, 0)
    assert (summary["inputTokens"], summary["cachedTokens"], summary["outputTokens"], summary["costUsd"]) == (300, 50, 50, 1.0)
    assert summary["agentSeconds"] == 30
    assert summary["artifacts"][0]["storagePath"] == "steps/a-deliver/artifacts/workspace/output.txt"

    detail = SERVER.trial_detail(SERVER.PortalState(root=tmp_path), job.name, trial.name, {"trajectory", "log"})
    assert [step["portal_step_name"] for step in detail["trajectory"]["steps"]] == ["z-collect", "a-deliver"]
    assert [step["step_id"] for step in detail["trajectory"]["steps"]] == [1, 2]
    assert [entry["label"] for entry in detail["agentLogs"]] == ["步骤 z-collect · runtime.log", "步骤 a-deliver · runtime.log"]
    assert [score["stepName"] for score in detail["stepScores"]] == ["z-collect", "a-deliver"]
    assert detail["trajectoryFiles"] == [
        {"stepName": "z-collect", "label": "步骤 z-collect", "path": "steps/z-collect/agent/trajectory.json"},
        {"stepName": "a-deliver", "label": "步骤 a-deliver", "path": "steps/a-deliver/agent/trajectory.json"},
    ]


def test_atif_v17_optional_fields_and_unlinked_observations_are_valid(tmp_path: Path) -> None:
    path = tmp_path / "trajectory.json"
    write_json(
        path,
        {
            "schema_version": "ATIF-v1.7",
            "agent": {"name": "demo", "version": "1"},
            "steps": [
                {"step_id": 1, "source": "user", "message": "go"},
                {
                    "step_id": 2,
                    "source": "agent",
                    "message": "",
                    "observation": {"results": [{"content": "non-tool action"}]},
                },
            ],
        },
    )

    validation = SERVER.trajectory_validation(path)

    assert validation["valid"] is True
    assert validation["issues"] == []
    assert validation["warnings"] == []


def test_multistep_missing_aggregate_does_not_use_last_step_reward(tmp_path: Path) -> None:
    test_multistep_harbor_layout_is_aggregated(tmp_path)
    trial = tmp_path / "demo-job" / "multi-step-trial"
    result = json.loads((trial / "result.json").read_text(encoding="utf-8"))
    result.pop("verifier_result")
    write_json(trial / "result.json", result)

    summary = SERVER.trial_summary(trial)

    assert summary["reward"] is None
    assert summary["rewards"] == {}
    assert summary["rewardSources"] == []
    assert summary["status"] == "unscored"
    assert [step["reward"] for step in summary["stepResults"]] == [0.5, 1.0]


def test_xlsx_preview_preserves_sparse_rows_and_uncached_formulas(tmp_path: Path) -> None:
    path = tmp_path / "sparse.xlsx"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<dimension ref="A1:A10"/><sheetData>'
            '<row r="1"><c r="A1"><v>7</v></c></row>'
            '<row r="10"><c r="A10"><f>1+1</f></c></row>'
            '</sheetData></worksheet>',
        )

    preview = SERVER.preview_xlsx(path)

    sheet = preview["sheets"][0]
    assert sheet["totalRows"] == 10
    assert len(sheet["rows"]) == 10
    assert sheet["rows"][1] == []
    assert sheet["rows"][9][0] == "=1+1"


def test_mutating_endpoints_reject_cross_origin_or_non_json_requests(tmp_path: Path) -> None:
    make_job(tmp_path)
    server = ThreadingHTTPServer(("127.0.0.1", 0), SERVER.PortalHandler)
    server.portal_state = SERVER.PortalState(root=tmp_path)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    port = server.server_address[1]
    try:
        requests = [
            urllib.request.Request(
                f"http://127.0.0.1:{port}/api/workspace",
                data=b'{}',
                headers={"Content-Type": "application/json", "Origin": "http://evil.example"},
                method="POST",
            ),
            urllib.request.Request(
                f"http://127.0.0.1:{port}/api/workspace",
                data=b'{}',
                headers={"Content-Type": "text/plain"},
                method="POST",
            ),
        ]
        for request in requests:
            try:
                urllib.request.urlopen(request, timeout=2)
            except urllib.error.HTTPError as exc:
                assert exc.code == 403
            else:
                raise AssertionError("unsafe write request must be rejected")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def test_agentviz_requires_and_uses_a_specific_multistep_trajectory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    job = tmp_path / "job"
    trial = job / "trial"
    write_json(job / "result.json", {"stats": {"evals": {}}})
    write_json(trial / "result.json", {"task_name": "demo/multi", "started_at": "2026-01-01", "config": {}})
    for name in ("one", "two"):
        write_json(
            trial / "steps" / name / "agent" / "trajectory.json",
            {"schema_version": "ATIF-v1.7", "agent": {"name": "demo", "version": "1"}, "steps": []},
        )

    commands: list[list[str]] = []

    class FakeProcess:
        pid = 123

    monkeypatch.setattr(SERVER.shutil, "which", lambda name: name)
    monkeypatch.setattr(SERVER.subprocess, "Popen", lambda command, **kwargs: commands.append(command) or FakeProcess())
    state = SERVER.PortalState(root=tmp_path)

    with pytest.raises(ValueError, match="多步 Trial"):
        SERVER.launch_tool(state, "agentviz", job.name, trial.name)
    result = SERVER.launch_tool(state, "agentviz", job.name, trial.name, "steps/two/agent/trajectory.json")

    assert result["ok"] is True
    assert Path(commands[0][-1]) == trial / "steps" / "two" / "agent" / "trajectory.json"
