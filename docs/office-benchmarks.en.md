# Public Office / workplace Agent benchmark index

[中文](office-benchmarks.md) | English

This index keeps public benchmarks for Office and cross-application Agents so teams can choose an evaluation direction and design Tasks. See the [repository home](../README.en.md) for the project position, runnable examples, and customization path. Listing a project does not mean it is wired into this repository; obtain data from the source, configure its environment, and check its license before use.

Navigation: [scope](#scope) · [catalog](#catalog) · [task distributions](#task-distributions-and-boundaries) · [not included](#known-projects-not-included) · [community](#community-projects) · [selection guide](#selection-guide)

## Scope

The index focuses on public Office / workplace Agent benchmarks. This is the index’s inclusion scope, not a limit on the business scenarios that can be customized in this repository.

Information was last checked on 2026-09-04. Counts, availability, and licenses can change; always re-check the official page before use.

Included projects make their instructions viewable or downloadable, evaluate an Agent that takes actions and completes work, expose enough input/environment/reference/scoring information to reproduce or integrate, and state task distribution, languages, and licenses separately. Public download does not automatically grant redistribution rights.

Status: 🟢 **open and reproducible** means tasks, inputs, evaluation, and an open license are clear; 🟡 **public tasks with restrictions** means data licensing, non-commercial terms, or third-party source materials require extra review.

## Catalog

### Office files and cross-application workflows

| Benchmark | Public size and distribution | Applications / deliverables | Language | Evaluation and status |
| --- | --- | --- | --- | --- |
| [OmegaUse-OfficeVal](https://omegause-officeval.github.io/) | 100: education 25, business operations 20, other 18, academic papers 14, engineering 10, administration 9, finance 4 | DOCX, XLSX, PPTX, PDF, images, audio, and video | Chinese + English parallel tasks | Deterministic artifact verifier + bilingual rubric; 🟢 Apache-2.0 |
| [DocOps](https://docopsbench.github.io/) | 210: L1 atomic 50, L2 same-document composition 40, L3 single-document workflows 60, L4 cross-document workflows 60 | Word, Excel, PowerPoint, PDF | English | Deterministic file-level verifier; 🟢 Apache-2.0 |
| [Workspace-Bench 1.0](https://workspace-bench.github.io/) | 388: operations 123, logistics 115, research 67, backend 43, product 40; easy 53, medium 206, hard 129 | Large workspaces with 74 file types | English + Chinese counterparts | Result/process data and basic rubrics; 🟢 MIT, data on Hugging Face |
| [OfficeBench](https://arxiv.org/abs/2407.19056) | 300: single-app 93, two-app 95, three-app 112 | Word, Excel, PDF, Email, Calendar, OCR | English | Exact/fuzzy/execution checks on final application state; 🟢 Apache-2.0 |
| [OdysseyBench](https://arxiv.org/abs/2508.09124) | 602: OfficeBench-Plus 300 and Neo 302 (60/71/171 single/two/three-app) | Word, Excel, PDF, Email, Calendar with multi-day history | English | Final-state checks with cross-day interaction history; 🟢 MIT plus Apache-derived content |
| [ClawMark](https://claw-mark.com/) | 100 tasks, generally one to three simulated workdays | Files, Email, Calendar, Notion, Sheets, PDF, tables, media | English | 1,537 deterministic Python checkers; 🟡 CC BY-NC 4.0, non-commercial |
| [BankerToolBench](https://arxiv.org/abs/2604.11304) | 100: M&A 62, LevFin 19, ECM 10, DCM 6, mixed 3 | Investment-banking workflows with Excel, PowerPoint, Word, PDF | English | About 150 expert rubrics and formula/artifact checks; 🟢 Apache-2.0 code, CC BY 4.0 data |
| [ClawsBench](https://clawsbench.benchflow.ai/) | 44: single service 30, cross-service 14; 24 safety-critical | Gmail, Slack, Google Calendar, Docs, Drive mocks | English | Final database state plus success and unsafe-behavior reports; 🟡 CC BY-NC-SA 4.0 |

### Spreadsheet Agents

| Benchmark | Public size | Agent task | Evaluation and status |
| --- | --- | --- | --- |
| [SpreadsheetBench](https://arxiv.org/abs/2406.14991) | 912 forum requests and 2,729 test workbooks; cell- and sheet-level | Generate and execute code that modifies workbooks | Online-Judge-style generalization across changed workbooks; 🟢 CC BY-SA 4.0 |
| [SpreadsheetBench 2](https://spreadsheetbench.github.io/) | 321: debugging 100, financial models 100, templates 97, visualization 24 | End-to-end work on real workbooks averaging 11.8 sheets | Deterministic checks for first three groups, VLM checklist for visual quality; 🟡 licenses differ |
| [WTM-Bench](https://github.com/microsoft/WTM-Bench) | 150 formal tasks in the repository; about 2,977 workbooks in the full data | Restore a workbook after formulas, charts, pivots, or formatting are removed | Cell-level and structural artifact checks; 🟢 MIT |
| [SheetCopilot](https://sheetcopilot.github.io/) | 221 tasks across 28 workbooks | Iteratively control Excel through atomic actions | Action success, execution correctness, and final state; 🟡 GPL-3.0 code and research/non-commercial note |

### Presentation Agents

| Benchmark | Public size | Agent task | Evaluation and status |
| --- | --- | --- | --- |
| [PPTC](https://arxiv.org/abs/2311.01767) | 279 multi-turn sessions: create 229, edit long templates 50 | Use 49 PowerPoint APIs to produce the next PPTX | PPTX-Match object/property/spatial checks with turn and session accuracy; 🟢 MIT |
| [PPT-Eval](https://microsoft.github.io/ppteval/) | 120: 12 source decks × 10; easy 51, medium 39, hard 30 | Create and edit decks in PowerPoint Online or a CLI | Rubric + VLM and collateral-damage checks; 🟢 MIT, source decks keep their own licenses |
| [PPTArena](https://arxiv.org/abs/2512.03042) | 100 public fixed edit pairs; paper discusses 800+ operations | Local edits to real PPTX while preserving unrelated content | Structural diff + VLM judge; 🟡 repository has no declared license |
| [DECKBench](https://arxiv.org/abs/2602.13318) | 294 paper–slide pairs: full deck generation and up to five edit rounds | Create academic decks and respond to simulated multi-turn edits | Reference-free/reference-based metrics, layout heuristics, and improvement rate; 🟡 MIT code, original media not redistributed |

### Broader workplace and computer-use benchmarks

These are not Office-only, but cover many office, personal-assistant, or professional-delivery tasks and are useful cross-application complements.

| Benchmark | Public size and distribution | Relation to Office | Language / status |
| --- | --- | --- | --- |
| [WorkBench](https://arxiv.org/abs/2405.00823) | 690 = 69 templates × 10: analytics 120, calendar 110, CRM 80, email 90, project management 80, cross-domain 210 | 26 read/write tools change five sandbox databases | English; 🟢 MIT |
| [MCPMark](https://arxiv.org/abs/2509.24002) | 127: Filesystem 30, Notion 28, Playwright 25, GitHub 23, PostgreSQL 21 | Long CRUD chains through MCP; Notion and files are closest to office collaboration | English; 🟢 Apache-2.0 with public initial states and verifiers |
| [Toolathlon](https://toolathlon.xyz/) | 108 across seven domains, 32 apps, and 604 tools | Long chains across Calendar, Notion, Email, Excel, Sheets, PDF, cloud, and business systems | English; 49 tasks also have Chinese text; 🟡 no root license |
| [MyPCBench](https://mypcbench.com/) | 184; 68% multi-application | 17 logged-in apps plus full LibreOffice desktop | English; 🟢 MIT, tasks/rubrics/VM public |
| [OSWorld v1](https://arxiv.org/abs/2404.07972) | 369; Calc 47, Impress 47, Writer 23 (117 direct Office tasks), plus 101 multi-app | Pixel-level GUI Agent in a real desktop and LibreOffice | English; 🟢 Apache-2.0; only public v1 is indexed |
| [GDPval public set](https://huggingface.co/datasets/openai/gdpval) | 220 = 44 professions × 5 across nine industries; full 1,320 not public | Expert knowledge work producing docs, tables, slides, charts, and media | English; 🟡 public subset has no explicit license on the data page |

## Task distributions and boundaries

### OmegaUse-OfficeVal

100 tasks cover education/exams 25, business operations 20, other 18, academic papers 14, engineering 10, administration 9, and finance 4. Each represents about 2.32 hours of human work and ends with an openable, editable Office artifact. Chinese and English instructions plus bilingual rubrics are provided. Prompts, inputs, references, and verifier are available from the [Hugging Face dataset](https://huggingface.co/datasets/baidu-frontier-research/OmegaUse-OfficeVal).

### DocOps

L1 tests one local operation, L2 combines edits within a document, L3 completes a single-document workflow, and L4 integrates multiple documents. Word, Excel, PowerPoint, and PDF internals and final artifacts are checked directly. Public tasks are English.

### Workspace-Bench 1.0

Roles are operations manager 123, logistics manager 115, researcher 67, backend developer 43, and product manager 40. Difficulty is easy 53, medium 206, hard 129. Agents explore up to roughly 20 GB and 20,476 files, track provenance, read multiple inputs, and create output. The data provides corresponding `task_clean_en` and `task_clean_cn` versions.

### OfficeBench and OdysseyBench

OfficeBench (Wang et al., 2024) has 93 single-app, 95 two-app, and 112 three-app tasks across Word, Excel, PDF, Email, Calendar, and OCR. OdysseyBench adds multi-day email, calendar, and file history: OfficeBench-Plus 300 plus Neo 302, with Neo weighted toward three-app tasks. Both are English; the former emphasizes basic cross-app execution, the latter memory and state recovery.

### ClawMark

The 100 tasks are distributed across Research Assistant 15, Content Operation 12, HR 11, E-commerce 9, Journalist 8, Product Manager 8, Executive Assistant 7, Insurance 7, Investment Analyst 6, Legal Assistant 6, Real Estate 6, Clinical Assistant 4, and EDA 1. State changes between stages force the Agent to re-check email, calendar, and files. CC BY-NC 4.0 makes it unsuitable as a freely commercial data source.

### BankerToolBench

The 100 tasks also break down into Financial Modeling & Scenario Analysis 37, Valuation & Pricing Analysis 30, Client & Marketing Materials 27, Market Analysis & Investor Engagement 3, Process & Timeline Management 2, and Aftermarket Performance Trading 1. This is among the most specialized Office Agent sets: average human time is about five hours and the longest task 21 hours. Fine-grained expert rubrics cover all tasks, while golden outputs cover only some.

### Choosing among spreadsheet sets

- **SpreadsheetBench** tests robust spreadsheet manipulation across changed workbooks.
- **SheetCopilot** is an action-space and planning baseline for formulas, formatting, charts, pivots, and sheet management.
- **WTM-Bench** precisely checks structural and cell changes while restoring removed artifacts.
- **SpreadsheetBench 2** moves to large multi-sheet, end-to-end workflows; finance and debugging are 200 of 321 tasks.

### PPTArena public edit-pair distribution

The current public `evaluation_pairs_refined.json` has 100 fixed pairs (not the paper’s 800+ operation count): Text & Typography 29, Charts 10, Images & Pictures 10, Theme & Background 9, Alignment/Distribution/Z-order 8, Slide/Section Management & Footers 8, Tables 8, Shapes & Drawing 4, SmartArt & Diagrams 4, Slide Layout & Placeholders 3, Accessibility & Semantics 2, Slide Transitions 1, Hyperlinks & Action Settings 1, Template & Master-Level Edits 1, Audio & Video 1, and Object Animations 1.

### OSWorld v1 Office subset

Do not count all 369 OSWorld tasks as Office. The clearest Office subset is Calc 47, Impress 47, and Writer 23, totaling 117; some of the 101 multi-app tasks also invoke LibreOffice. Its distinctive value is real GUI interaction and resettable VMs, not Office-file structural scoring.

## Known projects not included

The following have research value but do not expose a complete official task package, so they are not in the open catalog:

| Project | Reason not included | Language / known distribution |
| --- | --- | --- |
| [WPS OfficeBench](https://officebench.wps.cn/) | Reports 7,489 examples, 12 datasets, and 39 capabilities, but formal examples are mostly or entirely private | Chinese 60%, English 30%, mixed 10%; nine core scenarios |
| [FORTE](https://github.com/AGI-Eval-Official/FORTE) | Paper has 180 tasks across 15 professions; repository exposes only one demo per profession | English; market, sales, finance, legal, development, operations, HR, product, administration, etc. |
| [OfficeEval / NCRE](https://arxiv.org/abs/2606.10956) | Paper reports 200 Word/Excel/PowerPoint tasks and 7,118 criteria, but no official task/environment download was found | Mainly Chinese, based on China’s computer-grade Office exam |
| [BlueFin](https://github.com/Longitude-Labs/bluefin) | 131-task paper benchmark, but release has only 11 and holds out 120 | English; Synthesis 10, Manipulation 82, Interrogation 39 |
| [WorkstreamBench](https://arxiv.org/abs/2605.22664) | Complete benchmark and leaderboard tasks are not all public; ModelOff subset has 38 with mixed source licenses | English; finance, research, presentations, multi-file workflows |
| OSWorld v2 | Requires controlled access; this index lists only public v1 | English; general desktop applications |

Pure document QA, spreadsheet QA, chart QA, classification, OCR, and aesthetic-only scoring of existing files are also excluded because they do not require the Agent to complete an executable office task.

## Community projects

[Cowork Bench](https://github.com/0717376/cowork_bench) is a newer community benchmark without a peer-reviewed paper. It publishes 496 end-to-end tasks where Agents combine four to seven tools, query local mock databases, create Excel/Word/PPTX, update calendars, and send email. Tasks and system prompts are in **Russian**, focused on Russian Railways, Moscow Exchange, 1C HR, e-commerce, and LMS. Deterministic file and SQL side-effect checks are used and the repository is Apache-2.0.

## Selection guide

| Goal | Suggested starting point |
| --- | --- |
| Chinese Office Agent | OmegaUse-OfficeVal, Chinese Workspace-Bench; use WPS OfficeBench only as an external leaderboard reference |
| General Word / Excel / PPT artifacts | OmegaUse-OfficeVal, DocOps |
| Large folders and cross-file dependencies | Workspace-Bench |
| Cross-app email, calendar, and memory | OdysseyBench, ClawMark, ClawsBench, WorkBench |
| Google Workspace capability and safety | ClawsBench, with MCPMark as a general MCP supplement |
| Large-scale MCP and tool orchestration | Toolathlon; Cowork Bench for Russian Office scenarios |
| Real GUI / CUA | OSWorld v1 Office subset, PPT-Eval, MyPCBench |
| Excel local operations and code generation | SpreadsheetBench, SheetCopilot |
| Excel end-to-end workflows | SpreadsheetBench 2, WTM-Bench |
| PowerPoint API and multi-turn state | PPTC |
| PowerPoint GUI and artifact editing | PPT-Eval, PPTArena |
| Deck generation from long text with iteration | DECKBench |
| Specialized multi-file business delivery | BankerToolBench; GDPval public set as a broader professional supplement |

## Contribute a benchmark

Open an issue or pull request with at least:

- official paper, project, code, and data links;
- the **actually public** task count, not only the paper total;
- task distribution, languages, target applications, and output formats;
- Agent action and scoring method;
- separate licenses for code, tasks, and input media; and
- one concrete example proving the tasks are not pure QA.
