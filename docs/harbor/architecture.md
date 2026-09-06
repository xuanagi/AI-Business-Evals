# Harbor 在 AI Business Evals 中的角色

中文 | [English](architecture.en.md)

Harbor 是评测执行器，不是具体业务任务本身，也不是被测 AI 系统。AI Business Evals 负责定义“做什么、提供什么输入、怎样判断做对了”；Harbor 负责把这些定义变成隔离、可重复、可比较的试验。

下文以 Office Agent Task 展示目录和文件层的数据流；HTTP 应用、算法或工作流同样复用 Task、Job 和 Trial 结构，只是由适配器完成调用并保存响应与调用记录。

## 五个核心对象

| 对象 | 含义 | 在本仓库中的位置 |
| --- | --- | --- |
| Task | 一道完整任务：指令、输入环境和评分器 | `examples/harbor-office-tasks/<任务>/` |
| Dataset | 一组 Task 及其固定摘要 | `dataset.toml` |
| Job | 一次评测配置，例如一个模型跑六题 | 默认写入 `harbor-jobs/<job-name>/` |
| Trial | 某个 Agent、模型、任务和重复次数的单次组合 | Job 下的一个 trial 目录 |
| Outcome / Trajectory | Outcome 是结果与分数；Trajectory 是完成过程 | trial 的 `result.json`、`verifier/` 与 `agent/` |

## 一次运行的数据流

```text
dataset.toml 选择任务
        ↓
Harbor 构建任务 Docker 环境
        ↓
workspace.tar.gz 解压到 /workspace
        ↓
Agent 只看到 instruction.md 和工作区文件
        ↓
Agent 在 /workspace/output/ 生成 result.xlsx 或 result.docx
        ↓
Harbor 调用 tests/test.sh
        ↓
score.py 读取交付物和 gold_answer.json
        ↓
reward.txt + score.json + trajectory.json 写入 trial 目录
```

Agent 不应看到 `tests/`，评分器也不需要依赖 Agent 的实现方式。一个模型可以用 Python、命令行或 GUI；只要最终文件满足要求，就由同一组确定性规则评分。这种“交付物优先”的边界很适合 Office 场景。

本仓库的六个目录是公开教学示例，gold 也在仓库中。Harbor 运行时仍会把 `tests/` 与 Agent 工作区隔离，但了解仓库内容的模型理论上可能记住公开答案。因此它们适合验证执行链路和比较过程，不等价于带隐藏测试集的正式 benchmark。

## 为什么同时保存 outcome 和 process

只看总分能够排名，但不能解释差异。例如两个模型都得到 0.7 分，可能分别是“计算正确但图表错误”和“结构正确但遗漏异常”。`score.json` 给出分项 outcome，`trajectory.json` 则回答模型在第几步理解偏差、是否读错文件、是否验证了成品。

因此建议比较时依次看：

1. `reward.txt`：是否存在总体差距；
2. `score.json`：差距属于哪个业务维度；
3. 交付物：文件是否可打开、结构是否适合人工继续编辑；
4. `trajectory.json`：差异是从哪个决策或工具调用开始的。

## 与 WorkBuddy Bench 的关系

本数据集采用 Harbor 原生 Task/Dataset 约定，运行时不导入 `workbuddy_bench`。WorkBuddy Bench 在这里是部分业务题材与合成输入的来源之一，不是执行依赖。后续也可以按同样结构接入其他公开 benchmark 或原创 Office 任务。
