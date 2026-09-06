# 项目内 Harbor Agent adapters

中文 | [English](README.en.md)

这里存放项目自定义的 Harbor adapter，不属于任务数据集，也不会被打包进 Task 镜像。

`http_json.py` 中的 `HttpJsonAgent` 将普通 JSON HTTP 服务接入 Harbor，不调用模型。
它只负责调用与结果保存，业务验收仍属于 Task。参见 [HTTP 评测接入说明](../docs/harbor/http-evaluation.md)。

`codex_npm.py` 中的 `CodexNpm` 继承 Harbor 0.22.0 的 Codex adapter，仅把依赖 NVM/GitHub 下载脚本的安装过程替换为系统 Node.js/npm 安装。模型配置、认证、执行命令、结果统计和 ATIF trajectory 转换仍由 Harbor 实现。

在仓库根目录运行：

```powershell
$env:CODEX_FORCE_AUTH_JSON = '1' # 仅限本机使用 Codex 登录文件认证时
.\scripts\run-office-cases.ps1 `
  -Agent harbor_agents.codex_npm:CodexNpm `
  -Model gpt-5.6-luna `
  -ReasoningEffort high `
  -AgentKwarg version=0.153.2
```

如容器能够正常运行 Harbor 内置安装流程，仍可直接使用 `-Agent codex`。

Linux / macOS 使用等价的 Bash 入口：

```bash
export CODEX_FORCE_AUTH_JSON=1 # 仅限本机使用 Codex 登录文件认证时
./scripts/run-office-cases.sh \
  --agent harbor_agents.codex_npm:CodexNpm \
  --model gpt-5.6-luna \
  --reasoning-effort high \
  --agent-kwarg version=0.153.2
```
