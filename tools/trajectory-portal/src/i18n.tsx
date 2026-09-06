import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh" | "en";

const STORAGE_KEY = "agentic-office-trajectory-portal-locale";
let currentLocale: Locale = "zh";

function validLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "zh";
}

function initialLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) return validLocale(saved);
  return typeof navigator !== "undefined" && /^en(?:-|$)/i.test(navigator.language) ? "en" : "zh";
}

const translations: Record<string, string> = {
  "序号": "No.",
  "无数据集信息（未产生 Trial）": "No dataset information (no Trial produced)",
  "等待运行": "Waiting",
  "运行中": "Running",
  "评分中": "Verifying",
  "已完成": "Completed",
  "无评分": "Unscored",
  "超时": "Timed out",
  "已取消": "Cancelled",
  "运行异常": "Execution error",
  "运行失败": "Execution failed",
  "未知状态": "Unknown status",
  "Harbor 术语说明": "Harbor terminology",
  "切换到 English": "Switch to English",
  "切换到中文": "Switch to Chinese",
  "图片": "image",
  "音频": "audio",
  "提交结果": "Submit result",
  "说明进度": "Report progress",
  "验证结果": "Validation result",
  "编写处理脚本": "Write processing script",
  "生成交付物": "Generate artifact",
  "生成图表": "Generate chart",
  "数据去重": "Deduplicate data",
  "汇总分析": "Aggregate and analyze",
  "读取或检查数据": "Read or inspect data",
  "准备工作目录": "Prepare workspace",
  "执行数据处理": "Process data",
  "调用": "Call",
  "术语说明": "Terminology",
  "查看 Harbor 术语说明": "View Harbor terminology",
  "一次评测任务集合，通常包含多个 Trial。": "A set of evaluation runs, usually containing multiple Trials.",
  "一个待完成并验证的具体办公任务。": "A specific workplace task to complete and verify.",
  "某模型/Agent 对一个 Task 的一次实际运行。": "One execution of a Task by a model or Agent.",
  "同一 Job 内同一 Task 的第几次尝试。": "The attempt number for a Task within the same Job.",
  "复用既有运行结果重新评分，不代表新的 Agent 运行。": "Re-score an existing run; this is not a new Agent execution.",
  "评分方式": "Scoring method",
  "程序评分可重复执行；LLM Judge 由模型判断。": "Programmatic scoring is repeatable; an LLM Judge makes the judgment.",
  "单次尝试": "Single attempt",
  "查看": "View",
  "的异常 Trial": "'s failed Trials",
  "中包含未通过评分项的 Trial": "with Trials that have failed checks",
  "HTTP 服务（无模型）": "HTTP service (no model)",
  "未知模型": "Unknown model",
  "未标注 Task": "Unnamed Task",
  "无 checksum": "No checksum",
  "Task × 模型稳定性与覆盖": "Task × model stability and coverage",
  "只有 Task checksum、Agent 版本、推理强度、环境和 Verifier 配置一致的 Trial 才会合并计算。Regrade 会复用既有 Agent 运行；存在原始 Trial 时会排除 Regrade。": "Only Trials with the same Task checksum, Agent version, reasoning effort, environment, and Verifier configuration are aggregated. Regrades reuse an existing Agent run and are excluded when the original Trial exists.",
  "评分稳定性与运行效率": "Score stability and execution efficiency",
  "当前只有 Regrade，统计仅供评分器复核": "only Regrades are available; statistics are for verifier review",
  "已排除": "excluded",
  "个 Regrade": " Regrades",
  "模型": "Model",
  "实验配置": "Experiment configuration",
  "运行批次": "Run batches",
  "评分 / Trial": "Scores / Trials",
  "均分": "Mean score",
  "范围": "Range",
  "标准差": "Std. dev.",
  "标准差越小，重复运行的评分越稳定。": "A smaller standard deviation means more stable repeated-run scores.",
  "检查通过率": "Check pass rate",
  "数据集": "Dataset",
  "未识别 Task": "Unrecognized Task",
  "Task Trial 均分": "Mean score for Task Trials",
  "筛选 Trial 均分": "Mean score for filtered Trials",
  "完成": "Completed",
  "异常 Trial": "Failed Trials",
  "未通过评分项": "Failed checks",
  "开始时间": "Started",
  "结束时间": "Finished",
  "操作": "Actions",
  "查看 Trial": "View Trial",
  "对比": "Compare",
  "全部数据集": "All datasets",
  "全部 Task": "All Tasks",
  "全部模型": "All models",
  "全部状态": "All statuses",
  "评分": "Score",
  "全部": "All",
  "有评分": "Scored",
  "全部尝试": "All attempts",
  "仅重复尝试": "Retries only",
  "异常类别": "Error category",
  "全部类别": "All categories",
  "开始日期": "Start date",
  "结束日期": "End date",
  "选择开始日期": "Select start date",
  "选择结束日期": "Select end date",
  "重置筛选": "Reset filters",
  "已完成 Trial": "Completed Trials",
  "模型分布": "Model distribution",
  "未通过评分项（累计）": "Failed checks (total)",
  "部分 Harbor 数据未被纳入分析": "Some Harbor data was not included",
  "查看解析问题": "View parsing issues",
  "运行记录": "Run history",
  "包含已完成 Trial 的 Job": "Jobs with completed Trials",
  "存在异常 Trial 的 Job": "Jobs with failed Trials",
  "存在未通过评分项的 Job": "Jobs with failed checks",
  "搜索模型、Job、数据集或 Task": "Search models, Jobs, datasets, or Tasks",
  "导出快照": "Export snapshot",
  "上次扫描完成时间": "Last scan completed",
  "更新于": "Updated",
  "指标": "Metric",
  "基准": "Baseline",
  "比较基准": "Comparison baseline",
  "较基准": "vs. baseline",
  "得分": "Score",
  "总分": "Total score",
  "通过检查": "Passed checks",
  "Agent 用时": "Agent time",
  "执行用时": "Execution time",
  "工具调用": "Tool calls",
  "输入 token": "Input tokens",
  "缓存 token": "Cached tokens",
  "输出 token": "Output tokens",
  "得分和通过检查越高越好；用时、工具调用和 token 消耗越低越好。": "Higher scores and more passed checks are better; lower time, tool calls, and token usage are better.",
  "可直接比较": "Directly comparable",
  "变量": "Variables",
  "其余关键配置一致": "Other key configuration is identical",
  "Task checksum 不一致": "Task checksums differ",
  "Task 版本不一致": "Task versions differ",
  "Task 来源不一致": "Task sources differ",
  "Task 配置不一致": "Task configurations differ",
  "运行环境配置不一致": "Runtime environment configurations differ",
  "Verifier 配置不一致": "Verifier configurations differ",
  "Verifier 环境模式不一致": "Verifier environment modes differ",
  "Agent 类型不一致": "Agent types differ",
  "Agent 版本不一致": "Agent versions differ",
  "推理强度": "Reasoning effort",
  "当前组合不适合直接比较结果": "This selection is not suitable for direct result comparison",
  "当前组合存在可比性风险": "This selection has comparability risks",
  "对比变量": "Comparison variables",
  "请在“技术信息”中核对配置差异，必要时仅将本次比较用于排障。": "Check configuration differences in Technical information; use this comparison for troubleshooting only when needed.",
  "状态": "Status",
  "尝试": "Attempt",
  "没有可识别的 reward 维度": "No recognizable reward dimensions",
  "评分来源与 Judge 详情": "Score sources and Judge details",
  "已读取：": "Loaded:",
  "CTRF 测试结果": "CTRF test results",
  "没有 ctrf.json": "No ctrf.json",
  "多步骤结果": "Multi-step results",
  "步骤": "Step",
  "名称": "Name",
  "耗时": "Duration",
  "费用（USD）": "Cost (USD)",
  "提前终止": "Terminated early",
  "是": "Yes",
  "否": "No",
  "结果": "Result",
  "失败": "Failed",
  "未标注": "Unlabeled",
  "原始评分结果未提供 evaluator_type": "The raw score did not provide evaluator_type",
  "程序检查": "Programmatic check",
  "混合评分": "Hybrid scoring",
  "未识别的 evaluator_type，按原值展示": "Unrecognized evaluator_type; showing the raw value",
  "评分结果": "Score results",
  "执行过程": "Execution process",
  "交付物": "Artifacts",
  "原始日志": "Raw logs",
  "技术信息": "Technical information",
  "执行过程（双 Trial）": "Execution process (two Trials)",
  "交付物（双 Trial）": "Artifacts (two Trials)",
  "原始日志（双 Trial）": "Raw logs (two Trials)",
  "差异总览": "Difference overview",
  "评分差异": "Score differences",
  "轨迹元数据": "Trajectory metadata",
  "ATIF 轨迹健康度": "ATIF trajectory health",
  "格式问题": "Format issues",
  "分析提示": "Analysis notes",
  "基础校验通过": "Basic validation passed",
  "原始轨迹编号：": "Original trajectory number: ",
  "没有 Agent 轨迹；请查看交付物与原始日志": "No Agent trajectory; check artifacts and raw logs",
  "Trial 总分未知": "Trial total score is unknown",
  "评分来源存在冲突，当前以 Harbor result.json 为准": "Score sources conflict; Harbor result.json is used",
  "门槛检查未通过，总分受到门槛规则影响": "A gate check failed; the total score is affected by the gate rule",
  "评分项": "Check",
  "权重": "Weight",
  "门槛": "Gate",
  "检查说明": "Check details",
  "无此检查": "Check not present",
  "预览仅展示部分内容；完整内容请下载文件后查看。": "The preview shows only part of the content; download the file to view it in full.",
  "没有可预览的交付物": "No previewable artifacts",
  "该文件暂不支持在线预览": "Online preview is not available for this file",
  "文件中没有可显示的文本": "The file contains no displayable text",
  "字节": "bytes",
  "工作簿中没有可预览的工作表": "The workbook has no previewable sheets",
  "对比预览": "Compare previews",
  "交付物对比预览": "Artifact comparison preview",
  "同步滚动": "Sync scrolling",
  "同步工作表": "Sync worksheet",
  "选择同步工作表": "Select synchronized worksheet",
  "没有同名工作表": "No worksheet with the same name",
  "高级工具": "Advanced tools",
  "RLViz 和 AgentViz 需要 Node.js 基础环境": "RLViz and AgentViz require Node.js",
  "Node.js 工具链": "Node.js toolchain",
  "Windows 暂不支持，请使用 WSL/Linux": "Windows is not supported yet; use WSL/Linux",
  "无轨迹": "No trajectory",
  "未安装": "Not installed",
  "未检测到": "Not detected",
  "缺少基础环境": "Missing prerequisites",
  "选择要打开的轨迹": "Select a trajectory to open",
  "安装并启动": "Install and launch",
  "启动": "Launch",
  "需要基础环境": "Prerequisites required",
  "复制命令": "Copy command",
  "没有可识别的 Agent 日志": "No recognizable Agent logs",
  "选择 Agent 日志文件": "Select an Agent log file",
  "Trial 详情": "Trial details",
  "与另一个 Trial 对比": "Compare with another Trial",
  "第一步：选择 Job": "Step 1: Select a Job",
  "第二步：选择 Trial": "Step 2: Select a Trial",
  "显示全部": "Show all",
  "下一项": "Next",
  "正在加载所选 Trial": "Loading selected Trial",
  "HTTP 被测服务": "HTTP target service",
  "此执行器不调用模型，不生成 ATIF 轨迹。响应和 HTTP 调用耗时见交付物；调用记录见原始日志。执行用时包含文件传输等适配开销，远端状态不由 Harbor 自动隔离。": "This executor does not call a model or create an ATIF trajectory. See artifacts for the response and HTTP request duration, and raw logs for the call record. Execution time includes adapter overhead such as file transfer; Harbor does not automatically isolate remote state.",
  "Trial 结果 JSON": "Trial result JSON",
  "Trial 配置与来源": "Trial configuration and source",
  "Regrade 来源": "Regrade source",
  "原始 Trial": "Original Trial",
  "Regrade 评分变化": "Regrade score change",
  "Task 来源 / 版本": "Task source / version",
  "Verifier 环境模式": "Verifier environment mode",
  "当前服务未提供校验结果": "The current service did not provide validation results",
  "存在": "There are",
  "项问题": " issues",
  "请选择一个 Trial": "Select a Trial",
  "Trial 读取失败": "Failed to load Trial",
  "重试": "Retry",
  "请选择 Trial": "Select a Trial",
  "选择至少两个 Trial 进行对比": "Select at least two Trials to compare",
  "双 Trial 深度对比": "Deep comparison of two Trials",
  "从横向对比范围中选择当前 Tab 使用的两项": "Choose the two items used by this tab from the comparison set",
  "基准 Trial": "Baseline Trial",
  "对比 Trial": "Compared Trial",
  "第一步：选择相同 Task": "Step 1: Select the same Task",
  "第二步：选择横向对比范围（2–4 个 Trial）": "Step 2: Select comparison set (2–4 Trials)",
  "显示运行异常 / 无评分 Trial": "Show failed / unscored Trials",
  "可对比结果不足 2 个，已显示全部": "Fewer than 2 comparable results; showing all",
  "另有": "There are also",
  "个异常或无评分 Trial 可按需加入": " failed or unscored Trials available to add",
  "对比数据读取失败": "Failed to load comparison data",
  "正在加载对比 Trial": "Loading comparison Trials",
  "正在加载两条执行过程": "Loading both execution processes",
  "正在加载两侧原始日志": "Loading raw logs for both sides",
  "正在加载技术信息": "Loading technical information",
  "至少需要保留两个 Trial 才能对比": "Keep at least two Trials to compare",
  "请先选择 Task": "Select a Task first",
  "选择后，只会列出运行过该 Task 的 Trial。": "After selection, only Trials that ran this Task will be listed.",
  "当前 Task 暂时无法形成对比": "The current Task cannot form a comparison yet",
  "当前对比包含运行异常或无评分 Trial": "This comparison includes failed or unscored Trials",
  "该组合适合排查失败原因；若需要比较模型能力，请优先选择运行完成且有评分的 Trial。": "This selection is useful for troubleshooting; to compare model capability, prefer completed and scored Trials.",
  "Task 名称一致，但部分 Trial 缺少完整性标识": "Task names match, but some Trials lack integrity identifiers",
  "可以查看结果，但无法确认所有运行使用了完全相同的任务定义和输入。": "Results can be viewed, but identical task definitions and inputs cannot be confirmed.",
  "Task 定义或输入不同，不建议直接比较": "Task definitions or inputs differ; direct comparison is not recommended",
  "选择需要对比的 Task": "Select a Task to compare",
  "选择需要横向比较的 Trial": "Select Trials for comparison",
  "导出": "Export",
  "运行概览": "Run overview",
  "Trial 对比": "Trial comparison",
  "Harbor 结果分析": "Harbor Results Explorer",
  "主要页面": "Main pages",
  "Job 根目录": "Job root directory",
  "选择文件夹": "Choose folder",
  "加载": "Load",
  "刷新": "Refresh",
  "无法加载评测目录": "Unable to load evaluation directory",
  "所选目录中没有可识别的 Harbor Job": "No recognizable Harbor Jobs in the selected directory",
  "日常分析能力已内置": "Everyday analysis is built in",
  "当前页面已支持评分、执行过程、交付物、日志和 Trial 对比；以下工具仅用于多模型分析、深度审阅或查看未解析的 Harbor 原生信息。启动时只会把当前本机 Job / Trial 路径交给对应工具；外部工具的网络与数据策略由其自身控制。": "This page already supports scores, execution, artifacts, logs, and Trial comparison. The tools below are for multi-model analysis, deep review, or unparsed native Harbor information. Only the local Job / Trial path is passed when launching; external tools control their own network and data policies.",
  "当前 Trial 没有可用轨迹": "The current Trial has no usable trajectory",
  "从 npm 安装 RLViz 后打开当前 Job": "Install RLViz from npm, then open the current Job",
  "请先安装对应命令": "Install the corresponding command first",
  "请先安装 Node.js LTS": "Install Node.js LTS first",
  "复制": "Copy",
  "命令已复制": "Command copied",
  "启动失败": "Launch failed",
  "未检测到完整的 Node.js 基础环境，请先安装 Node.js LTS 后刷新本页。": "A complete Node.js environment was not detected. Install Node.js LTS, then refresh this page.",
  "将通过 npm 从公开仓库安装 RLViz，并在完成后打开当前 Job。是否继续？": "RLViz will be installed from the public npm registry and the current Job will open afterward. Continue?",
  "RLViz 已安装，但当前门户尚未检测到命令。请关闭并重新打开门户后重试。": "RLViz is installed, but the portal cannot detect the command yet. Restart the portal and try again.",
  "RLViz 安装失败": "RLViz installation failed",
  "读取 Trial 失败": "Failed to read Trial",
  "读取 Trial 内容失败": "Failed to read Trial content",
  "读取对比内容失败": "Failed to read comparison content",
  "无法读取 Harbor Job": "Unable to read Harbor Job",
  "目录已加载": "Directory loaded",
  "目录加载失败": "Failed to load directory",
  "目录已切换": "Directory changed",
  "系统文件夹选择不可用，请手动填写路径": "The system folder picker is unavailable; enter the path manually",
  "未知错误": "Unknown error",
  "页面加载失败": "Page failed to load",
  "请刷新页面重试；如果问题持续出现，请保留下方错误信息。": "Refresh and try again. If the problem persists, keep the error information below.",
  "重新加载": "Reload",
  " · 当前只有 Regrade，统计仅供评分器复核": " · only Regrades are available; statistics are for verifier review",
  "较基准 —": "vs. baseline —",
  "例如 D:\\github\\agentic-office-evals\\harbor-jobs": "e.g. D:\\github\\agentic-office-evals\\harbor-jobs",
  "两侧都没有 Agent 日志": "Neither side has an Agent log",
  "搜索两侧日志": "Search both logs",
  "未记录": "Not recorded",
  "未记录耗时": "Duration not recorded",
  "保存位置": "Save location",
  "采集结果": "Collection result",
  "查看当前页面未解析的 Harbor 原生字段和完整 Job 结构": "View unparsed Harbor-native fields and the complete Job structure",
  "查看完整原始字段": "View all raw fields",
  "查看下一个 Trial": "View next Trial",
  "差异": "Difference",
  "成功": "Success",
  "此 Trial 没有 Agent 轨迹；请查看交付物与原始日志": "This Trial has no Agent trajectory; check artifacts and raw logs",
  "存在差异": "Has differences",
  "当前 Trial": "Current Trial",
  "调用参数": "Call arguments",
  "对比结果": "Comparison result",
  "费用": "Cost",
  "服务": "Service",
  "根据当前步骤与下一个 Agent 轨迹时间戳的差值估算，包含模型思考、命令执行和等待时间": "Estimated from the gap between this and the next Agent trajectory timestamp; includes model thinking, command execution, and waiting",
  "轨迹 Schema": "Trajectory schema",
  "环境配置": "Environment configuration",
  "缓存 Token": "Cached tokens",
  "回复": "Reply",
  "间隔差 B−A": "Interval difference B−A",
  "间隔耗时": "Interval duration",
  "交付物采集失败，请查看上方采集状态": "Artifact collection failed; check the collection status above",
  "交付物数量": "Artifact count",
  "阶段": "Phase",
  "仅 A": "A only",
  "仅 B": "B only",
  "仅看未通过": "Failed checks only",
  "仅看差异": "Differences only",
  "仅显示含未通过评分项的 Trial": "Show only Trials with failed checks",
  "仅显示运行异常 Trial": "Show only failed Trials",
  "来源": "Source",
  "两侧结构化执行过程一致；切换到“显示全部”可查看完整步骤": "The structured processes match; switch to “Show all” to view every step",
  "两侧日志一致；切换到“显示全部”可查看完整日志": "The logs match; switch to “Show all” to view the complete logs",
  "没有 reward-details.json；该 Trial 可能使用了自定义评分器或只写入了总分。": "No reward-details.json; this Trial may use a custom scorer or record only the total score.",
  "没有可显示的日志": "No logs to display",
  "没有可显示的执行步骤": "No execution steps to display",
  "没有匹配的日志行": "No matching log lines",
  "门槛检查失败": "Gate check failed",
  "模型 / 推理": "Model / reasoning",
  "模型 A": "Model A",
  "模型 B": "Model B",
  "内容摘要": "Content summary",
  "配置不同": "Configuration differs",
  "评分来源": "Score source",
  "请选择有交付物的 Trial": "Select a Trial with artifacts",
  "上一处": "Previous",
  "尚未开始": "Not started",
  "深度逐步审阅、标注并制作汇报；首次启动会自动下载": "Review and annotate steps in depth and create a report; the first launch downloads it automatically",
  "时间": "Time",
  "收起": "Collapse",
  "输出 Token": "Output tokens",
  "输入 Token": "Input tokens",
  "跳过": "Skipped",
  "通过": "Passed",
  "同时对齐多个模型的完整行为轨迹；Portal 可横向查看 2–4 个 Trial，并对其中两个做深度对比": "Align complete behavior trajectories across models; the Portal compares 2–4 Trials and provides a deep comparison for two",
  "推理 Token": "Reasoning tokens",
  "为空": "Empty",
  "未读取到 Trial 层级总分。各步骤评分仍可查看，最后一步分数不代表整个 Trial 的总分。": "No Trial-level total score was found. Step scores remain available; the final step score is not the Trial total.",
  "未知": "Unknown",
  "未知执行器": "Unknown executor",
  "无法生成交付物对比预览": "Unable to generate artifact comparison preview",
  "无法生成交付物预览": "Unable to generate artifact preview",
  "无模型 / 未记录": "No model / not recorded",
  "无文件": "No file",
  "细节不同": "Details differ",
  "下一处": "Next",
  "下载": "Download",
  "相邻 Agent 轨迹时间戳差值（估算）": "Adjacent Agent trajectory timestamp gap (estimated)",
  "修改": "Modified",
  "业务动作": "Business action",
  "业务步骤": "Business step",
  "一致": "Match",
  "不同": "Different",
  "异常信息": "Error information",
  "预览": "Preview",
  "预览仅展示部分内容；完整内容请分别下载文件后查看。": "The preview shows only part of the content; download each file to view it in full.",
  "运行阶段时间线": "Run phase timeline",
  "运行状态": "Run status",
  "在本机启动": "Launch locally",
  "展开": "Expand",
  "这个 Trial 没有保存交付物": "This Trial has no saved artifacts",
  "这一侧没有对应事件": "No corresponding event on this side",
  "正在读取交付物": "Reading artifacts",
  "正在读取两份交付物": "Reading both artifacts",
  "正在加载轨迹元数据": "Loading trajectory metadata",
  "正在加载原始日志": "Loading raw logs",
  "正在加载执行过程": "Loading execution process",
  "执行结果": "Execution result",
  "中文": "Chinese",
  "主容器": "Main container",
  "资源消耗": "Resource usage",
  "字段": "Field",
  "A 行": "A row",
  "Agent 版本": "Agent version",
  "Agent 步骤": "Agent step",
  "Agent 配置": "Agent configuration",
  "Agent 输出": "Agent output",
  "环境准备": "Environment setup",
  "Agent 准备": "Agent setup",
  "Agent 执行": "Agent execution",
  "交付物采集": "Artifact collection",
  "Artifacts采集": "Artifact collection",
  "交付物已采集；Harbor manifest 未记录该阶段起止时间": "Artifacts collected; Harbor manifest did not record this phase's start/end time",
  "交付物采集失败；Harbor 未记录该阶段耗时": "Artifact collection failed; Harbor did not record this phase's duration",
  "没有采集到交付物；Harbor 未记录该阶段耗时": "No artifacts were collected; Harbor did not record this phase's duration",
  "B 行": "B row",
  "B 与 A 的相邻轨迹时间戳间隔差值": "B−A adjacent trajectory timestamp gap",
  "Harbor Viewer（原生查看）": "Harbor Viewer (native view)",
  "Regrade 分数变化": "Regrade score change",
  "Regrade 原评分": "Original Regrade score",
  "Task 版本": "Task version",
  "Task 来源": "Task source",
  "Task 配置": "Task configuration",
  "Verifier 模式": "Verifier mode",
  "Verifier 配置": "Verifier configuration",
  "可对比结果": "Comparable results",
  "个模型": "models",
  "运行完成": "Completed",
  "未找到 Trial": "Trial not found",
  "Reward 维度": "Reward dimensions",
  "个": "",
  "检查结果": "Check results",
  "基础环境": "Prerequisites",
  "版本": "Version",
  "请先安装 Node.js LTS，完成后点击页面顶部的刷新按钮重新检测。": "Install Node.js LTS, then click Refresh at the top of the page to check again.",
};

