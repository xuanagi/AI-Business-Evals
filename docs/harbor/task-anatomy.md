# 一个 Office Harbor Task 怎样组成

中文 | [English](task-anatomy.en.md)

以 `office-ticket-weekly-dashboard-L3-053` 为例，一道题由四部分组成。

## 1. `instruction.md`：给 Agent 的业务需求

这份文件应使用办公室工作者能理解的语言，说明：

- 业务身份和目标；
- 要读取哪些本地文件；
- 口径、异常处理和禁止事项；
- 输出文件名、工作表或章节；
- 图表放在哪个交付物中；
- 完成前应做哪些人工式复核。

它不需要指定算法。比如预测任务只要求“给出三个月预测、合理范围和历史验证”，不要求办公室用户知道 ARIMA 或指数平滑。模型可以自行选择方法，但必须解释口径并接受统一评分。

## 2. `environment/`：Agent 真正工作的电脑

`workspace.tar.gz` 解压后形成 `/workspace/input/` 和空的 `/workspace/output/`。Dockerfile 安装执行任务所需的工具和 Python 包，因此 Agent 可以用 `python -m pip list` 或实际导入来发现 `openpyxl`、`pandas`、`python-docx`、`python-pptx`、`pypdf`、`PyYAML` 等能力。任务镜像不预装 Codex、Claude Code 等具体 Agent；选择和安装 Agent 是 Harbor adapter 的职责。

提示词不应承诺宿主机有什么包；可用能力由 Dockerfile 决定。新增任务时，如果评分器或 Agent 必须使用某个包，就应把它写入 Dockerfile 并固定精确版本。当前镜像还安装 LibreOffice Calc，供 verifier 在临时副本上重新计算 Excel 公式。

## 3. `tests/`：Agent 完成之后的隐藏评分器

执行顺序是：

```text
Harbor → tests/test.sh → tests/grading/score.py → eval_core.py
                                      ↘ gold/gold_answer.json
```

- `test.sh` 是真正入口；Harbor 不会看到 `result.xlsx` 后自动猜测要跑 pytest。
- trial 中的 `test.sh` 明确调用 `score.py`，所以 Harbor 评分阶段不启动 pytest；仓库 CI 另用 pytest 检查评分器本身。
- `score.py` 是任务编排层，负责定位输出文件、读取 gold、调用检查函数并汇总分数。
- `eval_core.py` 提供可复用的单元格、工作表、图表、Word 结构等检查能力。
- `gold_answer.json` 不是参考成品，而是评分器使用的期望业务键、数值、容差、必需字段和规则参数。这里的教学示例公开 gold；正式盲测数据集不应把测试集 gold 暴露给被测 Agent。

如果以后采用 pytest，也必须由 `test.sh` 显式执行，例如 `pytest -q /tests`。是否自动触发与输出文件是否存在无关。

## 4. `task.toml`：运行边界

它声明稳定的任务名、版本、标签、Agent/Verifier 超时，以及 CPU、内存、存储、网络等限制。当前示例为兼容启用了 `DOCKER_INSECURE_NO_IPTABLES_RAW` 的 Windows Docker provider，所有阶段均使用 `public`；任务指令要求 Agent 只使用本地输入，评分器本身也不访问网络。网络隔离能力更强的正式评测环境应把 Agent 配置为白名单、Verifier 配置为断网。

`dataset.toml` 中保存任务内容摘要；任务文件变化后要运行 `harbor sync <数据集目录>` 更新摘要。

## 正向与负向检查

Office 评分不能只检查“有这个 sheet”。合理的评分通常同时包含：

- 正向检查：必须存在的工作表、字段、关键数值、图表或章节；
- 负向检查：不应重复计数、不应覆盖原文件、不应把无法匹配的记录伪装成零、不应遗漏必要的待确认项；
- 可用性检查：文件可重新打开、公式结果合理、内容可追溯、图表引用有效。

负向检查应围绕最可能出现且业务后果明确的错误设计，不要用无关的隐藏陷阱。

固定权重、硬门槛、公式重算和六类 prompt—verifier 对照见 [`scoring-design.md`](scoring-design.md)。

这道周报任务从读取输入到评分的逐步示例见 [`ticket-weekly-case-study.md`](ticket-weekly-case-study.md)。
