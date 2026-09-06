# 从零新建一个 Office Task

中文 | [English](creating-task.en.md)

下面以新建 `office-sales-monthly-summary-l3-057` 为例。命令在仓库根目录执行，适用于当前已验证的 Harbor 0.22.0。目录名、`task.name` 的末段、`metadata.source_case` 和 gold 的 `case_id` 从一开始就统一使用小写，避免在 Linux 上因大小写不一致失败。

## 1. 先定义业务验收标准

不要先写评分代码。先用一页文字回答五个问题：

1. 办公人员要完成什么工作；
2. Agent 会收到哪些本地文件；
3. 最终交付 XLSX、DOCX、PPTX 还是 PDF；
4. 哪些事实必须正确；
5. 哪些常见错误必须判失败，例如重复计数、覆盖原文件、伪造缺失值或生成不可编辑图片。

如果这些问题不能明确回答，任务通常也无法被稳定评分。

## 2. 选择创建方式

### 方式 A：复制最接近的现有任务（推荐）

例如新任务也是 Excel 汇总与图表：

```powershell
$source = '.\examples\harbor-office-tasks\office-ticket-weekly-dashboard-L3-053'
$target = '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057'
Copy-Item -LiteralPath $source -Destination $target -Recurse
```

随后必须替换指令、输入压缩包、gold、评分逻辑和 `task.toml` 身份信息，不能只改目录名。

### 方式 B：用 Harbor 生成空骨架

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor init agentic-office-evals/office-sales-monthly-summary-l3-057 `
  --task `
  --output-dir .\examples\harbor-office-tasks `
  --no-pytest `
  --no-solution `
  --include-standard-metadata `
  --description '汇总月度销售数据并生成可审阅的 Excel 报告'
```

Harbor 会在输出目录下创建任务子目录，以及 `task.toml`、`instruction.md`、`environment/Dockerfile` 和 `tests/test.sh`。这里使用 `--no-pytest`，是因为本仓库采用 `test.sh → score.py` 的轻量确定性评分方式。

如果准备发布到公共 registry，不建议省略 solution；应实现可信的 `solution/solve.sh`，用于证明任务可以完成并校准评分器。

## 3. 编写 `instruction.md`

使用办公室工作者能看懂的中文，至少写清：

- 角色和业务目标；
- 输入文件位置，例如 `input/销售明细.xlsx`；
- 日期、金额、去重等业务口径；
- 遇到缺失、冲突和无法判断内容时怎样处理；
- 输出路径，例如 `output/result.xlsx`；
- 必须包含的工作表、字段、图表或章节；
- 完成后重新打开并复核文件。

描述目标，不要求使用者指定算法。例如写“预测未来三个月并进行历史验证”，不要强迫非技术办公人员选择某个模型算法。

## 4. 制作输入压缩包

压缩包展开后必须得到 `/workspace/input/` 和空的 `/workspace/output/`。可以先在一个明确的临时目录准备：

```powershell
$staging = Join-Path $env:TEMP 'office-sales-monthly-summary-l3-057-workspace'
New-Item -ItemType Directory -Path "$staging\input" -Force
New-Item -ItemType Directory -Path "$staging\output" -Force
Copy-Item -LiteralPath 'D:\待评测资料\销售明细.xlsx' -Destination "$staging\input\销售明细.xlsx"

tar -czf `
  '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057\environment\workspace.tar.gz' `
  -C $staging .
