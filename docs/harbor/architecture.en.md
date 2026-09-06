# Harbor’s role in AI Business Evals

[中文](architecture.md) | English

Harbor is the evaluation executor, not the business task and not the AI system under test. AI Business Evals defines what to do, which inputs to provide, and how to decide whether the result is correct; Harbor turns those definitions into isolated, repeatable, comparable trials.

The directory and file flow below uses an Office Agent Task as its example. HTTP applications, algorithms, and workflows use the same Task, Job, and Trial structure; their adapter invokes the implementation and records its response and call log.

## Five core objects

| Object | Meaning | Location in this repository |
| --- | --- | --- |
| Task | A complete task: instruction, input environment, and verifier | `examples/harbor-office-tasks/<task>/` |
| Dataset | A set of Tasks and their fixed manifest | `dataset.toml` |
| Job | One evaluation configuration, such as one model running six Tasks | `harbor-jobs/<job-name>/` by default |
| Trial | One Agent/model/Task/repetition combination | A Trial directory under a Job |
| Outcome / Trajectory | Outcome is the result and score; Trajectory is the process | `result.json`, `verifier/`, and `agent/` under a Trial |

## Data flow for one run

```text
dataset.toml selects Tasks
        ↓
Harbor builds the Task Docker environment
        ↓
workspace.tar.gz is unpacked into /workspace
        ↓
The Agent sees instruction.md and workspace files
        ↓
The Agent writes result.xlsx or result.docx in /workspace/output/
        ↓
Harbor calls tests/test.sh
        ↓
score.py reads the deliverable and gold_answer.json
        ↓
reward.txt + score.json + trajectory.json are written to the Trial
```

The Agent should not see `tests/`, and the verifier need not depend on the Agent implementation. A model may use Python, a shell, or a GUI; if the final file meets the contract, the same deterministic rules score it. This deliverable-first boundary is especially useful for Office work.

The six directories are public teaching examples and include their gold data. Harbor still isolates `tests/` from the Agent workspace, but a model that knows the repository could memorize public answers. They demonstrate an execution chain and process comparison, not a hidden-test benchmark.

## Why save both outcome and process?

The total score can rank runs but cannot explain equal scores. Two models scoring 0.7 might differ because one calculated correctly but produced a bad chart, while the other had the right structure but missed exceptions. `score.json` supplies component outcomes; `trajectory.json` shows where the model misunderstood, read the wrong file, or skipped verification.

Review evidence in this order:

1. `reward.txt`: is there an overall gap?
2. `score.json`: which business dimension explains it?
3. The deliverable: can a person open and continue editing it?
4. `trajectory.json`: which decision or tool call started the difference?

## Relationship to WorkBuddy Bench

The dataset uses Harbor-native Task/Dataset conventions and does not import `workbuddy_bench` at runtime. WorkBuddy Bench is one source of business themes and synthetic inputs for some examples, not an execution dependency. Other public benchmarks and original Office Tasks can use the same structure.
