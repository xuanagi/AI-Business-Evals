# HTTP 业务评测示例

中文 | [English](README.en.md)

保留 Harbor 的 Task / Job / Trial / verifier 结构，仅把执行器换成 HTTP JSON 适配器。
不需要大模型，也没有独立 Runner。

- [`http-reconciliation`](http-reconciliation)：原创采购对账教学 Task，包含正常匹配、分批入库、重复记录、少收、多收、未入库和金额差异。
- [运行与定制说明](../../docs/harbor/http-evaluation.md)：启动本地服务、运行 HTTP / oracle 两种实现、查看结果和接入自己的接口。

所有数据为原创合成示例，适用仓库 Apache-2.0。正式使用时请替换成业务自己的输入分布和验收规则。
