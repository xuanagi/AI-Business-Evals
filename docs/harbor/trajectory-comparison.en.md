# Comparing trajectories across models

[中文](trajectory-comparison.md) | English

Harbor stores more than a score. When an Agent adapter supports it, each Trial contains a standard ATIF trajectory and the Agent’s native session, allowing you to ask where and why two models began to differ.

## Tool roles

| Tool | Use | Best stage |
| --- | --- | --- |
| `harbor view` | Browse Jobs, scores, logs, and one trajectory | Daily checks |
| [RLViz](https://github.com/TheSnakeFang/rlviz) | Align Harbor trajectories and locate the first meaningful branch | Formal multi-model analysis |
| [AgentViz](https://github.com/jayparikh/agentviz) | Review trajectories side by side, filter steps, and export HTML | Reports and manual review |

Use RLViz as the general comparison layer because it reads Harbor Jobs and ATIF directly. AgentViz is a convenient presentation supplement. The repository [Harbor Results Explorer](../../tools/trajectory-portal/README.en.md) adds a local UI for Job filtering, single-Trial review, raw process comparison, and controlled tool launching.

Windows users can double-click `start-trajectory-portal.bat` at the repository root, or run:

```powershell
.\scripts\start-trajectory-portal.ps1
```

Linux / macOS:

```bash
./scripts/start-trajectory-portal.sh
```

The Portal has separate overview, Trial, and comparison pages. It can mark the first raw divergence in tool name, arguments, or results, but “first meaningful divergence” remains a business judgment that should use scores, deliverables, RLViz, or manual stage review.

In Trial comparison, choose a Task first and then choose Trials that ran it. Matching Task names are not sufficient: the Portal also checks Harbor's `task_checksum`. Scores, artifacts, and trajectories are directly comparable only when both the name and checksum match. To understand one run before comparing it, open Trial details from the overview and then use “Compare with another Trial”.

## Find trajectories

```powershell
Get-ChildItem .\harbor-jobs -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object Name, LastWriteTime

Get-ChildItem .\harbor-jobs\<job-name> -Recurse -Filter trajectory.json |
  Select-Object FullName
```

The standard path is:

```text
harbor-jobs/<job-name>/<trial-name>/agent/trajectory.json
```

The same Trial stores `result.json`, verifier evidence in `verifier/score.json`, and downloaded Office deliverables under `artifacts/workspace/output/` when `--artifact /workspace/output` is used.

## Harbor Viewer

```powershell
harbor view .\harbor-jobs --jobs
```

Harbor chooses an available port from 8080–8089 and prints the local URL. Select Job, Task, and Trial to inspect messages, tool calls, logs, reward, and trajectory. This is ideal for one run and quick completeness checks.

To choose a fixed port:

```powershell
harbor view .\harbor-jobs --jobs --port 8090
```

## RLViz

Before sending a Job to a third-party tool, Harbor Hub, an HTML exporter, or a colleague, copy it and review redaction. Trajectories, native sessions, logs, artifacts, and scores may expose inputs, filenames, usernames, prompts, model responses, environment fragments, business data, or hidden gold. Do not upload real customer data to a public service. At minimum remove secrets, personal data, customer identifiers, internal paths, and unauthorized attachments before public sharing.

```powershell
npm install --global rlviz
rlviz formats
rlviz inspect .\harbor-jobs\<job-name>
rlviz open .\harbor-jobs\<job-name>
```

RLViz reads a complete Harbor Job, combines Trials, trajectories, rewards, token/cost data, failures, and artifacts, and provides alignment plus first-meaningful-divergence views. For two models, keep separate Jobs, filter to the same Task and model, add matching Trials to Compare, and inspect the first branch and subsequent calls.

Local viewing does not modify the original Job. Sending it to a remote service or sharing exported HTML is still data transmission and requires the same redaction and authorization review.

To inspect one trajectory:

```powershell
rlviz open .\harbor-jobs\<job-name>\<trial-name>\agent\trajectory.json
```

## AgentViz

```powershell
npx agentviz .\harbor-jobs\<job-name>\<trial-name>\agent\trajectory.json
```

Review, Investigate, Analyze, and Compare views are useful for manual playback and HTML reports. RLViz remains preferable for aligning multiple Jobs.

## A valid comparison

1. Use the same dataset, Task version, and resource limits.
2. Repeat each model at least three times.
3. Use `score.json` to identify the concrete dimension that differs.
4. Align the corresponding Trials in RLViz.
5. Find the first behavior change that affects later results, not merely the last message.
6. Return to the deliverable and confirm that the branch caused a business error.

For Office work, annotate stages such as:

```text
Discover inputs → Inspect structure → Clean / calculate → Create deliverable → Reopen and verify
```

For a failed weekly chart, distinguish a missed source-date check, an incorrect week definition, a chart-range error, and failure to reopen and verify.
