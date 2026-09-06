# Harbor Office Task 示例

中文 | [English](README.en.md)

这是一个符合 [Harbor](https://github.com/harbor-framework/harbor) Task/Dataset 格式的轻量 Office Agent 教学集合。用于演示 Task、Dataset、固定权重评分和 trajectory 流程，不代表 AI Business Evals 所支持业务场景的完整覆盖。六个任务均只处理容器内的本地文件。

当前仓库已经通过 Harbor 0.22.0 配置解析、跨平台静态校验及六类正负评分回归。真正的 trial 还要求本机 Docker daemon 正常运行，并配置所选 Agent 的模型凭据；仓库不宣称每个模型都已在六题上跑通。

## 六个示例

| 任务目录 | 办公目标 | 输入 | 交付物 | 主要能力 |
| --- | --- | --- | --- | --- |
| `office-fee-data-cleaning-L3-051` | 清洗产品与费率资料 | PDF、XLSX、JSON、Markdown | `output/result.xlsx` | 字段标准化、交叉核对、来源追溯 |
| `office-procurement-reconcile-L3-052` | 采购订单与入库对账 | XLSX、CSV | `output/result.xlsx` | 匹配、差异分类、异常汇总 |
| `office-ticket-weekly-dashboard-L3-053` | 客服工单周报 | XLSX | `output/result.xlsx` | 自然周汇总、指标计算、图表 |
| `office-channel-anomaly-analysis-L4-054` | 渠道结算与回款异常分析 | 多份 XLSX | `output/result.xlsx` | 去重、跨期比较、异常解释 |
| `office-demand-forecast-L4-055` | 月度需求预测与历史验证 | JSON | `output/result.xlsx` | 时序检查、预测、回测、业务说明 |
| `office-governance-summary-L4-056` | 项目治理管理摘要 | XLSX、PPTX | `output/result.docx` | 跨文件整合、冲突识别、管理写作 |

这里的 L3 表示完整的单项办公流程，L4 表示需要跨来源整合或作出更复杂判断。难度只是本示例集合内部的相对标记，不是对所有 Office 能力的统一分级。051–056 是为这组六个教学示例预留的连续编号，不表示仓库此前已经存在 50 道正式题，也不表示覆盖顺序或完整度。

## 建议学习顺序

任务编号是示例编号，不是推荐学习次序。第一次学习 Harbor Office Task 时，建议按下面的顺序阅读和运行：

| 顺序 | 示例 | 重点学习内容 |
| ---: | --- | --- |
| 1 | `office-ticket-weekly-dashboard-L3-053` | 从输入文件、`instruction.md`、Agent 交付物到自动评分的完整闭环；同时理解 Excel 指标和图表检查 |
| 2 | `office-procurement-reconcile-L3-052` | 使用业务主键匹配多份数据，检查结果集合是否完整，并识别重复、遗漏和差异分类错误 |
| 3 | `office-fee-data-cleaning-L3-051` | 读取多种文件格式，统一字段和数据类型，并为每条结果保留可追溯来源 |
| 4 | `office-governance-summary-L4-056` | 把 XLSX 与 PPTX 信息整合成 DOCX，并检查事项、状态、日期、来源和冲突是否正确关联 |
| 5 | `office-channel-anomaly-analysis-L4-054` | 对全量数据做去重、跨期比较和异常识别，理解如何用负向测试防止只做少量抽查 |
| 6 | `office-demand-forecast-L4-055` | 在不限定具体算法的情况下，通过固定历史验证、误差计算和合理区间检查评估预测结果 |

建议先完整学习第 1 个任务，再横向比较后续任务的 `instruction.md`、`tests/gold/gold_answer.json` 和 `tests/grading/eval_core.py`。只想验证 Harbor 是否安装正确时，也应优先试跑第 1 个任务，不必一开始运行全部六个任务。

## 目录结构说明

每个任务都是一个独立 Harbor task：

```text
任务目录/
├─ task.toml                   # 超时、资源和任务元数据
├─ instruction.md              # Agent 唯一收到的业务要求
├─ environment/
│  ├─ Dockerfile               # 可复现的工具与 Python 包环境
│  ├─ docker-compose.yaml
│  └─ workspace.tar.gz         # 启动时解压到 /workspace；其中含 input/ 和空 output/
└─ tests/
   ├─ test.sh                  # Agent 结束后由 Harbor 调用的评分入口
   ├─ gold/gold_answer.json    # 评分所需的期望值和规则参数
   └─ grading/
      ├─ eval_core.py          # 固定权重、业务主键、公式重算等检查
      └─ score.py              # 写出 reward 和逐项证据
```

输入文件只放在压缩包的 `input/` 中，`output/` 初始为空。数据集中不保存参考成品，但教学用 gold 是公开的，因此只能用于开发和链路验证，不能当作严格盲测。评分器读取 Agent 生成的文件，将总分写到 `/logs/verifier/reward.txt`，并把分项结果写到 `score.json`。

根目录 `grading/` 是评分器的唯一维护源；任务内的两个 Python 文件是为了让每个 Harbor Task 能独立打包。修改公共评分器后运行 `python scripts/sync_grading.py`。完整评分设计见 [六个示例的评分设计](../../docs/harbor/scoring-design.md)。

## 第一次运行

要求：Docker 正常运行，已安装 Harbor，Agent 对应的密钥或登录信息已经配置。

在本仓库根目录执行：

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
harbor run `
  -p .\examples\harbor-office-tasks `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  -k 1 `
  -n 1 `
  --artifact /workspace/output `
  -o .\harbor-jobs
```

这只是 Codex 的命令示例。如果本机实际可用的 Agent 或模型不同，请同时替换 `-a` 和 `-m`。`-k 1` 表示每个任务尝试一次，`-n 1` 表示一次只运行一个 trial。仓库脚本不再默认任何 Agent、模型或认证方式，必须显式传入：

```powershell
.\scripts\run-office-cases.ps1 -Agent codex -Model gpt-5.6-luna -ReasoningEffort medium
```

Linux / macOS 在仓库根目录运行：

```bash
./scripts/run-office-cases.sh \
  --agent codex \
  --model gpt-5.6-luna \
  --reasoning-effort medium
```

只跑一个示例：

```powershell
harbor run `
  -p .\examples\harbor-office-tasks\office-ticket-weekly-dashboard-L3-053 `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  --artifact /workspace/output `
  -o .\harbor-jobs
```

任务镜像不预装 Codex；Harbor adapter 会为所选 Agent 执行安装。若你确实使用 Codex 且本机认证方式要求 `CODEX_FORCE_AUTH_JSON=1`，请在宿主机手动设置，不要由数据集脚本替你决定认证方式，也不要通过 `--ae` 传递值 `1`，否则 Harbor 的敏感信息脱敏可能污染 trajectory。

如果容器不能访问 Harbor 内置 Codex 安装流程所需的 `raw.githubusercontent.com`，可使用仓库内的 npm 安装适配器：

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1' # 仅限本机确实使用 Codex 登录文件认证时
.\scripts\run-office-cases.ps1 `
  -Agent harbor_agents.codex_npm:CodexNpm `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -AgentKwarg version=0.153.2
```

它只覆盖 CLI 安装步骤，执行、认证和 trajectory 转换仍使用 Harbor 的 Codex 实现；`run-office-cases.ps1` 会自动让 Harbor 找到仓库内的 adapter。

当前示例的所有阶段均使用 `public`，以兼容启用了 `DOCKER_INSECURE_NO_IPTABLES_RAW` 的 Windows Docker provider；这类 provider 无法执行 Harbor 的阶段级断网或白名单切换。所有业务指令都要求只使用任务提供的本地文件，评分器也不包含网络访问。若部署到支持网络策略的正式评测环境，建议把 Agent 收紧为 `allowlist`、Verifier 收紧为 `no-network`。

## 结果结构

任务目录保持只读式的基准定义；每次运行产生的结果写入 `harbor-jobs/<job-name>/`：

```text
harbor-jobs/<job-name>/
├─ config.json
└─ <trial>/
   ├─ result.json
   ├─ artifacts/workspace/output/ # 使用 --artifact 保存的 Excel/Word 成品
   ├─ agent/
   │  ├─ trajectory.json       # 标准 ATIF 过程轨迹
   │  ├─ codex.txt             # Agent 日志（Agent 不同时名称会变化）
   │  └─ sessions/             # Agent 的原生会话记录
   └─ verifier/
      ├─ reward.txt            # 总分
      ├─ score.json            # 分项得分和失败原因
      └─ test_output.txt
```

快速查看整个 job：

```powershell
harbor view .\harbor-jobs
```

完整的运行、扩展和轨迹对比方法见 [新建 Task](../../docs/harbor/creating-task.md)、[Harbor 使用流程](../../docs/harbor/workflow.md)、[评分设计](../../docs/harbor/scoring-design.md) 与 [轨迹比较](../../docs/harbor/trajectory-comparison.md)。

## 来源与许可

五个任务由 Tencent WorkBuddy Bench 的合成任务改编，一个预测任务为本仓库原创。具体映射见仓库根目录的 [NOTICE.md](../../NOTICE.md)。改编内容适用上游许可及其地域限制；每个改编任务都携带任务级修改说明和上游许可副本。仓库原创代码与文档适用根目录 Apache-2.0，但不会覆盖第三方条款。
