# Harbor 结果分析

中文 | [English](README.en.md)

这是一个只在本机运行的 Harbor 结果与过程分析工具。它读取 `harbor-jobs`，通过三个职责独立的页面展示 Job 总览、单个 Trial 和 Trial 对比；对比页支持横向查看 2–4 个 Trial，并选择其中两个做深度对比。它还提供 Harbor Viewer、RLViz、AgentViz 的受控启动入口。

## 启动

Windows：

直接双击仓库根目录的 `start-trajectory-portal.bat`。启动后浏览器会自动打开；使用期间不要关闭命令窗口，关闭窗口即停止服务。

也可以从 PowerShell 启动：

```powershell
.\scripts\start-trajectory-portal.ps1
```

Linux / macOS：

```bash
./scripts/start-trajectory-portal.sh
```

默认读取仓库根目录的 `harbor-jobs`，并打开 `http://127.0.0.1:8765`。也可以指定其他目录：

```powershell
.\scripts\start-trajectory-portal.ps1 -Root D:\evals\harbor-jobs -Port 8877
```

页面只绑定 `127.0.0.1`，不会上传结果。选择文件夹按钮依赖本机 Python 的 Tk 支持；不可用时可以直接填写路径。

## 页面能力

- **运行概览**（`/overview`）：汇总 Job、模型、数据集、Task 覆盖、推理强度、完成情况、均分和异常，并从运行记录进入详情或对比；
- **Trial 详情**（`/trial`）：审阅单次运行的评分项、完整执行过程、交付物、外部工具、原始日志和运行元数据；兼容 Harbor 单步与 `steps/<name>/...` 多步结果；
- **Trial 对比**（`/compare`）：先选择相同 Task，再从运行过该 Task 的 Job 中选择 2–4 个 Trial；
- 使用 Harbor 的 `task_checksum` 检查任务定义和输入是否一致，不一致时提示不可直接比较；
- 对比分项 `score.json` 及失败证据；
- 展示工具调用过程，将同一步中的多个调用分别关联到各自结果，并标记调用参数或执行结果的差异；
- 预览或下载 Harbor 已保存的 artifact；
- 查看 Agent 日志和运行元数据；
- 检测并受控启动 Harbor Viewer、RLViz 和 AgentViz。

过程对比是结构化辅助判断，不等同于语义层面的 first meaningful divergence。是否造成业务问题，仍需结合评分项和最终成品判断。

运行记录中的“查看 Trial”和“对比”会打开对应页面；Trial 详情页也可以将当前运行直接带入对比页。页面会把当前 Job、Trial 和 Task 写入 URL，便于刷新后恢复和复制定位链接。

## 语言

页面右上角的 `EN` / `中文` 按钮可以切换界面语言。选择会保存在当前浏览器中；首次访问时，如果浏览器使用英文语言，则默认显示英文。切换会同步更新页面标签、状态、日期、数字格式、工具提示和无障碍标签；日志、JSON、代码和交付物中的原始内容保持不变。

## 外部工具安装

- `Harbor Viewer` 由已安装的 Harbor 命令启动，并自动打开本地 Viewer 页面。
- 未安装 `RLViz` 时，页面显示“安装并启动”。确认后，Portal 才会通过 `npm install --global rlviz --no-audit --no-fund` 从 npm 安装，并继续打开当前 Job。
- `AgentViz` 不要求全局安装；首次点击“启动”时，`npx --yes agentviz` 会下载所需包后打开当前 Trial 的轨迹。多步 Trial 会先要求选择具体步骤，避免误打开错误轨迹。
- RLViz 与 AgentViz 均依赖 `Node.js`、`npm` 和 `npx`。缺少其中任一项时，页面会说明缺少的基础环境；请先安装 Node.js LTS，再点击页面顶部“刷新”重新检测。Portal 不会自动安装 Node.js。

## 前端开发

前端使用 React、TypeScript、Ant Design 和 Apache ECharts。普通使用者不需要安装前端依赖；仓库已经保存构建结果。修改前端时运行：

```bash
cd tools/trajectory-portal
npm install
npm test
npm run build
```

开发模式下，分别运行 Python API 和 Vite：

```bash
python server.py --root ../../harbor-jobs --no-open
npm run dev
```

构建后必须同时提交 `src/` 和 `dist/`，避免用户为了打开本地 Portal 再安装 Node.js。

## 安全边界

- 服务固定监听 `127.0.0.1`；
- 所有会改变状态的接口都要求同源 `application/json` 请求；
- 外部进程只允许 Harbor Viewer、RLViz 和 AgentViz；
- Job 和 Trial 路径必须位于当前选择的根目录内；
- 页面不会读取 Codex 认证文件，也不会上传 trajectory；
- RLViz 或 AgentViz 是否进一步处理、导出或分享数据，取决于对应工具，使用前仍应检查脱敏和授权。
