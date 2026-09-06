# Harbor Results Explorer

[中文](README.md) | English

This is a local-only Harbor result and process analysis tool. It reads `harbor-jobs`, presents Job overview, single-Trial review, and two-Trial differences on separate pages, and provides controlled launchers for Harbor Viewer, RLViz, and AgentViz.

## Start

Windows:

Double-click `start-trajectory-portal.bat` at the repository root. Keep the command window open while using the Portal; closing it stops the service. You can also run:

```powershell
.\scripts\start-trajectory-portal.ps1
```

Linux / macOS:

```bash
./scripts/start-trajectory-portal.sh
```

The default root is `harbor-jobs` and the URL is `http://127.0.0.1:8765`. To use another directory:

```powershell
.\scripts\start-trajectory-portal.ps1 -Root D:\evals\harbor-jobs -Port 8877
```

The server binds only to `127.0.0.1` and never uploads results. The folder picker requires Python Tk support; if it is unavailable, enter the path manually.

## Pages and capabilities

- **Run overview** (`/overview`): summarize Jobs, models, datasets, Task coverage, reasoning effort, completion, mean scores, and exceptions; open details or comparison from a run.
- **Trial details** (`/trial`): review scores, the complete process, artifacts, external tools, raw logs, and metadata; supports both single-step Harbor results and `steps/<name>/...` multi-step results.
- **Trial comparison** (`/compare`): choose one Task, then 2–4 Trials from Jobs that ran it.
- Check Harbor `task_checksum` and warn when Task definition or input differs.
- Compare component `score.json` entries and failure evidence.
- Align tool calls within a step, associate each call with its own observation, and mark argument or result differences.
- Preview or download saved artifacts and inspect Agent logs and metadata.
- Detect and safely launch Harbor Viewer, RLViz, and AgentViz.

The process comparison is structured evidence, not a semantic claim about the first meaningful divergence. Use scores and final deliverables to decide whether a difference caused a business problem.

The Portal writes Job, Trial, and Task context into the URL. Refreshing or sharing a link therefore restores the same view without uploading the underlying data.

## Language

Use the `EN` / `中文` pill in the upper-right corner of the header. The choice is stored in the browser and also follows an English browser locale on first visit. It changes page labels, statuses, dates, number formats, tool hints, and accessibility labels; source content inside logs, JSON, code, and artifacts is intentionally preserved.

## External tools

- **Harbor Viewer** is launched through the installed Harbor command.
- If **RLViz** is missing, the Portal shows “Install and launch”. After confirmation it runs `npm install --global rlviz --no-audit --no-fund`, then opens the current Job.
- **AgentViz** does not require a global install. The first launch runs `npx --yes agentviz` for the selected Trial trajectory. Multi-step Trials require choosing a concrete step first.
- RLViz and AgentViz require Node.js, npm, and npx. If any is missing, install Node.js LTS and click Refresh; the Portal never installs Node.js automatically.

## Frontend development

The frontend uses React, TypeScript, Ant Design, and Apache ECharts. Built files are committed so normal users do not need Node.js:

```bash
cd tools/trajectory-portal
npm install
npm test
npm run build
```

During development, run the Python API and Vite separately:

```bash
python server.py --root ../../harbor-jobs --no-open
npm run dev
```

Commit both `src/` and `dist/` after a frontend change.

## Security boundaries

- The service listens only on `127.0.0.1`.
- State-changing APIs require same-origin `application/json` requests.
- External processes are limited to Harbor Viewer, RLViz, and AgentViz.
- Job and Trial paths must remain inside the selected root.
- The page does not read Codex credential files or upload trajectories.
- Review redaction and authorization before letting RLViz or AgentViz process, export, or share data.
