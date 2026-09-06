# 完整示例：客服工单周报

中文 | [English](ticket-weekly-case-study.en.md)

本页用 `office-ticket-weekly-dashboard-L3-053` 串起一条完整链路。它不是告诉模型怎样作弊，而是帮助数据集作者理解每个文件的职责。

## 业务任务

Agent 收到 `instruction.md` 后，需要读取 `/workspace/input/客服工单处理记录.xlsx`，按自然周汇总第 15–18 周的计划工单量、实际解决量和完成率，并在 `/workspace/output/result.xlsx` 中生成：

- `周汇总`：四周指标、合计和两张图；
- `数据质量`：输入行数、缺失或异常记录的说明；
- `处理说明`：周口径、计算口径和图表说明。

图表直接嵌入 XLSX，而不是另建 HTML/ECharts 页面。原因是本场景的最终使用者要在 Excel 中继续审阅和编辑；评分器也会检查工作簿中的 chart 对象与数据系列。

## Agent 启动前

Harbor 读取 `task.toml`，为 trial 建立 2 CPU、4096 MB 内存、30 分钟 Agent/Verifier 超时的 Docker 环境。镜像将 `workspace.tar.gz` 解压至 `/workspace`，Agent 的工作目录就是这里。

此时：

- Agent 能看到指令和 `/workspace/input/`；
- Agent 看不到宿主机中的原始数据集目录；
- 测试文件由 Harbor 挂载给 verifier，不应作为 Agent 的解题输入；
- `/workspace/output/` 初始为空。

## Agent 执行时

一个合理但不强制的过程是：

1. 列出输入文件，确认只有一份工作簿；
2. 打开工作簿并检查 sheet、列名、日期类型、空值和总行数；
3. 明确自然周口径后计算四周指标；
4. 检查分周合计是否与全表合计一致；
5. 创建三个要求的工作表；
6. 在 `周汇总` 中创建指标表、合计、柱形图和完成率图；
7. 将完成率保存为数值并使用百分比格式；
8. 保存 `result.xlsx`，重新打开一次，确认 sheet 和图表仍然存在。

提示词只规定目标和业务约束，不规定必须使用 pandas、openpyxl 或具体算法。这样评测的是 Agent 完成工作任务的能力，不是背诵某段实现。

## `gold_answer.json` 怎样理解

该文件保存 verifier 所需的可核对事实：

| 字段 | 含义 |
| --- | --- |
| `case_id` | 本任务的稳定标识，便于日志和追踪 |
| `case_type` | 告诉共用 `eval_core.py` 选择周报评分函数 |
| `output_contract.path` | 交付物必须出现的容器内绝对路径 |
| `output_contract.type` | 交付物类型为 XLSX |
| `required_sheets` | 三个必须存在的工作表 |
| `total_input_rows` | 输入共有 560 行；用于数据质量核对语义 |
| `weekly_summary` | 每周周次、起止日期、记录数、计划量、解决量和完成率的期望值 |
| `totals` | 四周计划量 37870、解决量 28645 |

这里不保存一份完整 `result.xlsx`，也不限定标题颜色、字体或每个单元格地址。评分器按表头识别业务列，再按周次关联每行字段；把正确数字散放在其他位置不能得分。

## Agent 完成后怎样评分

Agent 退出后，Harbor 才调用 `tests/test.sh`。`test.sh` 不运行 pytest，而是显式运行 `score.py`；`score.py` 再调用 `eval_core.py` 的周报评分函数。当前检查包括：

1. 输出文件存在；
2. XLSX 可以重新打开；
3. 三个工作表齐全；
4. 四行分别对应第 15–18 周，起止日期、记录数、计划量、解决量和完成率都正确；
5. 根据这四行重新计算的合计正确；
6. 数据质量页写明 560 行、重复结果和周一至周日口径；
7. 至少两张有标题的原生图表，且系列引用 `周汇总` 数据；
8. H 列之后如果存在辅助数据，必须隐藏；
9. 四个完成率都是数值百分比；
10. 公式经 LibreOffice 重新计算后没有错误。

前三项是硬门槛，任一失败直接得到 0。其他项目按固定权重计分，分母不会因提前返回而缩小；详细结果写入 `score.json`，总分写入 `reward.txt`。仓库回归测试还会验证“只有魔法数字、没有按周关联的表格”不能通过。

## 一次 trial 结束后

应同时检查三类证据：

- `verifier/reward.txt` 与 `score.json`：是否正确；
- 下载的 `/workspace/output/result.xlsx`：成品是否适合人工使用；
- `agent/trajectory.json`：模型用什么步骤得到结果，差异从哪里开始。

如果不同模型的总分不同，先用 `score.json` 定位失败项，再对齐 trajectory。例如 `weekly_charts` 失败，应查看模型是否创建了图表、引用了错误范围，或保存后没有重新打开验证，而不是只读最后一条回答。
