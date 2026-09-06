# Harbor Agent adapters in this repository

[中文](README.md) | English

This directory contains custom Harbor adapters. It is not part of the Task dataset and is not copied into Task images.

## HTTP JSON adapter

`harbor_agents.http_json:HttpJsonAgent` implements Harbor’s Agent interface without calling a model. It downloads the Task input, sends one JSON POST request from the Harbor host, stores the response and call metadata, and lets the Task verifier judge the business result.

Example:

```sh
uv run --python 3.12 --with harbor==0.22.0 harbor run \
  --path examples/harbor-http-tasks/http-reconciliation \
  --agent harbor_agents.http_json:HttpJsonAgent \
  --agent-kwarg endpoint=http://127.0.0.1:8766/reconcile \
  --agent-kwarg target_version=demo-v1 \
  --jobs-dir harbor-jobs --artifact /workspace/output --max-retries 0
```

The adapter currently supports synchronous JSON POST → JSON. It does not follow redirects or retry requests. A socket timeout, non-2xx response, invalid JSON, or response larger than the configured limit is an execution error; a valid business response is scored by the verifier. For stateful or asynchronous services, derive an adapter for the scenario instead of adding a generic workflow layer here.

`token_env` may name an environment variable on the Harbor host for a Bearer token. Pass the variable name, never the secret. Keep HTTPS and the service’s own authentication policy in charge.

## Codex npm adapter

`harbor_agents.codex_npm:CodexNpm` is an optional adapter for installing a pinned Codex CLI version with the Node.js/npm already present in the Task image. It only covers installation; model parameters, authentication, command execution, and ATIF conversion remain Harbor’s Codex behavior.

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1'
harbor run -p .\examples\harbor-office-tasks \
  -a harbor_agents.codex_npm:CodexNpm -m gpt-5.6-luna \
  --ak reasoning_effort=high --ak version=0.153.2
```

Task images remain Agent-neutral. Do not preinstall a particular Agent in a Task image, and do not put credentials in Task files.
