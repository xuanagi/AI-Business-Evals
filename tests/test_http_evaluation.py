import asyncio
import copy
import importlib.util
import json
import shutil
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace

import pytest

from harbor_agents.http_client import HttpExecutionError, post_json


ROOT = Path(__file__).parents[1]
TASK = ROOT / "examples/harbor-http-tasks/http-reconciliation"


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SERVICE = load("http_demo", ROOT / "examples/http-reconciliation-service.py")
GRADER = load("http_grader", TASK / "tests/evaluator.py")
INPUT = json.loads((TASK / "environment/input.json").read_text())


@pytest.fixture
def server():
    instance = ThreadingHTTPServer(("127.0.0.1", 0), SERVICE.Handler)
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{instance.server_port}/reconcile"
    instance.shutdown()
    instance.server_close()
    thread.join()


def test_http_service_to_independent_verifier(server):
    response, evidence = post_json(server, INPUT)
    assert GRADER.evaluate(response)["reward"] == pytest.approx(1)
    assert evidence["status"] == 200 and evidence["request_seconds"] > 0
    assert "endpoint" not in evidence


@pytest.mark.parametrize("mutation", ["missing", "duplicate", "wrong_amount", "wrong_status", "boolean", "schema"])
def test_business_errors_rejected(mutation):
    response = SERVICE.reconcile(INPUT)
    if mutation == "missing":
        response["rows"].pop()
    elif mutation == "duplicate":
        response["rows"][-1] = copy.deepcopy(response["rows"][0])
    elif mutation == "wrong_amount":
        response["rows"][0]["amount_delta"] = 400  # Undeduplicated receipt.
    elif mutation == "wrong_status":
        response["rows"][3]["status"] = "matched"
    elif mutation == "boolean":
        response["rows"][0]["quantity_delta"] = False
    else:
        response = {"rows": [None]}
    assert GRADER.evaluate(response)["reward"] < 1


def test_order_of_rows_is_not_part_of_contract():
    response = SERVICE.reconcile(INPUT)
    response["rows"].reverse()
    assert GRADER.evaluate(response)["reward"] == pytest.approx(1)


def test_http_failure_is_not_business_score(server):
    with pytest.raises(HttpExecutionError, match="status 404"):
        post_json(server + "?secret=do-not-log", INPUT)


@pytest.mark.parametrize("endpoint", ["file:///tmp/input", "http://user:password@localhost/x", "http://localhost/#fragment"])
def test_invalid_endpoint(endpoint):
    with pytest.raises(ValueError):
        post_json(endpoint, {})


def test_missing_auth_and_invalid_timeout(server, monkeypatch):
    monkeypatch.delenv("HTTP_TEST_SECRET", raising=False)
    with pytest.raises(ValueError, match="missing"):
        post_json(server, {}, token_env="HTTP_TEST_SECRET")
    for timeout in (0, -1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            post_json(server, {}, timeout=timeout)
    monkeypatch.setenv("HTTP_TEST_SECRET", "private-value")
    with pytest.raises(ValueError, match="HTTPS"):
        post_json(server, {}, token_env="HTTP_TEST_SECRET")


def test_protocol_failures():
    class Handler(BaseHTTPRequestHandler):
        calls = 0

        def do_POST(self):
            type(self).calls += 1
            self.send_response(302 if self.path == "/redirect" else 200)
            self.send_header("Location", "/other")
            self.end_headers()
            self.wfile.write(b"not-json" if self.path == "/invalid" else b'"large-response"')

        def log_message(self, *args):
            pass

    instance = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=instance.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{instance.server_port}"
    try:
        with pytest.raises(HttpExecutionError, match="302"):
            post_json(base + "/redirect", {})
        assert Handler.calls == 1  # No redirects or retries.
        with pytest.raises(HttpExecutionError, match="JSON"):
            post_json(base + "/invalid", {})
        with pytest.raises(HttpExecutionError, match="size limit"):
            post_json(base + "/large", {}, max_response_bytes=3)
    finally:
        instance.shutdown()
        instance.server_close()
        thread.join()


def test_timeout_does_not_expose_endpoint_or_retry(monkeypatch):
    calls = []

    class Opener:
        def open(self, request, timeout):
            calls.append(timeout)
            raise TimeoutError("secret URL or credential")

    monkeypatch.setattr("urllib.request.build_opener", lambda *args: Opener())
    with pytest.raises(HttpExecutionError, match="timed out") as error:
        post_json("http://localhost/secret", {}, timeout=0.2)
    assert "secret" not in str(error.value)
    assert calls == [0.2]


def test_actual_harbor_adapter_and_task(server, tmp_path):
    pytest.importorskip("harbor")
    from harbor.models.task.task import Task
    from harbor.models.agent.context import AgentContext
    from harbor_agents.http_json import HttpJsonAgent

    task = Task(TASK)
    assert task.config.task.name.endswith("http-reconciliation")

    class Environment:
        async def exec(self, command):
            assert command == "mkdir -p /workspace/output"
            return SimpleNamespace(return_code=0)

        async def download_file(self, source, target):
            assert source == "/workspace/input.json"
            shutil.copyfile(TASK / "environment/input.json", target)

        async def upload_file(self, source, target):
            shutil.copyfile(source, tmp_path / Path(target).name)

    async def execute():
        agent = HttpJsonAgent(logs_dir=tmp_path / "agent", endpoint=server, target_version="demo-v1")
        assert agent.to_agent_info().model_info is None
        assert agent.version() == "demo-v1"
        context = AgentContext()
        environment = Environment()
        await agent.setup(environment)
        await agent.run("ignored natural-language instruction", environment, context)
        assert context.n_input_tokens is None
        assert context.metadata["status"] == 200

    asyncio.run(execute())
    response = json.loads((tmp_path / "response.json").read_text())
    assert GRADER.evaluate(response)["reward"] == pytest.approx(1)
    assert (tmp_path / "agent/http-call.jsonl").is_file()
    assert not (tmp_path / "agent/trajectory.json").exists()
