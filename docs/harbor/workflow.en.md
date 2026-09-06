# Harbor workflow

[中文](workflow.md) | English

This workflow covers “choose an Office capability → build a Task → evaluate several models → locate differences”.

## 1. Choose an evaluation direction

Start with the [Office benchmark index](../office-benchmarks.en.md). Tie the direction to the business goal: spreadsheet processing, document generation, presentations, cross-application operation, or a domain-specific deliverable. Then choose the closest public benchmark or repository example.

The six Tasks in `examples/harbor-office-tasks` demonstrate Harbor format; they are not a complete taxonomy or coverage claim. Do not combine every Office capability in one Task. Define the deliverable, high-impact business errors, and deterministic checks first.

## 2. Prepare a Task

Copy the closest example and replace:

1. `instruction.md` with the real business request;
2. `environment/workspace.tar.gz` with an initial workspace and `input/`, without answers;
3. `tests/gold/gold_answer.json` with expected values, tolerances, and rules;
4. `tests/grading/score.py` with fixed weights and gates mapping checks to 0–1; and
5. `task.toml` with a unique lowercase name and resource limits.

Add the Task to the dataset and refresh its digest after later changes:

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor add .\examples\harbor-office-tasks\<task-directory> `
  --to .\examples\harbor-office-tasks

harbor sync .\examples\harbor-office-tasks
```

The complete initialization, workspace archive, gold/verifier design, and smoke-test procedure is in [`creating-task.en.md`](creating-task.en.md).

## 3. Self-test the verifier

At minimum test three groups:

- a compliant deliverable scores highly;
- an obvious error or empty file scores low; and
- breaking one metric changes only its component.

The six examples provide dynamic oracle fixtures and at least one negative fixture per type:

```powershell
python -m pytest -q
```

They intentionally do not include a runnable `solution/solve.sh` that could leak a construction recipe into the Agent workspace. A public Harbor registry release needs a separately maintained oracle solution, license review, and hidden tests. See [`scoring-design.en.md`](scoring-design.en.md).

## 4. Run one or more models

Run all six Tasks:

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
harbor run `
  -p .\examples\harbor-office-tasks `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  -k 3 `
  -n 2 `
  --artifact /workspace/output `
  -o .\harbor-jobs
```

`-k 3` gives each Trial three attempts for stability analysis; `-n 2` allows at most two concurrent Trials. Use a new Job name for another model and do not overwrite the previous Job. If a provider needs another adapter, replace both `-a` and `-m`.

The equivalent helper script is explicit about Agent and model and does not rewrite credential variables:

```powershell
.\scripts\run-office-cases.ps1 `
  -Agent codex -Model gpt-5.6-luna -ReasoningEffort medium `
  -Attempts 3 -Concurrent 2
```

Linux / macOS:

```bash
./scripts/run-office-cases.sh \
  --agent codex --model gpt-5.6-luna --reasoning-effort medium \
  --attempts 3 --concurrent 2
```

Harbor 0.22.0 may install Node.js through NVM in some Linux images. If the container cannot reach `raw.githubusercontent.com`, use the repository adapter, which consumes Node.js/npm already in the image:

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1'
.\scripts\run-office-cases.ps1 `
  -Agent harbor_agents.codex_npm:CodexNpm -Model gpt-5.6-luna `
  -ReasoningEffort high -AgentKwarg version=0.153.2 `
  -Attempts 1 -Concurrent 2 -JobName luna-high-office
```

Linux / macOS equivalent:

```bash
export CODEX_FORCE_AUTH_JSON=1 # only when this host really uses Codex login-file authentication
./scripts/run-office-cases.sh \
  --agent harbor_agents.codex_npm:CodexNpm \
  --model gpt-5.6-luna \
  --reasoning-effort high \
  --agent-kwarg version=0.153.2 \
  --attempts 1 \
  --concurrent 2 \
  --job-name luna-high-office
```

That adapter only changes installation. Model parameters, authentication, execution, and ATIF conversion still come from Harbor’s Codex implementation. The Task image remains Agent-neutral. Both `run-office-cases` scripts add the repository root to `PYTHONPATH`, so Harbor can import the adapter. The version shown is a reproducibility example; smoke-test one Task before changing it.

The examples use `public` for both stages to support the Windows Docker provider; a policy-capable production environment should use an Agent allowlist and a network-disabled verifier. The Task instruction still forbids network access and the deterministic verifier has no network dependency.

## 5. Review outcomes

```powershell
harbor view .\harbor-jobs --jobs
```

Compare reward first, then open `verifier/score.json` for components. Equal totals can hide different abilities; Office work should distinguish data correctness, structure, visualization, and provenance.

## 6. Review process / trajectory

Each normally completed Trial should contain `agent/trajectory.json` with messages, tool calls, observations, and timing. Use Harbor Viewer or RLViz for the whole Job; see [`trajectory-comparison.en.md`](trajectory-comparison.en.md) for commands and comparison guidance.

The repository Portal can choose Jobs, compare component scores and raw processes, and launch installed external tools. Windows users can double-click `start-trajectory-portal.bat` at the repository root, or run:

```powershell
.\scripts\start-trajectory-portal.ps1
```

Linux / macOS:

```bash
./scripts/start-trajectory-portal.sh
```

The Portal binds only to `127.0.0.1`, reads `harbor-jobs` by default, and never uploads trajectories.

## 7. Freeze and extend

After each Task change:

1. run `python scripts/sync_grading.py` when scoring logic changed;
2. run `harbor sync .\examples\harbor-office-tasks` to refresh the dataset digest;
3. run the cross-platform validator and pytest;
4. start Docker and run `.\scripts\validate-harbor.ps1 -Docker` (or `./scripts/validate-harbor.sh --docker` on Linux / macOS), then smoke-test with a known Agent;
5. record sources, modifications, and licenses; and
6. commit Tasks, manifests, and documentation, never credential-bearing Job logs.

`harbor-jobs/` is runtime output, not a dataset. Archive it separately when comparing across machines.
