# Sources and license notices

[中文](NOTICE.md) | English

This repository contains original indexes and documentation as well as example Tasks adapted from public third-party projects. The repository’s own code and documentation use the Apache-2.0 license in `LICENSE`; material marked third-party or adapted does not become Apache-2.0. Public download does not waive the upstream license—follow each source’s terms when using, modifying, or redistributing it.

## Original HTTP example

`examples/harbor-http-tasks`, `examples/http-reconciliation-service.py`, and the HTTP adapter are original code with synthetic data under Apache-2.0. They do not include data from the WorkBuddy-derived Tasks below.

## Local Office-file examples

| Repository Task | Source | Treatment |
| --- | --- | --- |
| `office-fee-data-cleaning-L3-051` | Tencent WorkBuddy Bench `fund-product-table-normalize-L3-017` | Rewritten as a lightweight local-file prompt and native Harbor scoring Task |
| `office-procurement-reconcile-L3-052` | Tencent WorkBuddy Bench `procurement-reconcile-L3-015` | Rewritten as a local procurement reconciliation scenario |
| `office-ticket-weekly-dashboard-L3-053` | Tencent WorkBuddy Bench `ticket-weekly-L3-010` | Prompt, input packaging, and deterministic verifier rewritten |
| `office-channel-anomaly-analysis-L4-054` | Tencent WorkBuddy Bench `channel-period-compare-L4-017` | Expanded into channel settlement and payment anomaly analysis |
| `office-demand-forecast-L4-055` | Original synthetic Task in this repository | New 36-month history, forecast target, and scoring rules |
| `office-governance-summary-L4-056` | Tencent WorkBuddy Bench `board-material-update-timeline-excel` | Rewritten as a cross-XLSX/PPTX management-summary Task |

Source: <https://github.com/Tencent/workbuddy-bench>. Its license is not a general MIT or Apache-2.0 license and includes regional restrictions. The full text is kept in [`third_party/workbuddy-bench/LICENSE`](third_party/workbuddy-bench/LICENSE) and copied to each adapted Task as `LICENSE.workbuddy-bench`; each Task’s `NOTICE.md` describes modifications. These changes do not imply Tencent endorsement.

Beyond Office scenarios, WorkBuddy Bench also provides Code, Web, and other Task examples. Users may consult its task organization, environment packaging, and verifier design. Learning from these design approaches does not grant permission to redistribute specific Tasks, data, or other materials; copying, adapting, or redistributing them remains subject to the upstream license, with source, version, and modification notices retained.

Other benchmarks listed in the [Office benchmark index](docs/office-benchmarks.en.md) are links and catalog entries only; their datasets are not copied here. New Tasks or attachments must add source, version, modifications, and license copies before merge.