```

检查压缩包：

```powershell
tar -tf '.\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057\environment\workspace.tar.gz'
```

不要放入参考成品、模型生成结果、密钥、客户真实敏感信息或用于解题的脚本。测试用业务数据应优先使用脱敏或合成数据。

## 5. 定义 Docker 环境

编辑 `environment/Dockerfile`：

- 设置 `WORKDIR /workspace`；
- 将 `workspace.tar.gz` 解压到 `/workspace`；
- 安装任务真正需要的包；
- 使用带 SHA-256 digest 的基础镜像并固定直接依赖版本，降低不同时间运行产生的偏差；
- 不在任务镜像中预装某个特定 Agent；Agent 的安装由 Harbor adapter 负责；
- XLSX 评分如需检查公式结果，安装 LibreOffice Calc 供 verifier 在临时副本上重算；
- 创建空的 `/workspace/output`。

Agent 并不会凭空知道可用包。它可以在容器内执行 `python -m pip list` 或尝试 import；数据集作者仍应确保 Dockerfile 中实际安装的内容与任务需求一致。

## 6. 编写 gold 和评分器

在 `tests/gold/gold_answer.json` 中保存用于机器核对的业务事实，例如：

```json
{
  "case_id": "office-sales-monthly-summary-l3-057",
  "case_type": "monthly_summary",
  "output_contract": {
    "path": "/workspace/output/result.xlsx",
    "type": "xlsx"
  },
  "required_sheets": ["月度汇总", "数据质量", "处理说明"],
  "totals": {"sales": 1250000.0}
}
```

然后实现：

- `tests/grading/eval_core.py`：打开成品并执行每一项检查；
- `tests/grading/score.py`：汇总检查，写入 `/logs/verifier/reward.txt` 和 `score.json`；
- `tests/test.sh`：Harbor 调用的唯一入口，显式运行 `score.py`。

评分器应同时验证正向要求和高风险负向错误。布局可以灵活，但金额、汇总、业务主键、字段关系、图表引用和可编辑性等事实应确定。文件不存在、打不开或缺少必要工作表应作为硬门槛；其余检查使用固定权重，不能因为提前返回而改变分母。不要只在整份文件中搜索几个“魔法数字”或关键词。

在根目录的 `tests/` 中为新任务增加一份合格 oracle 夹具和至少一份对抗性负向夹具。若沿用公共评分器，先修改 `grading/`，再运行 `python scripts/sync_grading.py`；不要分别手改六份副本。

## 7. 更新 `task.toml`

至少检查：

- `schema_version = "1.4"`；
- `[task].name` 使用全小写且在仓库中唯一；
- `version`、`description`、`keywords` 与新任务一致；
- Agent 和 verifier 超时足够；
- CPU、内存、存储和网络设置合理；启用了 `DOCKER_INSECURE_NO_IPTABLES_RAW` 的 Windows Docker provider 只能使用 `public`，并应确保评分器不包含网络访问；支持网络策略的正式评测环境建议 Agent 使用 `allowlist`、Verifier 使用 `no-network`；
- `[metadata]` 记录来源、修改情况、难度与能力分类。

## 8. 加入 Dataset 并刷新 digest

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor add `
  .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 `
  --to .\examples\harbor-office-tasks
```

以后修改这个 Task 的任何被 Harbor 打包的文件，都要运行 `harbor sync .\examples\harbor-office-tasks`。显示 `Updated` 表示摘要已刷新；没有改动时应显示 `Skipped`。

## 9. 校验和试跑

先做静态校验：

```powershell
.\scripts\validate-harbor.ps1

harbor run --print-config `
  -p .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 `
  -a nop
```

Linux / macOS 的静态校验入口为：

```bash
./scripts/validate-harbor.sh

harbor run --print-config \
  -p ./examples/harbor-office-tasks/office-sales-monthly-summary-l3-057 \
  -a nop
```

再启动 Docker，用一个真实 Agent 做单题 smoke test：

```powershell
harbor run `
  -p .\examples\harbor-office-tasks\office-sales-monthly-summary-l3-057 `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  --artifact /workspace/output `
  --job-name office-sales-monthly-summary-smoke `
  -o .\harbor-jobs
```

最后检查 reward、分项 `score.json`、实际 Office 成品和 trajectory。不要只确认命令退出码为 0。

如果所用模型走自建或代理端点，当前 `public` Agent 网络无需额外添加域名。认证由所选 Harbor Agent adapter 决定；任务和通用脚本不要自动设置某个 Agent 的认证环境变量。只有在所用 environment provider 明确支持白名单时，才改用 `allowlist` 和 `--allow-agent-host`。

如果需要项目内自定义 adapter，使用 Python 导入路径作为 `--agent`，例如 `harbor_agents.codex_npm:CodexNpm`。运行脚本会把仓库根目录加入 `PYTHONPATH`。这类 adapter 应只处理运行环境差异，不应把特定 Agent 预装进 Task 镜像，否则 Task 将失去跨 Agent 可比性。

## 10. 提交前清单

- 输入压缩包不含答案、敏感信息和旧输出；
- 指令中的文件名与压缩包完全一致；
- 输出路径与 gold 完全一致；
- 合格成品高分，缺文件/坏文件/缺工作表为 0，局部错误只影响相关固定权重分项；
- 每个核心业务要求都有对应检查，每个高风险误判都有负向夹具；
- `harbor sync` 后 manifest digest 已更新；
- 来源、具体修改和许可证已记录在任务 `README.md`、`task.toml` 及随任务打包的许可副本中；
- `harbor-jobs/` 没有提交到 Git。
