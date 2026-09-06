# AI Business Evals

> 面向 AI 系统的业务结果评测底座

中文 | [English](README.en.md)

本项目提供一套**面向 AI 系统、以业务结果为验收标准的评测方法与示例底座**，帮助团队将真实业务需求转化为可重复执行、可验证结果、可分析失败原因的评测任务。

被测对象既可以是直接完成工作的 AI Agent，也可以是通过 HTTP 接入的应用、算法或工作流。项目复用 Harbor 管理评测执行，具体业务决定输入数据与验收规则：适配器负责“怎样调用”，验收器负责“是否做对”。

当前提供六个 Office Agent Task 和一个 HTTP 对账 Task 作为参考示例，另有独立的 [Office / workplace 公开基准索引](docs/office-benchmarks.md)。用户可以据此理解完整流程，再根据自己的业务场景改造。

[快速开始](#快速开始) · [定制业务场景](#如何定制业务场景) · [当前边界](#当前边界) · [文档导航](#文档导航)

## 背景

随着 AI 模型不断涌现、能力持续迭代，算法、应用和 Agent 的开发门槛正在降低，更多业务需求能够快速转化为可运行的方案。模型选择和技术实现日益丰富，也让业务面临的挑战从“能不能做出来”，进一步扩展为“应该选择哪种方案、是否做对了、能否稳定使用、升级后是否仍然可靠”。

能够运行不等于满足业务要求，单次成功也不代表持续可靠。不同技术方案需要依据业务标准进行验收，版本变化需要回归验证，异常和高风险场景需要有针对性的检查。因此，**可重复、贴近真实业务、具有可复核证据的评测，成为业务可靠交付与持续运行的重要保障。**

## 项目价值

1. **验证业务方案是否真的可用**

   将对账、数据清洗、周报等业务需求转化为输入、交付要求和可执行的验收规则。不只看回答是否合理、文件是否生成或接口是否返回成功，还要检查结果是否完整、计算是否正确、异常是否被正确处理，为上线验收提供依据。

2. **比较不同实现与版本**

   在一致的业务输入、验收标准和受控运行条件下，比较不同方案的结果质量，并支持版本升级后的回归验证。HTTP 对账示例提供 HTTP 服务和本地参考实现（oracle）两种执行方式，由同一个验收器（verifier）检查结果，演示如何让不同实现共用业务标准。

3. **降低定制业务评测的起步成本**

   提供任务结构、执行适配、输入封装、参考结果、评分正反例和结果分析工具。用户主要定制业务输入、调用方式和验收规则，不必从头建设执行与审阅流程；场景的特殊要求可以直接在对应 Task 和适配器中改造。

对于 Agent，还可以结合分项评分、交付物和运行轨迹进行模型选型与过程定位。当业务流程逐步成熟后，经授权、筛选的成功轨迹、失败修正样本和偏好对，可用于蒸馏与后训练，将适合固化的业务能力沉淀到面向特定业务的小型专用模型（specialized small models）。持续使用贴近目标业务分布的独立评测集，验证这些模型的能力、版本回归与适用边界，为大模型与专用模型的分工提供依据。

## 工作流程与职责分工

```text
定义业务输入与验收标准 → 通过 Harbor 执行 → 验收业务结果 → 查看证据与比较版本
```

- **Harbor**：管理任务执行、环境和 Job / Trial 运行记录。
- **本项目**：提供可改造的场景示例、HTTP 执行适配器、评分示例和结果分析工具。
- **业务方**：定义输入与验收标准，按需改造环境、接口映射和业务检查。

HTTP 是接入不同实现的手段，不是评分标准。适配器调用被测对象并保存输出，Task 的 verifier 独立判断业务是否做对；远端服务内部如何实现不必与评测端相同。

## 快速开始

先选择一条参考路径，两者都复用 Harbor，不需要另建 Runner。HTTP 接入已按 Harbor 0.22.0 / Python 3.12 验证；完整环境和命令见对应运行说明。

| 路径 | 准备条件 | 运行入口与预期结果 |
| --- | --- | --- |
| HTTP 应用 / 算法 | Python、uv、已启动的 Docker；本地教学服务无需模型账号 | 按 [HTTP 快速开始](docs/harbor/http-evaluation.md) 启动服务并运行 HTTP / oracle 两种实现；预期都通过同一个 verifier，得到响应 JSON、调用记录和分项评分 |
| Office Agent | 已安装 Harbor、已启动的 Docker、所选 Agent 的认证信息 | 按 [Office 运行流程](docs/harbor/workflow.md#4-运行一个或多个模型) 执行六个示例；得到 Office 交付物、分项评分和可用的运行轨迹，具体成绩取决于被测 Agent |

对应任务分别位于 [HTTP 示例](examples/harbor-http-tasks) 和 [Office 示例](examples/harbor-office-tasks)。接入自己的 HTTP 服务时，认证和依赖由该服务决定；“无需模型账号”仅指本地教学示例。

### 查看结果

默认运行记录保存在 `harbor-jobs`。Windows 用户可双击 [start-trajectory-portal.bat](start-trajectory-portal.bat)，或运行：

```powershell
.\scripts\start-trajectory-portal.ps1
```

Linux / macOS：

```bash
./scripts/start-trajectory-portal.sh
```

[Portal](tools/trajectory-portal) 提供运行概览、单个 Trial 审阅、多 Trial 结果比较与双 Trial 深度对比，可选择 2–4 个 Trial，并连接 Harbor Viewer、RLViz 和 AgentViz。HTTP 示例可查看响应与调用日志，不会生成模型对话轨迹。

### Portal 界面示例

<p align="center">
  <img src="images/1.png" alt="Harbor Results Explorer 的运行概览：筛选器、任务及模型稳定性概览" width="49%" />
  <img src="images/2.png" alt="Harbor Results Explorer 的 Trial 详情：分项评分与交付结果" width="49%" />
</p>

## 如何定制业务场景

从最接近的示例复制一个 Task，先写清楚“什么结果可以通过、什么错误必须失败”，再改三处：

1. **输入与环境**：替换业务数据，准备所需工具或测试状态，明确输入分布和运行条件。
2. **执行适配**：选择已有 Agent，或修改 HTTP 接口地址与请求／响应映射。
3. **业务验收**：编写检查规则，同时补充应通过的结果和典型错误结果，验证验收器本身。

先跑通一个完整任务，再扩充案例并比较版本。Office 场景参考 [任务创建指南](docs/harbor/creating-task.md)；HTTP 场景参考 [接口接入与定制](docs/harbor/http-evaluation.md#接入自己的业务改三处)。不需要先设计通用业务协议或复杂插件体系。

## 当前边界

- **示例不是正式 benchmark**：六个 Office Task 和一个 HTTP Task 均为公开教学示例，不代表完整业务覆盖；现有评分器不能直接作为其他场景的通用验收器。
- **HTTP 适配保持轻量**：当前提供同步 JSON POST 请求与响应的参考实现；异步任务、特殊认证和有状态流程需要按场景改造。
- **可比性需要控制条件**：跨实现比较需统一业务输出口径，明确耗时与成本的测量边界；远端服务的状态复位、隔离及依赖不由本地 Harbor 环境自动保证。
- **业务可靠性需要代表性测试**：应覆盖常见、异常及高风险情况，Agent 场景还应考虑操作类型及比例；选型和版本验收需区分开发任务与隐藏测试任务。
- **评测不能替代生产保障**：离线通过不等于真实业务收益，也不替代权限控制、运行监控和故障恢复，仍需结合实际试点验证。

## 文档导航

| 目的 | 文档 |
| --- | --- |
| 理解 Harbor 对象与执行结构 | [Task、Dataset、Job、Trial、结果与轨迹](docs/harbor/architecture.md) |
| 创建和运行 Office 任务 | [任务创建](docs/harbor/creating-task.md) · [运行流程](docs/harbor/workflow.md) · [客服周报案例](docs/harbor/ticket-weekly-case-study.md) |
| 接入 HTTP 应用或算法 | [运行与定制](docs/harbor/http-evaluation.md) · [适配器说明](harbor_agents/README.md) |
| 设计和检查评分规则 | [Office 评分设计与正负回归](docs/harbor/scoring-design.md) |
| 审阅结果与定位过程差异 | [Portal 使用](tools/trajectory-portal) · [Agent 轨迹比较方法](docs/harbor/trajectory-comparison.md) |
| 查阅公开 Office 基准 | [完整基准索引](docs/office-benchmarks.md) · [按目标选择](docs/office-benchmarks.md#选择建议) |

基准索引中的任务分布、开放状态、来源和许可说明独立维护；收录范围仍是 Office / workplace Agent，不是项目可定制场景的边界。收录的外部基准不等于已接入本仓库的可运行示例。

## 许可

自有代码与文档适用 [Apache-2.0](LICENSE)。Office 改编示例与 HTTP 原创示例的来源及许可边界见 [NOTICE.md](NOTICE.md)；公开可下载不等于可以自由再分发。