const mixedTranslationEntries = Object.entries(translations)
  .filter(([key]) => key.length > 2 || /[^\u4e00-\u9fff]/.test(key))
  .sort(([left], [right]) => right.length - left.length);

function translateMixed(value: string): string | undefined {
  let translated = value;
  for (const [source, target] of mixedTranslationEntries) {
    if (translated.includes(source)) translated = translated.split(source).join(target);
  }
  return translated === value ? undefined : translated;
}

function translateDynamic(value: string): string | undefined {
  let match = value.match(/^第 (\d+)\/(\d+) 次尝试$/);
  if (match) return `Attempt ${match[1]} of ${match[2]}`;
  if ((match = value.match(/^查看 (.+) 的异常 Trial$/))) return `View failed Trials for ${match[1]}`;
  if ((match = value.match(/^查看 (.+) 中包含未通过评分项的 Trial$/))) return `View Trials with failed checks in ${match[1]}`;
  if ((match = value.match(/^运行批次（(\d+)）$/))) return `Run batches (${match[1]})`;
  if ((match = value.match(/^筛选运行批次 (.+)$/))) return `Filter run batch ${match[1]}`;
  if ((match = value.match(/^发现\s*(\d+)\s*个 Job、\s*(\d+)\s*个 Trial；跳过\s*(\d+)\s*个 Job、\s*(\d+)\s*个 Trial。$/))) return `Found ${match[1]} Jobs and ${match[2]} Trials; skipped ${match[3]} Jobs and ${match[4]} Trials.`;
  if ((match = value.match(/^发现$/))) return "Found";
  if ((match = value.match(/^个 Job、$/))) return "Jobs and";
  if ((match = value.match(/^个 Trial；跳过$/))) return "Trials; skipped";
  if ((match = value.match(/^个 Trial。$/))) return "Trials.";
  if ((match = value.match(/^(.+?)\s*·\s*(\d+)\s*个 Task$/))) return `${match[1]} · ${match[2]} Tasks`;
  if ((match = value.match(/^(\d+)\s*个 Task$/))) return `${match[1]} Tasks`;
  if ((match = value.match(/^(.+?)\s*·\s*共\s*(\d+)\s*批$/))) return `${match[1]} · ${match[2]} batches`;
  if ((match = value.match(/^·\s*共\s*(\d+)\s*批$/))) return `· ${match[1]} batches`;
  if ((match = value.match(/^(\d+)\s*个 Job\s*·\s*(\d+)\s*个 Trial$/))) return `${match[1]} Jobs · ${match[2]} Trials`;
  if ((match = value.match(/^(.+?)\s*·\s*(\d+)\s*个 Trial$/))) return `${match[1]} · ${match[2]} Trials`;
  if ((match = value.match(/^来自\s*(\d+)\s*个 Trial，累计\s*(\d+)\s*个未通过评分项$/))) return `From ${match[1]} Trials, ${match[2]} failed checks in total`;
  if ((match = value.match(/^只找到\s*(\d+)\s*个可用 Trial，至少需要两个。$/))) return `Only ${match[1]} usable Trials found; at least two are required.`;
  if ((match = value.match(/^已选 Trial 中存在\s*(\d+)\s*个不同的 task checksum。$/))) return `${match[1]} different task checksums exist among the selected Trials.`;
  if ((match = value.match(/^存在\s*(\d+)\s*项问题$/))) return `${match[1]} issues found`;
  if ((match = value.match(/^未检测到：(.+)。请先安装 Node.js LTS，完成后点击页面顶部的刷新按钮重新检测。$/))) return `Not detected: ${match[1]}. Install Node.js LTS, then click Refresh at the top of the page.`;
  if ((match = value.match(/^安装并启动 (.+)$/))) return `Install and launch ${match[1]}`;
  if ((match = value.match(/^启动 (.+)$/))) return `Launch ${match[1]}`;
  if ((match = value.match(/^复制 (.+) 启动命令$/))) return `Copy ${match[1]} launch command`;
  if ((match = value.match(/^步骤 (.+) 的评分明细$/))) return `Score details for step ${match[1]}`;
  if ((match = value.match(/^未通过评分项 (\d+)$/))) return `${match[1]} failed checks`;
  if ((match = value.match(/^ · 已排除 (\d+) 个 Regrade$/))) return ` · ${match[1]} Regrades excluded`;
  if ((match = value.match(/^查看解析问题（(\d+)）$/))) return `View parsing issues (${match[1]})`;
  if ((match = value.match(/^较基准 (.+)$/))) return `vs. baseline ${match[1]}`;
  if ((match = value.match(/^Reward 维度（(\d+)）$/))) return `Reward dimensions (${match[1]})`;
  if ((match = value.match(/^多步骤结果（(\d+)）$/))) return `Multi-step results (${match[1]})`;
  if ((match = value.match(/^仅看差异 (\d+)$/))) return `Differences only (${match[1]})`;
  if ((match = value.match(/^显示全部 (\d+)$/))) return `Show all (${match[1]})`;
  if ((match = value.match(/^(收起|展开) (.+) 第 (\d+) 步 (.+)$/))) return `${match[1] === "收起" ? "Collapse" : "Expand"} ${match[2]} step ${match[3]} ${match[4]}`;
  if ((match = value.match(/^没有(.+)技术信息$/))) return `No technical information for ${match[1]}`;
  if ((match = value.match(/^交付物采集状态（(\d+)）$/))) return `Artifact collection status (${match[1]})`;
  if ((match = value.match(/^预览 (.+) 的 (.+)$/))) return `Preview ${match[2]} for ${match[1]}`;
  if ((match = value.match(/^下载 (.+) 的 (.+)$/))) return `Download ${match[2]} for ${match[1]}`;
  if ((match = value.match(/^交付物预览 · (.+)$/))) return `Artifact preview · ${match[1]}`;
  if ((match = value.match(/^(.+) · ([\d,]+) 字节$/))) return `${match[1]} · ${match[2]} bytes`;
  if ((match = value.match(/^A · (.+)$/))) return `A · ${match[1]}`;
  if ((match = value.match(/^B · (.+)$/))) return `B · ${match[1]}`;
  if ((match = value.match(/^(.+) · (.+) · 未找到 Trial$/))) return `${match[1]} · ${match[2]} · Trial not found`;
  if ((match = value.match(/^(.+) · (.+) · 运行异常$/))) return `${match[1]} · ${match[2]} · Execution error`;
  if ((match = value.match(/^(.+) · (.+) · 无评分$/))) return `${match[1]} · ${match[2]} · Unscored`;
  if ((match = value.match(/^(.+) · (.+) · 运行完成 · 得分 (.+)$/))) return `${match[1]} · ${match[2]} · Completed · Score ${match[3]}`;
  if ((match = value.match(/^(.+) · 可对比结果 (\d+) · (\d+) 个模型 · 共 (\d+) 个 Trial$/))) return `${match[1]} · ${match[2]} comparable · ${match[3]} models · ${match[4]} Trials total`;
  if ((match = value.match(/^只找到 (\d+) 个可用 Trial，至少需要两个。$/))) return `Only ${match[1]} usable Trials found; at least two are required.`;
  return undefined;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setActiveLocale(locale: Locale): void {
  currentLocale = locale;
}

export function tr(value: string, locale: Locale = currentLocale): string {
  if (locale === "zh" || !value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length || undefined);
  return `${leading}${translations[core] ?? translateDynamic(core) ?? translateMixed(core) ?? core}${trailing}`;
}

/**
 * Translate text discovered in the rendered DOM conservatively.
 *
 * DOM text may be UI copy or user/business data. Exact UI messages and the
 * explicitly supported dynamic templates are safe to translate; arbitrary
 * substring replacement is reserved for explicit `tr()` calls in application
 * code so identifiers and verifier evidence remain byte-for-byte readable.
 */
export function trDom(value: string, locale: Locale = currentLocale): string {
  if (locale === "zh" || !value) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(leading.length, value.length - trailing.length || undefined);
  return `${leading}${translations[core] ?? translateDynamic(core) ?? core}${trailing}`;
}

type TextState = { source: string; translated: string };
const textStates = new WeakMap<Text, TextState>();
const attributeStates = new WeakMap<Element, Map<string, TextState>>();
const translatedAttributes = ["title", "placeholder", "aria-label", "alt"];

function shouldSkip(element: Element | null): boolean {
  return Boolean(element?.closest("pre, code, textarea, script, style, [data-i18n-raw], .json-view, .log-view, .artifact-text-preview"));
}

function translateTextNode(node: Text, locale: Locale): void {
  const parent = node.parentElement;
  if (!parent || shouldSkip(parent)) return;
  const rendered = node.data;
  const state = textStates.get(node);
  const source = state && rendered === state.translated ? state.source : rendered;
  const translated = trDom(source, locale);
  textStates.set(node, { source, translated });
  if (rendered !== translated) node.data = translated;
}

function translateElement(element: Element, locale: Locale): void {
  if (shouldSkip(element)) return;
  let states = attributeStates.get(element);
  if (!states) {
    states = new Map();
    attributeStates.set(element, states);
  }
  for (const name of translatedAttributes) {
    if (!element.hasAttribute(name)) continue;
    const rendered = element.getAttribute(name) ?? "";
    const state = states.get(name);
    const source = state && rendered === state.translated ? state.source : rendered;
    const translated = trDom(source, locale);
    states.set(name, { source, translated });
    if (rendered !== translated) element.setAttribute(name, translated);
  }
}

function translateTextDescendants(root: Node, locale: Locale): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  nodes.forEach((textNode) => translateTextNode(textNode, locale));
}

