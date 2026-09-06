# Create an Office Task from scratch

[中文](creating-task.md) | English

This guide uses `office-sales-monthly-summary-l3-057`. Run commands from the repository root; it follows the Harbor 0.22.0 setup verified by this project. Keep the directory name, the final part of `task.name`, `metadata.source_case`, and the gold `case_id` lowercase and identical so Linux does not fail on case differences.

## 1. Define acceptance first

Before writing scoring code, answer five questions:

1. What work must the office worker complete?
2. Which local files will the Agent receive?
3. Is the deliverable XLSX, DOCX, PPTX, or PDF?
4. Which facts must be correct?
5. Which likely errors must fail, such as double counting, overwriting input, inventing missing values, or creating an uneditable image?

If these answers are unclear, the Task will not be stable to score.

## 2. Choose a creation method

### Method A: copy the closest Task (recommended)

```powershell
$source = '.\examples\harbor-office-tasks\office-ticket-weekly-dashboard-L3-053'
$target = '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057'
Copy-Item -LiteralPath $source -Destination $target -Recurse
```

Replace the instruction, input archive, gold data, scoring logic, and identity in `task.toml`; changing only the directory name is not enough.

### Method B: ask Harbor for an empty skeleton

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor init agentic-office-evals/office-sales-monthly-summary-l3-057 `
  --task --output-dir .\examples\harbor-office-tasks `
  --no-pytest --no-solution --include-standard-metadata `
  --description 'Summarize monthly sales data and create a reviewable Excel report'
```

Harbor creates the Task directory, `task.toml`, `instruction.md`, `environment/Dockerfile`, and `tests/test.sh`. This repository uses the lightweight deterministic `test.sh → score.py` path, hence `--no-pytest`. A public registry release should maintain a trustworthy `solution/solve.sh` and audit its license.

## 3. Write `instruction.md`

Use language an office worker understands. State:

- role and business goal;
- input paths, such as `input/sales_detail.xlsx`;
- date, amount, deduplication, and other definitions;
- what to do with missing, conflicting, or unknowable content;
- output path, such as `output/result.xlsx`;
- required sheets, fields, charts, or sections; and
- a final reopen-and-review step.

Describe the outcome, not an algorithm. Ask for a three-month forecast with historical validation, not a specific model family.

## 4. Build the input archive

After extraction the archive must contain `/workspace/input/` and an empty `/workspace/output/`:

```powershell
$staging = Join-Path $env:TEMP 'office-sales-monthly-summary-l3-057-workspace'
New-Item -ItemType Directory -Path "$staging\input" -Force
New-Item -ItemType Directory -Path "$staging\output" -Force
Copy-Item -LiteralPath 'D:\source-data\sales_detail.xlsx' -Destination "$staging\input\sales_detail.xlsx"

tar -czf '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057\environment\workspace.tar.gz' `
  -C $staging .
tar -tf '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057\environment\workspace.tar.gz'
```

Do not include reference deliverables, model outputs, keys, customer PII, or solving scripts. Prefer synthetic or de-identified data.

## 5. Define the Docker environment

Edit `environment/Dockerfile` to:

- set `WORKDIR /workspace`;
- unpack `workspace.tar.gz` there;
- install the packages the Task actually needs;
- pin the base image by SHA-256 digest and direct dependencies by exact version;
- keep specific Agents out of the image (the Harbor adapter installs them);
- install LibreOffice Calc when XLSX formula results need recalculation; and
- create an empty `/workspace/output`.

The Agent can discover installed packages with `python -m pip list` or an import attempt. The Dockerfile, not a host promise, defines available capabilities.

## 6. Write gold data and the verifier

Store machine-checkable business facts in `tests/gold/gold_answer.json`:

```json
{
  "case_id": "office-sales-monthly-summary-l3-057",
  "case_type": "monthly_summary",
  "output_contract": {"path": "/workspace/output/result.xlsx", "type": "xlsx"},
  "required_sheets": ["Monthly Summary", "Data Quality", "Processing Notes"],
  "totals": {"sales": 1250000.0}
}
```

Implement:

- `tests/grading/eval_core.py` for file and business checks;
- `tests/grading/score.py` to aggregate checks and write `/logs/verifier/reward.txt` and `score.json`; and
- `tests/test.sh` as Harbor’s explicit entry point.

Check positive requirements and high-risk negative errors. Layout can be flexible, but amounts, aggregates, business keys, field relationships, chart references, and editability should be deterministic. A missing/unreadable file or required sheet is a hard gate; remaining checks use fixed weights and never shrink the denominator after an early return. Do not search the whole file for a few magic numbers.

Add one compliant oracle fixture and at least one adversarial fixture under the root `tests/`. If reusing the shared scorer, edit `grading/` first and run `python scripts/sync_grading.py`; do not hand-edit six copies.

## 7. Update `task.toml`

Check at least:

- `schema_version = "1.4"`;
- a unique lowercase `[task].name`;
- matching version, description, and keywords;
- sufficient Agent and verifier timeouts;
- sensible CPU, memory, storage, and network settings; and
- `[metadata]` with source, modifications, difficulty, and capability labels.

The current Windows-compatible examples use `public` because their Docker provider enables `DOCKER_INSECURE_NO_IPTABLES_RAW`. A policy-capable production environment should use an Agent allowlist and a network-disabled verifier. Keep verifiers free of network access.

## 8. Add the Task and refresh its digest

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor add .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 `
  --to .\examples\harbor-office-tasks
harbor sync .\examples\harbor-office-tasks
```

Run `harbor sync` after any packaged Task file changes. `Updated` means the manifest changed; an unchanged Task should be `Skipped`.

## 9. Validate and smoke-test

Start with static validation on Windows:

```powershell
.\scripts\validate-harbor.ps1
harbor run --print-config `
  -p .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 -a nop
```

On Linux / macOS, use the equivalent cross-platform entry point:

```bash
./scripts/validate-harbor.sh

harbor run --print-config \
  -p ./examples/harbor-office-tasks/office-sales-monthly-summary-l3-057 \
  -a nop
```

Then start Docker and run one real Agent:

```powershell
harbor run `
  -p .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 `
  -a codex -m gpt-5.6-luna --ak reasoning_effort=medium `
  --artifact /workspace/output --job-name office-sales-monthly-summary-smoke -o .\harbor-jobs
```

Inspect reward, component `score.json`, the actual Office file, and the trajectory—not just the process exit code.

If the model uses a self-hosted or proxy endpoint, the current `public` Agent stage does not need an additional hostname entry. Authentication belongs to the selected Harbor Agent adapter; Tasks and shared scripts must not silently set one Agent's credential variables. Use `allowlist` and `--allow-agent-host` only when the selected environment provider actually supports stage-level network policies.

A project-local adapter can be referenced by Python import path, for example `harbor_agents.codex_npm:CodexNpm`. The run scripts add the repository root to `PYTHONPATH`. Such an adapter should only handle runtime differences; it must not preinstall a specific Agent into the Task image, which would undermine cross-Agent comparability.

## 10. Pre-commit checklist

- the archive contains no answers, secrets, or old outputs;
- instruction paths exactly match archive paths;
- output paths exactly match gold;
- a compliant file scores highly, while missing/corrupt files and sheets score 0;
- each business requirement and high-risk error has a check and a fixture;
- `harbor sync` updated the manifest digest;
- source, modifications, and licenses are documented; and
- `harbor-jobs/` is not committed.
