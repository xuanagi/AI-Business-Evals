# Harbor 使用流程

中文 | [English](workflow.en.md)

本流程适用于“选择 Office 能力方向 → 构建任务 → 多模型评测 → 定位差异”。

## 1. 选择评测方向

先查 [Office 基准索引](../office-benchmarks.md)，结合业务目标明确要测的是表格处理、文档生成、演示文稿、跨应用操作，还是某个行业的专业交付。再从公开 benchmark 或本仓库示例中选择最接近的任务结构。

`examples/harbor-office-tasks` 中的六个任务只是 Harbor 格式示例，不代表 AI Business Evals 所支持业务场景的完整分类或覆盖范围。

不要一开始就把所有 Office 能力混在一道题中。应先确定交付物、关键业务错误和可确定性检查的口径。

## 2. 准备一个 Task

从最接近的示例复制结构，再替换：

1. `instruction.md`：写成真实办公需求；
2. `environment/workspace.tar.gz`：只包含初始工作区和 `input/`，不含答案；
3. `tests/gold/gold_answer.json`：保存期望值、容差和规则；
4. `tests/grading/score.py`：按固定权重和硬门槛将各检查映射为 0 到 1 的分数；
5. `task.toml`：使用唯一的小写名称并设置资源限制。

修改后把任务加入数据集，并在后续修改时刷新 digest：

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

harbor add .\examples\harbor-office-tasks\<任务目录> `
  --to .\examples\harbor-office-tasks

harbor sync .\examples\harbor-office-tasks
```

从 Harbor 初始化命令、输入压缩包制作、gold/评分器设计到单题试跑的完整操作见 [`creating-task.md`](creating-task.md)。

## 3. 先做评分器自检

理想的数据集至少做三组检查：

- 合格成品应高分；
- 明显错误或空文件应低分；
- 单独破坏一个指标时，只影响对应分项。

当前六个示例已经提供动态 oracle 夹具及每类至少一种负向夹具：

```powershell
python -m pytest -q
```

它们没有把可供 Agent 直接运行的 `solution/solve.sh` 放进任务目录，避免随任务工作区泄露成品生成步骤。如果要发布到公共 Harbor registry，应在受控发布流程中另行维护 oracle solution，并完成许可审计和隐藏测试集设计。评分原则见 [`scoring-design.md`](scoring-design.md)。

## 4. 运行一个或多个模型

运行全部六题：

```powershell
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
harbor run `
  -p .\examples\harbor-office-tasks `
  -a codex `
  -m gpt-5.6-luna `
  --ak reasoning_effort=medium `
  -k 3 `
  -n 2 `
  --artifact /workspace/output `
  -o .\harbor-jobs
```

`-k 3` 会让每个 trial 尝试三次，用于观察同一模型的稳定性；`-n 2` 表示最多并发两个 trial。换模型时使用新的 job 名称；不要覆盖前一次 job。若不同提供商需要不同 Agent adapter，应同时替换 `-a` 和 `-m`。

使用脚本的等价方式。脚本要求显式填写 Agent 和模型，不会改写认证环境变量：

```powershell
.\scripts\run-office-cases.ps1 `
  -Agent codex `
  -Model gpt-5.6-luna `
  -ReasoningEffort medium `
  -Attempts 3 `
  -Concurrent 2
```

Linux / macOS 使用参数等价的 Bash 脚本：

```bash
./scripts/run-office-cases.sh \
  --agent codex \
  --model gpt-5.6-luna \
  --reasoning-effort medium \
  --attempts 3 \
  --concurrent 2
```

Harbor 0.22.0 内置 Codex adapter 会在部分 Linux 镜像中通过 NVM 安装 Node.js。若容器网络无法访问 `raw.githubusercontent.com`，可使用仓库内的 `harbor_agents.codex_npm:CodexNpm`，直接借助任务镜像已有的 Node.js/npm 安装 Codex CLI：

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1' # 仅限本机确实使用 Codex 登录文件认证时
.\scripts\run-office-cases.ps1 `
  -Agent harbor_agents.codex_npm:CodexNpm `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -AgentKwarg version=0.153.2 `
  -Attempts 1 `
  -Concurrent 2 `
  -JobName luna-high-office
```

Linux / macOS 的等价命令：

```bash
export CODEX_FORCE_AUTH_JSON=1 # 仅限本机确实使用 Codex 登录文件认证时
./scripts/run-office-cases.sh \
  --agent harbor_agents.codex_npm:CodexNpm \
  --model gpt-5.6-luna \
  --reasoning-effort high \
  --agent-kwarg version=0.153.2 \
  --attempts 1 \
  --concurrent 2 \
  --job-name luna-high-office
```

该项目内 adapter 只覆盖安装步骤，模型参数、认证、执行命令和 ATIF trajectory 转换仍继承 Harbor 的 Codex 实现。任务镜像仍保持 Agent 中立，不预装 Codex。两个 `run-office-cases` 脚本都会把仓库根目录加入 `PYTHONPATH`，因此 Harbor 能导入该 adapter。版本号只是可复现示例；换版本前应先单题试跑。

当前示例的 Agent 和 Verifier 阶段均使用 `public`，以兼容启用了 `DOCKER_INSECURE_NO_IPTABLES_RAW` 的 Windows Docker provider；这种 provider 无法执行 Harbor 的阶段级断网或白名单切换。业务指令仍明确要求只使用任务提供的本地文件，确定性评分器也不包含网络访问。若部署环境支持网络策略，正式评测应把 Agent 收紧为 `allowlist`、Verifier 收紧为 `no-network`。

## 5. 查看 outcome

```powershell
harbor view .\harbor-jobs --jobs
```

先比较每题 reward，再打开 trial 的 `verifier/score.json` 看分项。总分相同不代表能力相同；Office 任务尤其要区分数据正确性、结构完整性、可视化质量和可追溯性。

## 6. 查看 process / trajectory

每个正常完成的 trial 都应包含 `agent/trajectory.json`。它记录消息、工具调用、观察和时间等过程信息。可以用 `harbor view .\harbor-jobs --jobs` 打开内置网页，也可以用 RLViz 打开整个 job。完整命令和比较方法见 [`trajectory-comparison.md`](trajectory-comparison.md)。

仓库还提供统一的本地 Portal，可直接选择 Job、对比分项评分和原始过程，并从页面启动已安装的外部工具：

Windows 用户可直接双击仓库根目录的 `start-trajectory-portal.bat`，无需输入命令。

```powershell
.\scripts\start-trajectory-portal.ps1
```

```bash
./scripts/start-trajectory-portal.sh
```

Portal 只绑定 `127.0.0.1`，默认读取 `harbor-jobs`，不会上传 trajectory。

## 7. 固化与扩展

每次更改任务后：

1. 运行 `python scripts/sync_grading.py` 同步公共评分器（如果改过评分逻辑）；
2. 运行 `harbor sync .\examples\harbor-office-tasks` 更新 dataset digest；
3. 运行跨平台校验器和 pytest；
4. Docker 启动后运行 `.\scripts\validate-harbor.ps1 -Docker`（Linux / macOS 使用 `./scripts/validate-harbor.sh --docker`），再用至少一个已知 Agent 做 smoke test；
5. 记录题目来源、文件修改与许可证；
6. 提交 Task、manifest 和文档，但不要提交带密钥的 job 日志。

`harbor-jobs/` 是运行产物，不是数据集。需要跨机器比较时，可以单独归档 job 目录或上传到专门的结果存储。
