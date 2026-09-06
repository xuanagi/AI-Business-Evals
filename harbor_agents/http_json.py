"""Expose a JSON HTTP service through Harbor's custom Agent execution interface."""

import asyncio
import json
import tempfile
from pathlib import Path

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

from harbor_agents.http_client import post_json


class HttpJsonAgent(BaseAgent):
    """POST /workspace/input.json; save response for the task's own verifier.

    Requests originate on the Harbor host, not inside the task container.
    Credentials are read from a host environment variable, never Agent kwargs.
    """

    def __init__(self, *args, endpoint: str, timeout: float = 30,
                 token_env: str = "", target_version: str = "unversioned", **kwargs):
        super().__init__(*args, **kwargs)
        self.endpoint = endpoint
        self.timeout = float(timeout)
        self.token_env = token_env
        self.target_version = target_version

    @staticmethod
    def name() -> str:
        return "http-json"

    def version(self) -> str:
        return self.target_version

    async def setup(self, environment: BaseEnvironment) -> None:
        result = await environment.exec("mkdir -p /workspace/output")
        if result.return_code != 0:
            raise RuntimeError("Could not prepare HTTP output directory")

    async def run(self, instruction: str, environment: BaseEnvironment,
                  context: AgentContext) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        context.metadata = {"transport": "http", "target_version": self.target_version}
        # Temporary request/response copies are deleted after upload. No gold is read.
        with tempfile.TemporaryDirectory(prefix="harbor-http-") as directory:
            temporary = Path(directory)
            input_file = temporary / "input.json"
            await environment.download_file("/workspace/input.json", input_file)
            payload = json.loads(input_file.read_text(encoding="utf-8"))
            result, evidence = await asyncio.to_thread(
                post_json, self.endpoint, payload, timeout=self.timeout, token_env=self.token_env)
            evidence["target_version"] = self.target_version
            context.metadata = evidence
            for filename, value in (("response.json", result), ("http-call.json", evidence)):
                local = temporary / filename
                local.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
                await environment.upload_file(local, f"/workspace/output/{filename}")
            # The Portal already supports JSONL execution logs. Do not invent ATIF or tokens.
            (self.logs_dir / "http-call.jsonl").write_text(json.dumps(evidence) + "\n", encoding="utf-8")
