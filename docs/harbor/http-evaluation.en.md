# Evaluate HTTP applications with Harbor

[中文](http-evaluation.md) | English

Harbor remains the only execution layer. `HttpJsonAgent` implements Harbor’s custom Agent interface without calling a model: it reads Task input, sends a JSON POST request, saves the response, and lets the Task verifier accept or reject the business result. The adapter has been validated with Harbor **0.22.0 / Python 3.12**.

```text
Task input.json → HttpJsonAgent → HTTP application / algorithm
                                      ↓
Task verifier ← output/response.json
      ↓
Harbor Job / Trial → existing Portal
```

## Run the local example

You need Python, [uv](https://docs.astral.sh/uv/getting-started/installation/), and a running Docker daemon. Use two terminals from the repository root. The teaching service needs no model account or API key.

In terminal 1, start the stateless local service:

```sh
python examples/http-reconciliation-service.py
```

In terminal 2, expose the repository as a Python import path.

PowerShell:

```powershell
$env:PYTHONPATH = "$($PWD.Path)" + [IO.Path]::PathSeparator + $env:PYTHONPATH
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
```

Bash:

```bash
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
```

Run the Task:

```sh
uv run --python 3.12 --with harbor==0.22.0 harbor run --path examples/harbor-http-tasks/http-reconciliation --agent harbor_agents.http_json:HttpJsonAgent --agent-kwarg endpoint=http://127.0.0.1:8766/reconcile --agent-kwarg target_version=demo-v1 --jobs-dir harbor-jobs --artifact /workspace/output --max-retries 0
```

The request originates on the **Harbor host**, not inside the container, so `127.0.0.1` refers to the machine running Harbor; `host.docker.internal` is not needed. The Task input is downloaded through Harbor’s environment-file interface and the response is uploaded afterward. Keep the service running for the whole evaluation, then press Ctrl+C in terminal 1.

The expected reward is 1. The saved evidence includes:

- `response.json`: business response;
- `http-call.json`: status, request duration, response size, and declared subject version;
- `http-call.jsonl`: a compact call log without authentication headers;
- `score.json`: verifier-generated business checks.

HTTP examples have no model, token, or ATIF conversation trajectory. Portal should not treat those as missing execution evidence. Portal duration includes input download, request, and response upload; `request_seconds` covers only the request through response read and is not pure server compute time.

## Validate another implementation with the same Task

The Task includes a local oracle that does not call the service or read gold data:

```sh
uv run --python 3.12 --with harbor==0.22.0 harbor run --path examples/harbor-http-tasks/http-reconciliation --agent oracle --jobs-dir harbor-jobs --artifact /workspace/output --max-retries 0
```

The HTTP service and oracle produce the same business JSON and are checked by one verifier. A normal Agent can also run this Task when configured with its model and credentials. This is a small original reconciliation example, not a full HTTP port of the Office procurement task and not production coverage.

## Customize three parts

1. **Input**: copy the example Task and change `environment/input.json`, `instruction.md`, and the Task identity.
2. **Invocation**: for a JSON POST → JSON endpoint, change `endpoint`; for field mappings, async polling, or other special flows, modify or derive the adapter.
3. **Acceptance**: update `tests/evaluator.py` and add regression cases for both correct and representative incorrect results.

The default contract uses `/workspace/input.json` and `/workspace/output/response.json`. The reference supports synchronous POST only; it intentionally does not introduce a universal workflow, plugin registry, automatic field mapping, or business scoring DSL. Organize independent cases as separate Tasks and let Harbor batch them.

## Authentication, errors, and boundaries

- `--agent-kwarg token_env=MY_SERVICE_TOKEN` reads a Bearer token from the Harbor host environment. Use HTTPS; pass only the variable name and never put the token in a command, query string, or Task. Container `extra_env` is not used for this token.
- `--agent-kwarg timeout=30` sets the request socket timeout. It is not a hard deadline for remote work, and cancelling local waiting does not guarantee remote cancellation.
- Redirects are not followed and requests are not retried. The example also uses `--max-retries 0` to avoid repeated side effects. Design idempotency and cleanup before testing stateful services.
- Non-2xx responses, network errors, timeouts, oversized responses, and invalid JSON are execution errors raised to Harbor. A valid JSON business error is scored by the verifier; an unexpected verifier exception is not disguised as a business zero.
- The response limit is 10 MB by default. Inputs and responses may contain sensitive data; redact and authorize before sharing Tasks, Jobs, or Portal snapshots.
- `target_version` is a declared subject version, not an automatic deployment check. Use a traceable version identifier and control remote state, dependencies, and resources before comparison.

## Regression tests

The adapter, realistic HTTP calls, and positive/negative business cases can be tested without starting Docker:

```sh
uv run --python 3.12 --with harbor==0.22.0 --with pytest==8.3.4 python -m pytest tests/test_http_evaluation.py -q
```

The file-transfer layer is replaced by a test double. Run the two Harbor commands above for the complete container path.
