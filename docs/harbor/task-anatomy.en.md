# Anatomy of an Office Harbor Task

[中文](task-anatomy.md) | English

Using `office-ticket-weekly-dashboard-L3-053` as the example, a Task has four parts.

## 1. `instruction.md`: the business request

Write for an office worker and specify:

- the business role and goal;
- which local files to read;
- definitions, exception handling, and prohibitions;
- output filename, sheets, or sections;
- where charts belong; and
- what human-style review is required before finishing.

Do not prescribe an algorithm. A forecast Task can ask for three months, a reasonable range, and historical validation without requiring office users to know ARIMA or exponential smoothing. The Agent may choose a method, but must explain the basis and satisfy the same scoring rules.

## 2. `environment/`: the Agent’s computer

Unpacking `workspace.tar.gz` creates `/workspace/input/` and an empty `/workspace/output/`. The Dockerfile installs the tools and Python packages required by the Task, such as `openpyxl`, `pandas`, `python-docx`, `python-pptx`, `pypdf`, and `PyYAML`. Task images do not preinstall Codex, Claude Code, or another concrete Agent; Harbor adapters own Agent selection and installation.

Prompts should not promise packages on the host. If the verifier or Agent needs a package, pin it in the Dockerfile. The current image also installs LibreOffice Calc so the verifier can recalculate Excel formulas in a temporary copy.

## 3. `tests/`: the post-run verifier

```text
Harbor → tests/test.sh → tests/grading/score.py → eval_core.py
                                      ↘ gold/gold_answer.json
```

- `test.sh` is the real entry point; Harbor does not infer that it should run pytest after seeing `result.xlsx`.
- The Trial calls `score.py` explicitly, while repository CI uses pytest to test the verifier itself.
- `score.py` orchestrates output discovery, gold loading, checks, and score aggregation.
- `eval_core.py` contains reusable checks for cells, sheets, charts, and Word structure.
- `gold_answer.json` stores expected business keys, values, tolerances, required fields, and rule parameters. It is not a reference deliverable. These teaching gold files are public; a blind production set must keep its gold hidden.

If pytest is used later, call it explicitly from `test.sh`, for example `pytest -q /tests`. Triggering depends on the script, not on whether an output file exists.

## 4. `task.toml`: runtime boundaries

Declare a stable name, version, tags, Agent/Verifier timeouts, and CPU, memory, storage, and network limits. The current examples use `public` for compatibility with the Windows Docker provider that enables `DOCKER_INSECURE_NO_IPTABLES_RAW`; instructions still require local input only and deterministic verifiers do not access the network. A production environment with network policies should use an Agent allowlist and a network-disabled verifier.

`dataset.toml` stores a digest of Task content. Run `harbor sync <dataset-directory>` after changing packaged files.

## Positive and negative checks

Office scoring should not only check that a sheet exists. Combine:

- positive checks for required sheets, fields, key values, charts, or sections;
- negative checks for duplicate counts, overwritten inputs, unmatched records disguised as zero, or missing confirmation items; and
- usability checks for reopening, formula results, provenance, and chart references.

Design negative checks around likely mistakes with clear business consequences. Fixed weights, gates, formula recalculation, and the prompt/verifier mapping are covered in [`scoring-design.md`](scoring-design.en.md). The step-by-step weekly report is in [`ticket-weekly-case-study.md`](ticket-weekly-case-study.en.md).
