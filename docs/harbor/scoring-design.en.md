# Scoring design for the six examples

[中文](scoring-design.md) | English

These six Tasks teach how to build Harbor Office Tasks; they are not hidden tests. Inputs, gold data, and verifiers are public, which is useful for learning, debugging, and validating the evaluation chain but weakens anti-cheating protection. Do not publish a formal leaderboard from these six Tasks alone.

## Fixed denominator and gates

Each Task has a fixed table in `grading/eval_core.py`. Non-gate weights sum to 1.0 and do not change when a check returns early.

The gates are:

- the deliverable exists;
- the corresponding parser can open it;
- an XLSX contains every required sheet.

If a gate fails, reward is 0. After gates pass, business checks contribute their fixed weights. `score.json` records `passed`, `detail`, `weight`, and `gate` for every check.

## Prompt-to-verifier mapping

| Example | Main requirement | Deterministic checks | Typical negative fixture |
| --- | --- | --- | --- |
| Data cleaning | Standard fields, 27 valid fees, risk mapping, anomalies, and provenance | Complete product/fee/risk keys, types, values, dates, and row-level sources | Keeping only a few correct fee rows fails |
| Procurement reconciliation | Aggregate receipts by order and classify quantity/amount differences | Complete keys across four detail sets, uniqueness, totals, and representative amounts/quantities | Duplicating orders to reach the row count fails |
| Weekly ticket report | Aggregate four Monday–Sunday weeks and create two Excel charts | Week, dates, record count, plan, resolved, and rate associated row by row; native chart objects and references | Correct numbers scattered in arbitrary cells fail |
| Channel anomalies | Deduplicate, exclude invalid quarters, compare all channel metrics, list 39 anomalies | All 160 metrics, complete anomaly keys, differences/ratios, evidence, and confirmation fields | Six sampled values or one anomaly fails |
| Demand forecast | No prescribed algorithm, but fixed historical validation and uncertainty explanation | 36 months, three fixed validation months, error formula, MAPE ceiling, data-driven bounds, and native chart | An arbitrary 0–5000 interval fails |
| Governance summary | Prefer latest register, separate conflicts, constrain owners and inferences | ID/status/date/source on one row, explicit conflicts, and old draft values marked as old | Keyword dumping in one paragraph fails |

## Formula checks

`openpyxl(data_only=False)` sees formula text but does not calculate it. The verifier therefore installs LibreOffice Calc:

1. scan formulas for explicit errors and obvious division by zero;
2. copy the deliverable to a temporary directory;
3. recalculate and save with LibreOffice headless;
4. read cached values and reject `#REF!`, `#DIV/0!`, `#VALUE!`, and similar errors.

The original file is never overwritten. A formula that cannot be recalculated fails its check rather than passing by default.

## Positive and negative regression

`tests/test_grading_regression.py` dynamically builds six compliant oracle deliverables and at least one adversarial error for each Task type:

```powershell
python -m pytest -q
```

Fixtures test the verifiers only and are not placed in `workspace.tar.gz`. Keep regression tests synchronized whenever prompts, gold data, or scoring logic change.

## Shared implementation and Task copies

Harbor packages each Task independently, so each copy still includes `tests/grading/eval_core.py` and `score.py`. The repository maintains `grading/` as the source of truth:

```powershell
python scripts/sync_grading.py
python scripts/sync_grading.py --check
```

The cross-platform checker rejects stale copies. This keeps Tasks self-contained without maintaining six divergent implementations.
