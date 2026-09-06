# Harbor Office Task examples

[中文](README.md) | English

This is a lightweight Office Agent teaching set in [Harbor](https://github.com/harbor-framework/harbor) Task/Dataset format. It demonstrates Tasks, Datasets, fixed-weight scoring, and trajectories; it is not a complete coverage claim for AI Business Evals. All six Tasks use local files inside the container.

The repository passes Harbor 0.22.0 configuration parsing, cross-platform static checks, and positive/negative regressions for all six types. A real Trial still needs a working Docker daemon and credentials for the selected Agent; the repository does not claim that every model has run all six.

## Six examples

| Task directory | Business goal | Input | Deliverable | Main capability |
| --- | --- | --- | --- | --- |
| `office-fee-data-cleaning-L3-051` | Clean product and fee materials | PDF, XLSX, JSON, Markdown | `output/result.xlsx` | Field normalization, cross-checking, provenance |
| `office-procurement-reconcile-L3-052` | Reconcile purchase orders and receipts | XLSX, CSV | `output/result.xlsx` | Matching, difference classification, anomaly summary |
| `office-ticket-weekly-dashboard-L3-053` | Weekly customer-support report | XLSX | `output/result.xlsx` | Calendar-week aggregation, metrics, charts |
| `office-channel-anomaly-analysis-L4-054` | Channel settlement and payment anomalies | Multiple XLSX files | `output/result.xlsx` | Deduplication, period comparison, explanation |
| `office-demand-forecast-L4-055` | Monthly demand forecast and backtest | JSON | `output/result.xlsx` | Time-series checks, forecast, backtest, business notes |
| `office-governance-summary-L4-056` | Project-governance management summary | XLSX, PPTX | `output/result.docx` | Cross-file synthesis, conflict detection, executive writing |

L3 means a complete single-item office workflow; L4 requires cross-source synthesis or more complex judgment. Difficulty is relative within this teaching set, not a universal Office scale. The 051–056 numbers are consecutive example IDs, not a claim that 50 formal Tasks preceded them or that the list is complete.

## Suggested learning order

1. `office-ticket-weekly-dashboard-L3-053`: the full input → instruction → deliverable → scoring loop and Excel chart checks.
2. `office-procurement-reconcile-L3-052`: business-key joins, complete result sets, duplicates, omissions, and difference classes.
3. `office-fee-data-cleaning-L3-051`: multiple formats, normalized fields/types, and row-level provenance.
4. `office-governance-summary-L4-056`: combine XLSX and PPTX into DOCX while preserving item/status/date/source links and conflicts.
5. `office-channel-anomaly-analysis-L4-054`: full-data deduplication, period comparison, anomaly detection, and negative tests against sampling.
6. `office-demand-forecast-L4-055`: algorithm-agnostic forecasting checked by historical validation, error calculations, and data-driven ranges.

Start with one complete Task, then compare the other Tasks’ `instruction.md`, `tests/gold/gold_answer.json`, and `tests/grading/eval_core.py`. To check a Harbor installation, run the first Task before all six.

## Directory structure

```text
task-directory/
├─ task.toml                   # timeouts, resources, metadata
├─ instruction.md              # the only business request sent to the Agent
├─ environment/
│  ├─ Dockerfile               # reproducible tools and Python packages
│  ├─ docker-compose.yaml
│  └─ workspace.tar.gz         # unpacked to /workspace with input/ and empty output/
└─ tests/
   ├─ test.sh                  # Harbor’s post-Agent scoring entry point
   ├─ gold/gold_answer.json    # expected values and rule parameters
   └─ grading/
      ├─ eval_core.py          # fixed weights, keys, formula checks
      └─ score.py              # reward and component evidence
```

Only the archive’s `input/` contains input files and `output/` starts empty. No reference deliverable is stored in the dataset, but teaching gold is public, so these Tasks are for development and chain validation rather than strict blind testing. The verifier writes the total to `/logs/verifier/reward.txt` and components to `score.json`.

The root `grading/` is the source of truth; Task copies keep the files self-contained. Run `python scripts/sync_grading.py` after changing shared scoring. See [scoring design](../../docs/harbor/scoring-design.en.md).

## First run

Requirements: Docker, Harbor, and credentials for the selected Agent.

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
harbor run `
  -p .\examples\harbor-office-tasks `
  -a codex -m gpt-5.6-luna --ak reasoning_effort=medium `
  -k 1 -n 1 --artifact /workspace/output -o .\harbor-jobs
```

Replace both `-a` and `-m` when your local Agent/model differs. The helper scripts also require explicit values:

```powershell
.\scripts\run-office-cases.ps1 -Agent codex -Model gpt-5.6-luna -ReasoningEffort medium
```

Linux / macOS:

```bash
./scripts/run-office-cases.sh --agent codex --model gpt-5.6-luna --reasoning-effort medium
```

Run one example by pointing `-p` at its directory:

```powershell
harbor run `
  -p .\examples\harbor-office-tasks\office-ticket-weekly-dashboard-L3-053 `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  --artifact /workspace/output `
  -o .\harbor-jobs
```

Task images do not preinstall Codex; the Harbor adapter installs the selected Agent. Keep credentials on the host and follow the adapter documentation. If this host genuinely uses Codex login-file authentication and requires `CODEX_FORCE_AUTH_JSON=1`, set it manually on the host. Do not pass the value `1` through `--ae`, because Harbor's sensitive-value redaction may then corrupt trajectory text.

If the built-in installer cannot reach `raw.githubusercontent.com`, use the repository's npm-based adapter:

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1' # only when this host really uses login-file authentication
.\scripts\run-office-cases.ps1 `
  -Agent harbor_agents.codex_npm:CodexNpm `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -AgentKwarg version=0.153.2
```

It only replaces CLI installation; execution, authentication, and trajectory conversion still use Harbor's Codex implementation. The script makes the project-local adapter importable. See the [workflow](../../docs/harbor/workflow.en.md) for the equivalent Linux / macOS command.

The examples use `public` stages for compatibility with the Windows Docker provider; policy-capable production deployments should use an Agent allowlist and a network-disabled verifier. Prompts and verifiers still use only local inputs.

## Result layout

```text
harbor-jobs/<job-name>/
├─ config.json
└─ <trial>/
   ├─ result.json
   ├─ artifacts/workspace/output/ # Excel/Word deliverable from --artifact
   ├─ agent/
   │  ├─ trajectory.json       # standard ATIF process
   │  ├─ codex.txt             # Agent log (name varies by Agent)
   │  └─ sessions/             # native Agent sessions
   └─ verifier/
      ├─ reward.txt            # total score
      ├─ score.json            # component scores and failure reasons
      └─ test_output.txt
```

Use `harbor view .\harbor-jobs` for a quick view. Detailed run, extension, and trajectory guidance is in [Task creation](../../docs/harbor/creating-task.en.md), [workflow](../../docs/harbor/workflow.en.md), [scoring](../../docs/harbor/scoring-design.en.md), and [trajectory comparison](../../docs/harbor/trajectory-comparison.en.md).

## Sources and licenses

Five Tasks adapt synthetic material from Tencent WorkBuddy Bench; the forecast Task is original. See the root [NOTICE](../../NOTICE.en.md) for mapping. Adapted content follows the upstream license and regional restrictions; each Task carries its modification note and license copy. Repository code and documentation use Apache-2.0, which does not override third-party terms.
