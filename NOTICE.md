# 数据来源与许可说明

中文 | [English](NOTICE.en.md)

本仓库既包含原创索引与文档，也包含从第三方公开项目改编的示例任务。仓库自有代码与文档适用根目录 `LICENSE` 中的 Apache-2.0；标明为第三方或改编的内容不因此改为 Apache-2.0。公开可下载不等于可以忽略原项目许可；使用、修改或再分发时，应分别遵守对应来源的条款。

## HTTP 原创示例

新增的 `examples/harbor-http-tasks`、`examples/http-reconciliation-service.py` 和 HTTP 适配器
是原创代码与合成数据，适用根目录 Apache-2.0，不包含下述 WorkBuddy 改编任务的数据。

## Office 本地文件示例

| 本仓库任务 | 来源 | 处理方式 |
| --- | --- | --- |
| `office-fee-data-cleaning-L3-051` | Tencent WorkBuddy Bench `fund-product-table-normalize-L3-017` | 改写为更轻量的本地文件提示词与 Harbor 原生评分任务 |
| `office-procurement-reconcile-L3-052` | Tencent WorkBuddy Bench `procurement-reconcile-L3-015` | 改写为本地采购对账场景 |
| `office-ticket-weekly-dashboard-L3-053` | Tencent WorkBuddy Bench `ticket-weekly-L3-010` | 改写提示词、输入封装和确定性评分器 |
| `office-channel-anomaly-analysis-L4-054` | Tencent WorkBuddy Bench `channel-period-compare-L4-017` | 扩展为渠道结算与回款异常分析 |
| `office-demand-forecast-L4-055` | 本仓库原创合成任务 | 新建 36 个月历史数据、预测目标和评分规则 |
| `office-governance-summary-L4-056` | Tencent WorkBuddy Bench `board-material-update-timeline-excel` | 改写为跨 XLSX/PPTX 的管理摘要任务 |

Tencent WorkBuddy Bench 来源：<https://github.com/Tencent/workbuddy-bench>。其许可并非通用 MIT 或 Apache-2.0，并包含地域使用限制。为便于审阅，原许可文本保存在 [`third_party/workbuddy-bench/LICENSE`](third_party/workbuddy-bench/LICENSE)，并复制到每个改编任务的 `LICENSE.workbuddy-bench`；每个任务的 `NOTICE.md` 都列明了修改。本仓库的修改不代表 Tencent 对本项目背书。

除 Office 场景外，WorkBuddy Bench 还提供 Code、Web 等任务示例，用户可参考其任务组织、环境封装和验收器设计。仅参考设计方法不等于取得具体任务、数据或素材的再分发许可；复制、改编或分发相关材料时，仍须遵守上游许可证并保留来源、版本和修改说明。

[Office 基准索引](docs/office-benchmarks.md)中列出的其他 benchmark 目前仅作为目录和链接引用，没有把它们的数据集复制进本仓库。将来引入新的任务或附件时，应在合并前补充来源、版本、修改说明和许可证副本。
