# 使用 Harbor 评测 HTTP 应用

中文 | [English](http-evaluation.en.md)

Harbor 仍是唯一执行底座。`HttpJsonAgent` 实现 Harbor 的自定义 Agent 接口，
但不调用模型：它读取任务输入、发送 JSON POST、保存响应，再由 Task 自己验收。
已按 Harbor **0.22.0 / Python 3.12** 的接口验证。

```text
Task input.json → HttpJsonAgent → HTTP 应用 / 算法
                                    ↓
Task verifier ← output/response.json
      ↓
Harbor Job / Trial → 现有 Portal
```

## 跑通本地示例

需要 Python、[uv](https://docs.astral.sh/uv/getting-started/installation/) 和已启动的 Docker daemon。
两个终端均先进入仓库根目录。无需模型账号或 API key。

终端一，运行无状态教学服务（只监听本机）：

```sh
python examples/http-reconciliation-service.py
```

终端二，设置本仓库的 Python 导入路径。

PowerShell：

```powershell
$env:PYTHONPATH = "$($PWD.Path)" + [IO.Path]::PathSeparator + $env:PYTHONPATH
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
```

Bash：

```bash
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
```

下面的单行命令适用于两种终端：

```sh
uv run --python 3.12 --with harbor==0.22.0 harbor run --path examples/harbor-http-tasks/http-reconciliation --agent harbor_agents.http_json:HttpJsonAgent --agent-kwarg endpoint=http://127.0.0.1:8766/reconcile --agent-kwarg target_version=demo-v1 --jobs-dir harbor-jobs --artifact /workspace/output --max-retries 0
```

请求从 **Harbor 所在主机** 发出，而不是容器。所以此处 `127.0.0.1` 指运行 Harbor
的机器，不需要 `host.docker.internal`。任务输入通过环境文件接口下载，响应再上传回环境。
服务必须在整个评测期间保持运行，完成后在终端一按 Ctrl+C 停止。

预期 reward 为 1。启动现有 Portal，查看新 Job 的评分、交付物和原始日志：

- `response.json`：业务响应；
- `http-call.json`：状态码、HTTP 调用耗时、响应大小、被测版本；
- `http-call.jsonl`：同一调用的日志摘要，不记录认证头；
- `score.json`：业务检查明细，由 verifier 生成。

HTTP 示例没有模型、token 或 ATIF 对话轨迹，不应将它们当作缺失的执行证据。
Portal 的执行用时包含输入下载、请求和响应上传，`request_seconds` 只测请求至响应读取完成，
也不是服务内部的纯计算耗时。

## 用同一 Task 验证另一种实现

Task 附有本地 oracle 实现，不调用 HTTP 服务，也不读取 gold：

```sh
uv run --python 3.12 --with harbor==0.22.0 harbor run --path examples/harbor-http-tasks/http-reconciliation --agent oracle --jobs-dir harbor-jobs --artifact /workspace/output --max-retries 0
```

HTTP 服务与 oracle 产生相同的业务 JSON，由同一个 verifier 验收。
也可以用普通 Agent 执行这道题，按其要求配置模型和认证即可。
这是原创的小型对账示例，不是原 Office 采购对账任务的完整接口移植，也不代表生产覆盖。

## 接入自己的业务：改三处

1. **输入**：复制示例 Task，修改 `environment/input.json`、`instruction.md` 和任务名称。
2. **调用**：符合 JSON POST → JSON 的接口只需修改 `endpoint`；字段映射、异步轮询等特殊流程，直接修改或派生适配器。
3. **验收**：修改 `tests/evaluator.py`，并补充正确结果和典型错误结果的回归测试。

默认约定只有 `/workspace/input.json` 和 `/workspace/output/response.json` 两个业务文件路径。
目前只提供同步 POST，不做通用工作流、插件注册、自动字段映射或业务评分配置语言。
多条独立用例可以组织成多个 Task，再由 Harbor 批量执行；示例中的五个订单是一个业务输入，
不是五次独立 Trial。生产场景的数据抽样、隐藏测试、状态复位由场景自行扩展。

## 认证、错误与边界

- 可用 `--agent-kwarg token_env=MY_SERVICE_TOKEN` 读取 **Harbor 主机进程环境**中的 Bearer token。
  认证请求要求 HTTPS。只传环境变量名称，不要把 token 放进命令、endpoint 查询参数或 Task。
  不支持通过 Harbor 的容器 `extra_env` 注入此 token。
- 可用 `--agent-kwarg timeout=30` 设置请求 socket 超时；Task 的 `agent.timeout_sec` 限制执行阶段。
  socket 超时不是整个远端任务的硬截止时间，取消本地等待不保证远端停止处理。
- 不跟随重定向，不自动重试。示例还用 `--max-retries 0` 关闭 Harbor 重试，避免重复副作用。
  对有状态接口，请在场景内设计幂等和清理逻辑，勿直接对生产业务试跑。
- 非 2xx、网络错误、超时、超限或无效 JSON 是执行异常，抛给 Harbor；合法 JSON 但业务错误由 verifier 评分。
  verifier 的意外程序异常不伪装成业务零分。
- 响应上限默认 10 MB。请求正文不额外落盘到日志，但输入与响应本身可能含业务敏感数据，
  分享 Task、Job 或 Portal 快照前需检查脱敏与授权。
- `target_version` 是用户声明的被测服务版本，不会自动验证远端部署；请使用可追溯版本标识。
  远端状态、依赖与资源不受本地容器自动隔离，跨实现比较前需自行控制这些条件。

## 回归测试

不需要启动 Docker 即可验证真实 HTTP 调用、业务正反例和 Harbor 接口适配：

```sh
uv run --python 3.12 --with harbor==0.22.0 --with pytest==8.3.4 python -m pytest tests/test_http_evaluation.py -q
```

其中环境文件传输使用测试替身；完整容器链路仍需运行上面的两条 `harbor run` 命令。
