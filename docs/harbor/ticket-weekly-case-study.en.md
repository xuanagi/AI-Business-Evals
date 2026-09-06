# Complete example: weekly customer-support report

[中文](ticket-weekly-case-study.md) | English

This page follows `office-ticket-weekly-dashboard-L3-053` through one complete chain. It is not a recipe for gaming a model; it shows dataset authors what each file does.

## Business task

After reading `instruction.md`, the Agent reads `/workspace/input/customer_ticket_records.xlsx`, aggregates planned tickets, resolved tickets, and completion rate for weeks 15–18 (Monday–Sunday), and writes `/workspace/output/result.xlsx` with:

- `Weekly Summary`: four weekly rows, totals, and two charts;
- `Data Quality`: input row count and missing/anomalous records; and
- `Processing Notes`: week and calculation definitions plus chart notes.

Charts are native XLSX objects so the recipient can continue reviewing and editing in Excel; the verifier checks chart objects and series references.

## Before the Agent starts

Harbor reads `task.toml` and creates a Trial with 2 CPUs, 4096 MB memory, and 30-minute Agent/Verifier timeouts. The image unpacks `workspace.tar.gz` into `/workspace`.

At this point the Agent can see the instruction and `/workspace/input/`, but not the host dataset directory or verifier tests. `/workspace/output/` is empty.

## During execution

A reasonable, non-mandatory process is:

1. list inputs and confirm there is one workbook;
2. inspect sheets, columns, date types, missing values, and row count;
3. state the Monday–Sunday definition and compute four weekly metrics;
4. reconcile weekly totals with the full input;
5. create the three required sheets;
6. add the metric table, totals, column chart, and completion-rate chart;
7. store rates as numbers with percentage formatting; and
8. save `result.xlsx`, reopen it, and confirm sheets and charts remain.

The prompt specifies goals and constraints, not pandas, openpyxl, or a particular algorithm. The evaluation is therefore about completing the work, not reproducing one implementation.

## Reading `gold_answer.json`

| Field | Meaning |
| --- | --- |
| `case_id` | Stable task identifier for logs and traceability |
| `case_type` | Selects the weekly-report scorer in shared `eval_core.py` |
| `output_contract.path` | Required absolute path inside the container |
| `output_contract.type` | Deliverable type: XLSX |
| `required_sheets` | The three mandatory sheets |
| `total_input_rows` | 560 input rows, used for the data-quality meaning check |
| `weekly_summary` | Expected week, dates, counts, plan, resolved, and rate |
| `totals` | Four-week plan 37,870 and resolved 28,645 |

The gold file does not contain a complete `result.xlsx` and does not prescribe colors, fonts, or cell addresses. The verifier identifies columns by headers and associates fields by week; correct numbers scattered elsewhere do not score.

## Scoring after the Agent exits

Only after the Agent exits does Harbor call `tests/test.sh`. The script explicitly runs `score.py`, which calls the weekly-report checks in `eval_core.py`. Checks include:

1. output exists and opens as XLSX;
2. all three sheets exist;
3. rows 15–18 have correct dates, counts, plan, resolved, and rate;
4. totals recomputed from those rows are correct;
5. Data Quality states 560 rows, duplicate handling, and Monday–Sunday semantics;
6. at least two titled native charts reference `Weekly Summary` data;
7. helper data after column H is hidden when present;
8. completion rates are numeric percentages; and
9. formulas recalculate without errors in LibreOffice.

The first three are gates and any failure gives reward 0. Other checks use fixed weights and are written to `score.json`; regression tests also reject a sheet containing only magic numbers without week-level associations.

## After a Trial

Review three kinds of evidence together:

- `verifier/reward.txt` and `score.json` for correctness;
- the downloaded `result.xlsx` for human usability; and
- `agent/trajectory.json` for the process and the first meaningful difference.

If models differ, start with `score.json`. For example, a `weekly_charts` failure could mean missing charts, a wrong range, or no reopen-and-verify step; the final message alone cannot tell you which.
