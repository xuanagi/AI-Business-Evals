# Office / Workplace Agent 公开基准索引

中文 | [English](office-benchmarks.en.md)

本索引保留 Office 与跨应用 Agent 的公开基准资料，供选择评测方向和设计任务时参考。项目定位、示例运行和业务定制入口见 [仓库首页](../README.md)。收录项目不代表已接入本仓库的运行流程，使用时需按来源说明获取数据、配置环境并核对许可。

导航：[收录口径](#收录口径) · [基准一览](#一览) · [详细分布](#详细任务分布与边界) · [未收录项目](#未收录的知名项目) · [社区项目](#社区项目) · [选择建议](#选择建议)

## 收录口径

以下目录仍聚焦公开 Office / workplace agent benchmark；这是基准索引的收录范围，不是项目可定制评测场景的边界。

清单信息最后核对日期：2026-09-04。项目数量、开放范围和许可可能变化，使用前应再查看对应项目的官方页面。

清单说明：

1. 任务指令公开可查看或下载；不收只开放排行榜、少量样例而隐藏正式测试集的 benchmark。
2. 被测对象是能采取行动并完成工作的 Agent，而不是只输出答案的 QA / 文档理解模型。
3. 至少公开输入文件、可运行环境、参考结果或评分规则中的关键部分，使第三方能够实际复现或接入自己的 Agent。
4. 每项都单独标出任务分布、主要语言和开放许可。公开下载不自动等于允许再分发。

开放状态：

- 🟢 **开放且可复现**：公开任务、输入与评测，并有明确的开放许可。
- 🟡 **任务公开但有限制**：任务可下载，但数据许可不清晰、限非商业使用，或部分原始素材需从第三方链接获取。

## 一览

### Office 文件与跨应用工作流

| Benchmark | 公开任务与分布 | 主要应用 / 交付物 | 语言 | 评测方式 | 开放状态 |
| --- | --- | --- | --- | --- | --- |
| [OmegaUse-OfficeVal](https://omegause-officeval.github.io/) | 100：教育考试 25、商业运营 20、其他 18、学术论文 14、工程技术 10、行政事务 9、金融数据 4 | DOCX、XLSX、PPTX、PDF，以及图像、音视频等多模态附件 | 中文 + 英文平行任务 | 确定性 artifact verifier + 双语 rubric | 🟢 [Apache-2.0](https://github.com/baidu-frontier-research/OmegaUse-OfficeVal) |
| [DocOps](https://docopsbench.github.io/) | 210：L1 局部原子操作 50、L2 同文档组合操作 40、L3 单文档工作流 60、L4 跨文档工作流 60 | Word、Excel、PowerPoint、PDF | 英文 | Docker 中的确定性文件级 verifier | 🟢 [Apache-2.0](https://github.com/icip-cas/DocOps) |
| [Workspace-Bench 1.0](https://workspace-bench.github.io/) | 388：运营经理 123、物流经理 115、研究员 67、后端开发 43、产品经理 40；难度为 easy 53、medium 206、hard 129 | 大型文件工作区；文档、表格、演示文稿、代码、图像等 74 种文件类型 | 英文 + 中文对应版本 | 7,399 条结果、过程与基础 rubric | 🟢 [MIT](https://github.com/OpenDataBox/Workspace-Bench)；[数据](https://huggingface.co/Workspace-Bench/datasets) |
| [OfficeBench (Wang et al., 2024)](https://arxiv.org/abs/2407.19056) | 300：单应用 93、双应用 95、三应用 112 | Word、Excel、PDF、Email、Calendar、OCR | 英文 | 最终应用状态的 exact / fuzzy / execution 检查 | 🟢 [Apache-2.0](https://github.com/zlwang-cs/OfficeBench) |
| [OdysseyBench](https://arxiv.org/abs/2508.09124) | 602：OfficeBench-Plus 300（93/95/112 个单/双/三应用），OdysseyBench-Neo 302（60/71/171） | Word、Excel、PDF、Email、Calendar；重点测试跨天历史与记忆 | 英文 | 最终状态检查，并保留多日交互历史 | 🟢 [MIT](https://github.com/microsoft/OdysseyBench)；含 Apache-2.0 的 OfficeBench 派生内容 |
| [ClawMark](https://claw-mark.com/) | 100，分布见[下表](#clawmark-任务分布)；每项模拟 1–3 个工作日 | 文件系统、Email、Calendar、Notion、Sheets；PDF、表格、图片、音频、视频 | 英文 | 1,537 个确定性 Python checker，不用 LLM judge | 🟡 [CC BY-NC 4.0](https://github.com/evolvent-ai/ClawMark)，仅非商业 |
| [BankerToolBench](https://arxiv.org/abs/2604.11304) | 100；产品线：M&A 62、LevFin 19、ECM 10、DCM 6、M&A+LevFin 3 | 投行端到端任务；Excel、PowerPoint、Word、PDF，多文件交付 | 英文 | 约 150 条专家 rubric / 任务，Agent verifier 检查公式和成品 | 🟢 [代码 Apache-2.0、数据 CC BY 4.0](https://github.com/Handshake-AI-Research/bankertoolbench) |
| [ClawsBench](https://clawsbench.benchflow.ai/) | 44：单服务 30、跨服务 14；其中安全关键任务 24 | Gmail、Slack、Google Calendar、Google Docs、Google Drive 的高保真 mock | 英文 | 比较最终数据库状态，同时报告任务成功和不安全行为 | 🟡 [CC BY-NC-SA 4.0](https://github.com/benchflow-ai/ClawsBench)，仅非商业 |

### Spreadsheet Agent

| Benchmark | 公开任务与分布 | Agent 要做什么 | 语言 | 评测方式 | 开放状态 |
| --- | --- | --- | --- | --- | --- |
| [SpreadsheetBench](https://arxiv.org/abs/2406.14991) | 912 条真实论坛需求、2,729 个测试文件；分为 cell-level 与 sheet-level，涵盖查找/提取、公式与计算、格式、删除、修改、汇总等 | 生成并执行代码，实际修改工作簿 | 英文 | 类 Online Judge：同一指令用多个变化后的工作簿测试泛化 | 🟢 [任务与数据](https://github.com/RUCKBReasoning/SpreadsheetBench)，README 声明 CC BY-SA 4.0 |
| [SpreadsheetBench 2](https://spreadsheetbench.github.io/) | 321：调试 100、金融模型 100、模板生成 97、可视化 24 | 在平均 11.8 个 sheet 的真实业务工作簿上完成端到端流程 | 英文 | 前三类确定性检查；可视化使用 VLM checklist | 🟡 [代码](https://github.com/RUCKBReasoning/SpreadsheetBench-2)未附独立 LICENSE；[数据卡](https://huggingface.co/datasets/KAKA22/SpreadsheetBench-v2)标 MIT |
| [WTM-Bench](https://github.com/microsoft/WTM-Bench) | 仓库内 150 个正式评测任务；完整数据约 2,977 个工作簿。任务覆盖公式、图表、透视表、条件格式、表与新 sheet；每项有 5 级指令明确度 | 多轮写代码，把“回退”的工作簿恢复到真实人工成品状态 | 英文 | 对目标变更做 cell-level + structural artifact 检查 | 🟢 MIT |
| [SheetCopilot](https://sheetcopilot.github.io/) | 221 个任务 / 28 个工作簿；标签为多选：录入与操作 165、公式 97、格式 65、图表 53、透视表 39、管理 24 | 通过原子动作迭代观察并控制 Excel | 英文 | 操作成功率、执行正确性与最终工作簿状态 | 🟡 [代码 GPL-3.0](https://github.com/BraveGroup/SheetCopilot)；README 另将使用限定为非商业研究/教育 |

### Presentation Agent

| Benchmark | 公开任务与分布 | Agent 要做什么 | 语言 | 评测方式 | 开放状态 |
| --- | --- | --- | --- | --- | --- |
| [PPTC](https://arxiv.org/abs/2311.01767) | 279 个多轮 session：新建 PPT 229、编辑长模板 50；每个 2–17 轮。操作标签为多选，其中位置相关 292 条、图片相关 268 条、图表相关 120 条 | 根据连续用户指令选择并执行 49 种 PowerPoint API，实际生成下一版 PPTX | 英文 | PPTX-Match 检查对象属性与空间关系，并分别报告 turn / session accuracy | 🟢 [MIT](https://github.com/gydpku/PPTC) |
| [PPT-Eval](https://microsoft.github.io/ppteval/) | 120：12 个源 deck × 每个 10 项；easy 51、medium 39、hard 30 | 在真实 PowerPoint Online 或 CLI 环境中创建、编辑 deck | 英文 | 任务 rubric + VLM，并检查 collateral damage | 🟢 [MIT](https://github.com/microsoft/ppteval)；源 deck 依各自许可下载 |
| [PPTArena](https://arxiv.org/abs/2512.03042) | 论文覆盖 100 个真实 deck、2,125 页和 800+ 定向编辑；当前公开固定评测对为 100 个，类别分布见[下表](#pptarena-公开评测对分布) | 对真实 PPTX 做局部编辑并保留无关内容 | 英文 | 结构 diff + VLM judge | 🟡 [任务仓库](https://github.com/michaelofengenden/PPTArena)未声明 LICENSE |
| [DECKBench](https://arxiv.org/abs/2602.13318) | 294 个论文—幻灯片 URL 对；两类任务：论文到完整 deck、最多 5 轮迭代编辑 | 生成学术演示文稿，并响应模拟用户的多轮修改 | 英文 | 参考式与无参考指标、布局/设计启发式和多轮改进率 | 🟡 [代码 MIT](https://github.com/morgan-heisler/DeckBench)；不再分发论文/幻灯片原件，需遵守原始素材许可 |

### 更广义的 workplace / computer-use 基准

这些 benchmark 不是只测 Office 文件，但包含大量办公、个人助理或专业交付任务，适合作为跨应用 Agent 的补充评测。

| Benchmark | 公开任务与分布 | 与 Office 场景的关系 | 语言 | 开放状态 |
| --- | --- | --- | --- | --- |
| [WorkBench](https://arxiv.org/abs/2405.00823) | 690 = 69 个模板 × 10 个实例：Analytics 120、Calendar 110、CRM 80、Email 90、Project Management 80、跨域 210 | Agent 用 26 个读写工具改变五个沙盒数据库的最终状态 | 英文 | 🟢 [MIT](https://github.com/olly-styles/WorkBench) |
| [MCPMark](https://arxiv.org/abs/2509.24002) | 127：Filesystem 30、Notion 28、Playwright 25、GitHub 23、PostgreSQL 21 | 以 MCP 工具执行长链 CRUD；Notion 与文件系统部分最接近办公协作 | 英文 | 🟢 [Apache-2.0](https://github.com/eval-sys/mcpmark)，每项公开初始状态与 Python verifier |
| [Toolathlon](https://toolathlon.xyz/) | 108：Tech 19、Campus 18、Business 18、Daily 17、Research 15、E-commerce 11、Finance 10；32 个应用、604 个工具 | 跨 Calendar、Notion、Email、Excel、Google Sheets、PDF、云与业务系统的长链任务 | 英文；当前 49/108 项另有中文任务文本 | 🟡 [任务与 evaluator 公开](https://github.com/hkust-nlp/Toolathlon)，仓库根目录未声明 LICENSE |
| [MyPCBench](https://mypcbench.com/) | 184：受限动作 64、多步编排 48、跨源核对 25、聚合与报告 23、个人信息查找 13、模式推断 11；68% 为多应用 | 17 个登录态应用 + 完整 LibreOffice 的 Linux 桌面个人助理 | 英文 | 🟢 [MIT](https://github.com/ljang0/MyPCBench)；任务、rubric、VM 均公开 |
| [OSWorld v1](https://arxiv.org/abs/2404.07972) | 369；其中 LibreOffice Calc 47、Impress 47、Writer 23，共 117 个直接 Office 任务；另有 multi_apps 101 | 像素级 GUI Agent 在真实桌面与 LibreOffice 中完成任务 | 英文 | 🟢 [Apache-2.0](https://github.com/xlang-ai/OSWorld)；这里只收公开的 v1 |
| [GDPval public set](https://huggingface.co/datasets/openai/gdpval) | 220 = 44 个职业 × 每个 5 项，覆盖 9 个行业 | 专家级知识工作交付，输出文档、表格、幻灯片、图表、媒体等；不要求固定 Office 操作路径 | 英文 | 🟡 公共子集任务、输入、参考交付与 rubric 可下载，但数据页未给出明确 LICENSE；完整 1,320 项并未公开 |

## 详细任务分布与边界

### OmegaUse-OfficeVal

- **规模与分布**：100 项；教育考试 25、商业运营 20、其他 18、学术论文 14、工程技术 10、行政事务 9、金融数据 4。
- **任务形态**：从原始材料出发完成约 2.32 小时的人类工作量，最后交付可打开、可继续编辑的 Office 文件；不规定 Agent 走 GUI、代码还是混合路径。
- **语言**：每项都有中文、英文指令和双语 rubric，是目前少数真正公开的中英双语 Office artifact benchmark。
- **公开内容**：[Hugging Face](https://huggingface.co/datasets/baidu-frontier-research/OmegaUse-OfficeVal) 提供 prompt、输入、参考成品和 verifier。

### DocOps

- **分层**：L1 测单个局部操作，L2 测同一文档内的组合编辑，L3 测完整单文档流程，L4 测多个文档之间的信息整合与交付。
- **适用性**：覆盖 Word / Excel / PowerPoint / PDF，强调直接检查文件内部结构和最终 artifact，适合比较 GUI Agent、代码 Agent 和混合 Agent。
- **语言**：当前公开任务为英文。

### Workspace-Bench 1.0

- **角色分布**：运营经理 123、物流经理 115、研究员 67、后端开发 43、产品经理 40。
- **难度分布**：easy 53、medium 206、hard 129。
- **任务形态**：在最多约 20 GB、20,476 个文件构成的工作区中探索依赖、追踪来源、读取多个输入并产出文件。它比单个 Office 应用基准更接近“桌面上的项目文件夹”。
- **语言**：公开数据分别提供 `task_clean_en` 与 `task_clean_cn`；二者是对应的英文和中文任务版本。

### OfficeBench 与 OdysseyBench

这里的 **OfficeBench** 指 Wang 等人 2024 年的开放研究基准，不是 WPS 的同名网站。

- OfficeBench 的 300 项按应用数分为 93 / 95 / 112，覆盖 Word、Excel、PDF、Email、Calendar 和 OCR；Agent 通过工具/API 修改模拟办公环境。
- OdysseyBench 延续同一环境，把历史邮件、日历和文件操作串成多日轨迹。其 602 项由 OfficeBench-Plus 300 和新建的 Neo 302 组成；Neo 明显偏向三应用任务（171/302）。
- 两者任务均为英文。前者更适合测基本跨应用执行，后者更适合测长上下文检索、记忆与跨天状态恢复。

### ClawMark 任务分布

ClawMark 的目录当前公开 100 项，分布如下：

| 专业域 | 数量 | 专业域 | 数量 |
| --- | ---: | --- | ---: |
| Research Assistant | 15 | Content Operation | 12 |
| HR | 11 | E-commerce | 9 |
| Journalist | 8 | Product Manager | 8 |
| Executive Assistant | 7 | Insurance | 7 |
| Investment Analyst | 6 | Legal Assistant | 6 |
| Real Estate | 6 | Clinical Assistant | 4 |
| EDA | 1 | **合计** | **100** |

它的优势是环境会在阶段间变化，Agent 必须重新检查邮件、日历和文件，而非只照一份静态 checklist 执行。限制是 CC BY-NC 4.0，不适合作为可自由商用的数据源。

### BankerToolBench 工作流分布

除产品线外，100 项还可以按工作流划分：

| 工作流 | 数量 |
| --- | ---: |
| Financial Modeling & Scenario Analysis | 37 |
| Valuation & Pricing Analysis | 30 |
| Client & Marketing Materials | 27 |
| Market Analysis & Investor Engagement | 3 |
| Process & Timeline Management | 2 |
| Aftermarket Performance Trading | 1 |

这是专业性最强的一类 Office Agent 基准之一：平均人类工时约 5 小时，单项最高 21 小时。完整任务和输入公开；golden output 只覆盖部分任务，但所有任务都有细粒度专家 rubric。

### SpreadsheetBench 系列怎么选

- **SpreadsheetBench**：真实论坛中的局部需求；同一程序要通过多个数据变化后的测试工作簿，适合测稳健的 spreadsheet manipulation。
- **SheetCopilot**：221 项较早期 Excel 控制任务，覆盖公式、格式、图表、透视表和工作表管理，适合作为动作空间/规划基线。
- **WTM-Bench**：从真实成品反向移除公式、图表、透视表等 artifact，再要求 Agent 恢复；能精确检查结构和单元格变更。
- **SpreadsheetBench 2**：从局部操作升级到大型、多 sheet、端到端业务工作流；金融建模和调试占 200/321。

### PPTArena 公开评测对分布

以下是当前公开 `evaluation_pairs_refined.json` 中 100 个固定编辑对的分布；它与论文所述 800+ 条编辑操作不是同一个计数口径。

| 类别 | 数量 | 类别 | 数量 |
| --- | ---: | --- | ---: |
| Text & Typography | 29 | Charts | 10 |
| Images & Pictures | 10 | Theme & Background | 9 |
| Alignment / Distribution / Z-order | 8 | Slide / Section Management & Footers | 8 |
| Tables | 8 | Shapes & Drawing | 4 |
| SmartArt & Diagrams | 4 | Slide Layout & Placeholders | 3 |
| Accessibility & Semantics | 2 | Slide Transitions | 1 |
| Hyperlinks & Action Settings | 1 | Template & Master-Level Edits | 1 |
| Audio & Video | 1 | Object Animations | 1 |

### OSWorld v1 的 Office 子集

OSWorld v1 的 369 项并不全是办公任务，因此不应把总数都算作 Office benchmark。最明确的 Office 子集是 Calc 47、Impress 47、Writer 23，共 117 项；另外 101 个 multi-app 任务中也有一部分会调用 LibreOffice。它的独特价值在于真实 GUI、鼠标键盘与可复位虚拟机，而不是 Office 文件结构级评分。

## 未收录的知名项目

下列项目有研究价值，但正式任务集没有完全公开，因此不进入上面的开放清单。

| 项目 | 未收录原因 | 语言 / 已知分布 |
| --- | --- | --- |
| [WPS OfficeBench](https://officebench.wps.cn/) | 网站公布 7,489 个样例、12 个数据集和 39 个能力域，但多个数据集页面明确显示正式样例大部分或全部为 private；无法下载完整任务包复现 | 评测权重为中文 60%、英文 30%、中英混合 10%；9 个核心场景包括智能写作、数据处理、演示设计、文档理解、格式排版、视觉理解、图像生成、Office 代码生成和 Agent |
| [FORTE](https://github.com/AGI-Eval-Official/FORTE) | 论文为 180 项 / 15 个职业，但仓库只放出每个职业 1 个 demo（共 15 个），正式评测集未开放 | 英文；市场、销售、财务、法务、开发、运维、HR、产品、行政等 15 类 |
| [OfficeEval / NCRE](https://arxiv.org/abs/2606.10956) | 论文报告 200 项 Word / Excel / PowerPoint 任务和 7,118 条评分标准，但截至本次调研未找到官方任务与环境下载 | 以中国全国计算机等级考试 Office 题为基础，主要为中文 |
| [BlueFin](https://github.com/Longitude-Labs/bluefin) | 论文基准共 131 项，但公开 release 仅 11 项，剩余 120 项为 held-out | 英文；Synthesis 10、Manipulation 82、Interrogation 39，且后者偏 QA |
| [WorkstreamBench（早期称 MBABench）](https://arxiv.org/abs/2605.22664) | 完整 benchmark 与 leaderboard 使用的任务未全部公开；公开 ModelOff 子集只有 38 项，且外部素材许可不统一 | 英文；金融建模、研究、演示与多文件专业工作流 |
| OSWorld v2 | v2 测试任务需要受控访问；本仓库只列完全公开的 OSWorld v1 | 英文；通用桌面应用 |

纯文档问答、表格问答、图表问答、文档分类、OCR 和只对已有文件打审美分的 benchmark 也不在本清单内，因为它们没有要求 Agent 直接完成可执行的办公任务。

## 社区项目

[Cowork Bench](https://github.com/0717376/cowork_bench) 是一个较新的社区 benchmark，尚无同行评审论文，因此不与上面的论文基准混为一类，但它与本仓库的主题高度一致：公开 496 个端到端任务，Agent 通常需要组合 4–7 个工具，从本地 mock 数据库取数，生成 Excel / Word / PPTX，更新日历并发送邮件。全部任务和 system prompt 为 **俄文**，场景偏俄罗斯铁路、莫斯科交易所、1C HR、电商和 LMS；使用确定性文件与 SQL side-effect 检查，仓库为 Apache-2.0。

## 选择建议

| 目标 | 建议起点 |
| --- | --- |
| 中文 Office Agent | OmegaUse-OfficeVal、Workspace-Bench 中文版；WPS OfficeBench 只适合作外部排行榜参考 |
| Word / Excel / PPT 通用 artifact Agent | OmegaUse-OfficeVal、DocOps |
| 大型文件夹与跨文件依赖 | Workspace-Bench |
| 跨应用、邮件、日历和记忆 | OdysseyBench、ClawMark、ClawsBench、WorkBench |
| Google Workspace 的能力与安全 | ClawsBench；更通用的 MCP 操作可补 MCPMark |
| 大规模 MCP 与多工具编排 | Toolathlon；俄文 Office 场景可看 Cowork Bench |
| 真实 GUI / CUA | OSWorld v1 Office 子集、PPT-Eval、MyPCBench |
| Excel 局部操作与代码生成 | SpreadsheetBench、SheetCopilot |
| Excel 端到端业务工作流 | SpreadsheetBench 2、WTM-Bench |
| PowerPoint API、多轮状态累积 | PPTC |
| PowerPoint GUI / 成品编辑 | PPT-Eval、PPTArena |
| PowerPoint 从长文生成并多轮修改 | DECKBench |
| 高专业度、多文件商业交付 | BankerToolBench；GDPval public set 可作更广泛职业补充 |

## 贡献基准索引

欢迎提交 issue 或 PR。新增 benchmark 时请至少提供：

- 官方论文、项目页、代码和数据链接；
- **实际公开**任务数，而不只引用论文总数；
- 任务分布、主要语言、目标应用与输出格式；
- Agent 的动作方式和评分方式；
- 代码、任务、输入素材各自的许可；
- 一条能证明任务不是纯 QA 的真实示例。