function translateSubtree(root: Element | Document, locale: Locale): void {
  if (root instanceof Element) translateElement(root, locale);
  root.querySelectorAll("*").forEach((element) => translateElement(element, locale));
  translateTextDescendants(root, locale);
}

export function observeDomTranslations(locale: Locale): () => void {
  if (typeof document === "undefined") return () => undefined;
  let translating = false;
  const apply = (root: Node) => {
    if (!(root instanceof Element) && !(root instanceof Document)) return;
    translating = true;
    translateSubtree(root, locale);
    translating = false;
  };
  apply(document.body);
  const observer = new MutationObserver((mutations) => {
    if (translating) return;
    translating = true;
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateTextNode(mutation.target as Text, locale);
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) translateSubtree(node, locale);
        if (node instanceof Text) translateTextNode(node, locale);
      });
      if (mutation.type === "attributes" && mutation.target instanceof Element) translateElement(mutation.target, locale);
    }
    translating = false;
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: translatedAttributes });
  return () => observer.disconnect();
}

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (value: string) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const next = initialLocale();
    // Utility formatters can run during the first render, before effects fire.
    // Keep their locale in sync with the provider from the start.
    setActiveLocale(next);
    return next;
  });
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    setActiveLocale(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  };
  useEffect(() => {
    setActiveLocale(locale);
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
      document.title = locale === "en" ? "Harbor Results Explorer" : "Harbor 结果分析";
      document.body.dataset.locale = locale;
      document.querySelector('meta[name="description"]')?.setAttribute(
        "content",
        locale === "en"
          ? "Review and compare Harbor Jobs, scores, artifacts, and Agent trajectories locally."
          : "本地查看和比较 Harbor Job、评分与 Agent trajectory。",
      );
    }
  }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (text: string) => tr(text, locale) }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}

export function useDomTranslations(locale: Locale): void {
  useEffect(() => observeDomTranslations(locale), [locale]);
}
