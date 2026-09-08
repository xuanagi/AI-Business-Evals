# 多模型 trajectory 对比

中文 | [English](trajectory-comparison.en.md)

Harbor 默认不只保存结果。Agent adapter 支持时，每个 trial 会同时保存标准 ATIF 轨迹和 Agent 原生会话，因此可以回答“模型为什么在这里开始产生差异”。

## 建议的工具分工

| 工具 | 用途 | 适合阶段 |
| --- | --- | --- |
| `harbor view` | 浏览 job、分数、日志和单条轨迹 | 日常快速检查 |
| [RLViz](https://github.com/TheSnakeFang/rlviz) | 对多条 Harbor trajectory 做行为对齐，定位首个有意义的分叉 | 正式多模型差异分析 |
| [AgentViz](https://github.com/jayparikh/agentviz) | 并排查看轨迹、筛选步骤并导出 HTML | 汇报和人工审阅 |

首选 RLViz 作为通用比较层。它直接面向 Harbor job 和 ATIF，不必先开发一套通用轨迹查看器。AgentViz 可以作为更轻的展示补充。

如果希望通过图形界面完成 Job 筛选、单次运行审阅、原始过程对比和外部工具启动，可以使用仓库内的 [Harbor 结果分析](../../tools/trajectory-portal/README.md)。Portal 分为运行概览、Trial 详情和 Trial 对比三个页面，避免把全局统计、单次排查和双模型对比混在一个长页面中：

Windows 用户可直接双击仓库根目录的 `start-trajectory-portal.bat`。启动后会自动打开浏览器，使用期间保留命令窗口；关闭窗口即可停止本地 Portal。

```powershell
.\scripts\start-trajectory-portal.ps1
```

```bash
./scripts/start-trajectory-portal.sh
```

Portal 默认读取 `harbor-jobs`，只监听本机地址。页面能够标记第一个工具名称或参数不同的原始分叉；正式判断 first meaningful divergence 时，仍应使用 RLViz 或结合业务阶段人工检查。

在 Trial 对比页中应先选择 Task，再从运行过该 Task 的 Job 中选择 2–4 个 Trial；深度查看过程或日志时，从已选 Trial 中指定两个。Task 名称相同后，页面还会检查 Harbor 保存的 `task_checksum`；名称和 checksum 一致是直接比较的前提，资源、模型配置等运行条件也应按比较目的控制。需要先理解某一次运行时，应从运行概览进入 Trial 详情页，再使用“与另一个 Trial 对比”进入对比页。完整页面能力与外部工具安装说明见 [Portal 使用说明](../../tools/trajectory-portal/README.md)。

## 先找到 trajectory

列出最近的 job 和其中全部标准轨迹：

```powershell
Get-ChildItem .\harbor-jobs -Directory |
  Sort-Object LastWriteTime -Descending |
  Select-Object Name, LastWriteTime

Get-ChildItem .\harbor-jobs\<job-name> `
  -Recurse `
  -Filter trajectory.json |
  Select-Object FullName
```

标准路径是：

```text
harbor-jobs/<job-name>/<trial-name>/agent/trajectory.json
```

同一个 trial 的 `result.json` 保存运行结果，`verifier/score.json` 保存评分证据，`artifacts/workspace/output/` 保存通过 `--artifact /workspace/output` 下载的 Office 成品。

## 方法一：Harbor 内置 Viewer

不需要另外安装工具：

```powershell
harbor view .\harbor-jobs --jobs
```

Harbor 会选择 8080–8089 中可用的端口，并在本机启动网页。终端会打印实际地址；通常可访问 `http://127.0.0.1:8080`。在页面中选择 job、task 和 trial，即可查看消息、工具调用、日志、reward 和 trajectory。

指定端口：

```powershell
harbor view .\harbor-jobs --jobs --port 8090
```

这个工具适合查看单次运行和快速确认文件是否保存完整。

## 方法二：RLViz 对比多个模型

在把 job 交给任何第三方工具、上传 Harbor Hub、导出 HTML 或发给同事前，先复制一份并检查脱敏。trajectory、原生 session、Agent 日志和 artifact 可能包含输入文件内容、文件名、用户名、提示词、模型响应、环境变量片段和业务数据；`score.json` 也可能泄露隐藏 gold。真实客户数据不应上传到公共服务，公开分享时至少删除密钥、个人信息、客户标识、内部路径和未授权附件。

Windows 上可通过 npm 安装：

```powershell
npm install --global rlviz
rlviz formats
```

先只检查 job 能否识别：

```powershell
rlviz inspect .\harbor-jobs\<job-name>
```

再打开本地网页：

```powershell
rlviz open .\harbor-jobs\<job-name>
```

RLViz 可以直接读取完整 Harbor job，而不只是单个 JSON；它会组合 trial、trajectory、reward、token/cost、失败信息和 artifact，并提供行为对齐与 first meaningful divergence。本地查看不会修改原 job，但把 job 交给远程服务或共享 HTML 仍属于数据外发，应先完成上述脱敏与授权检查。

比较两个模型时，分别保留两个 job，然后在 RLViz 中把相同 Task 的 trial 加入 Compare 工作区。先按 task 和模型筛选，再查看首个有意义分叉以及其后的工具调用。

如果只想分析一条轨迹，也可以：

```powershell
rlviz open .\harbor-jobs\<job-name>\<trial-name>\agent\trajectory.json
```

## 方法三：AgentViz 查看或汇报

无需全局安装：

```powershell
npx agentviz .\harbor-jobs\<job-name>\<trial-name>\agent\trajectory.json
```

浏览器打开后可在 Review、Investigate、Analyze、Compare 等视图中检查工具调用、错误与时间线。它更适合人工逐步回放，或者将选定的本地 session 制作成 HTML 汇报；正式的多 job 行为对齐仍优先使用 RLViz。

## 一次有效的比较

1. 对相同 dataset、任务版本和资源限制运行多个模型；
2. 每个模型至少重复 3 次，避免把一次随机失误当作能力结论；
3. 先根据 `score.json` 找到具体差异维度；
4. 在 RLViz 中对齐对应 trial；
5. 找第一个影响后续结果的行为差异，而不是只比较最后一条消息；
6. 回到交付物验证这个分叉是否真的造成业务错误。

Office 轨迹可以进一步按业务阶段标注：

```text
发现输入 → 检查结构 → 清洗/计算 → 生成交付物 → 重新打开并复核
```

例如周报图表失败时，可以区分：模型没有检查源日期、周口径算错、图表引用范围错误，还是生成后没有重新打开验证。
