import type { ToolCall, TrajectoryStep } from "./types";
import { getLocale, tr } from "./i18n";

export function isHttpTrial(trial: { agent?: string; agentConfig?: Record<string, unknown> }): boolean {
  return trial.agent === "http-json" || trial.agent === "harbor_agents.http_json:HttpJsonAgent"
    || trial.agentConfig?.import_path === "harbor_agents.http_json:HttpJsonAgent";
}

export function matchesModel(trial: { model?: string }, model: string): boolean {
  return !model || (trial.model || "__unknown__") === model;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function observationSignature(observation: unknown): string {
  if (observation !== null && typeof observation === "object") {
    const record = observation as Record<string, unknown>;
    if (Array.isArray(record.results)) {
      return canonicalJson({ ...record, results: record.results.map((result: unknown) => {
        if (result === null || typeof result !== "object") return result;
        const { source_call_id: _callId, ...content } = result as Record<string, unknown>;
        return content;
      }) });
    }
  }
  return canonicalJson(observation);
}

export function formatScore(value: number | null | undefined): string {
  return typeof value === "number" ? value.toFixed(3) : "—";
}

export function formatNumber(value: number | null | undefined): string {
  return typeof value === "number" ? new Intl.NumberFormat(getLocale() === "en" ? "en-US" : "zh-CN").format(value) : "—";
}

export function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number") return "—";
  if (getLocale() === "en") {
    if (seconds < 10) return `${seconds.toFixed(1)} sec`;
    if (seconds < 60) return `${seconds.toFixed(0)} sec`;
    return `${(seconds / 60).toFixed(1)} min`;
  }
  if (seconds < 10) return `${seconds.toFixed(1)} 秒`;
  if (seconds < 60) return `${seconds.toFixed(0)} 秒`;
  return `${(seconds / 60).toFixed(1)} 分钟`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString(getLocale() === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleTimeString(getLocale() === "en" ? "en-US" : "zh-CN", { hour12: false });
}

export function compactText(value: unknown, length = 160): string {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "") ?? String(value ?? "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

export interface ProcessEvent {
  key: string;
  /** Human-readable, sequential event number shown in the portal. */
  step: number;
  /** Original ordinal in Harbor's complete conversation transcript. */
  rawStep?: number;
  stepName?: string;
  timestamp: string;
  /** Time until the next recorded agent event. This is an estimate, not pure tool runtime. */
  intervalSeconds: number | null;
  message: string;
  tool: string;
  arguments: unknown;
  observation: unknown;
  metrics: Record<string, unknown>;
  status: ProcessStatus;
  signature: string;
}

export type ProcessStatus = "success" | "failure" | "reply" | "unknown";

export type ProcessDifference = "same" | "detail" | "left-only" | "right-only";

export interface AlignedProcessEvent {
  key: string;
  step: number;
  action: string;
  left?: ProcessEvent;
  right?: ProcessEvent;
  difference: ProcessDifference;
}

function eventText(event: ProcessEvent): string {
  return `${event.message}\n${JSON.stringify(event.arguments ?? "")}`.toLowerCase();
}

export function messageText(message: TrajectoryStep["message"]): string {
  if (typeof message === "string") return message;
  if (!Array.isArray(message)) return "";
  const separator = getLocale() === "en" ? ": " : "：";
  return message.map((part) => {
    if (part?.type === "text") return part.text ?? "";
    if (part?.type === "image") return part.source?.path ? `[${tr("图片")}${separator}${part.source.path}]` : `[${tr("图片")}]`;
    if (part?.type === "audio") return part.source?.path ? `[${tr("音频")}${separator}${part.source.path}]` : `[${tr("音频")}]`;
    return part?.text ?? "";
  }).filter(Boolean).join("\n");
}

function observationForCall(observation: unknown, callId: string | undefined): unknown {
  if (!callId || typeof observation !== "object" || observation === null) return observation;
  const record = observation as Record<string, unknown>;
  if (!Array.isArray(record.results)) return observation;
  const results = record.results.filter((result) =>
    typeof result === "object" && result !== null && String((result as Record<string, unknown>).source_call_id ?? "") === callId,
  );
  return { ...record, results };
}

function processStatus(tool: string, observation: unknown): ProcessStatus {
  if (tool === "回复") return "reply";
  if (observation == null) return "unknown";
  if (
    typeof observation === "object"
    && Array.isArray((observation as Record<string, unknown>).results)
    && ((observation as Record<string, unknown>).results as unknown[]).length === 0
  ) return "unknown";
  const text = typeof observation === "string" ? observation : JSON.stringify(observation);
  if (
    /script failed|script error|traceback\s*\(|(?:assertion|attribute|index|key|type|value|filenotfound)error|command failed|exec_command failed|(?:exit|exited with) code[: )]+[1-9]\d*|no such file or directory/i.test(text)
  ) return "failure";
  return "success";
}

export function processAction(event: ProcessEvent): string {
  const text = eventText(event);
  if (event.tool === "回复") {
    if (/完成|已生成|已保存|交付|result\.(xlsx|docx|pptx|pdf)/i.test(text)) return tr("提交结果");
    return tr("说明进度");
  }
  if (/pytest|test_verify|verify|校验|验证/.test(text)) return tr("验证结果");
  if (/apply_patch|build_report|add file|update file/.test(text)) return tr("编写处理脚本");
  if (/save\(|to_excel|to_csv|output\/|output\\|result\.(xlsx|docx|pptx|pdf|html)/.test(text)) return tr("生成交付物");
  if (/chart|echarts|matplotlib|plot|图表/.test(text)) return tr("生成图表");
  if (/drop_duplicates|duplicat|去重/.test(text)) return tr("数据去重");
  if (/groupby|pivot|aggregate|汇总|同比|环比|forecast|预测/.test(text)) return tr("汇总分析");
  if (/read_excel|read_csv|load_workbook|openpyxl|glob|list|ls\s|dir\s|检查.*文件|读取/.test(text)) return tr("读取或检查数据");
  if (/mkdir|new-item|创建.*目录/.test(text)) return tr("准备工作目录");
  return event.tool === "exec" ? tr("执行数据处理") : `${tr("调用")} ${event.tool}`;
}

export function processSummary(event: ProcessEvent): string {
  if (event.message.trim()) return compactText(event.message.replace(/\s+/g, " ").trim(), 150);
  const action = processAction(event);
  const raw = typeof event.arguments === "object" && event.arguments !== null
    ? (event.arguments as Record<string, unknown>).cmd ?? (event.arguments as Record<string, unknown>).path
    : event.arguments;
  return raw ? `${action}${getLocale() === "en" ? " (expand to view raw arguments)" : "（展开可查看原始参数）"}` : action;
}

function alignmentKey(event: ProcessEvent): string {
  return `${event.tool}:${processAction(event)}`;
}

export function alignProcessEvents(left: ProcessEvent[], right: ProcessEvent[]): AlignedProcessEvent[] {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const lengths = Array.from({ length: rows }, () => new Uint16Array(columns));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i][j] = alignmentKey(left[i]) === alignmentKey(right[j])
        ? lengths[i + 1][j + 1] + 1
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const aligned: AlignedProcessEvent[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    const leftEvent = left[i];
    const rightEvent = right[j];
    if (leftEvent && rightEvent && alignmentKey(leftEvent) === alignmentKey(rightEvent)) {
      aligned.push({
        key: `both-${leftEvent.key}-${rightEvent.key}`,
        step: aligned.length + 1,
        action: processAction(leftEvent),
        left: leftEvent,
        right: rightEvent,
        difference: leftEvent.signature === rightEvent.signature ? "same" : "detail",
      });
      i += 1;
      j += 1;
    } else if (rightEvent && (!leftEvent || lengths[i][j + 1] >= lengths[i + 1][j])) {
      aligned.push({
        key: `right-${rightEvent.key}`,
        step: aligned.length + 1,
        action: processAction(rightEvent),
        right: rightEvent,
        difference: "right-only",
      });
      j += 1;
    } else if (leftEvent) {
      aligned.push({
        key: `left-${leftEvent.key}`,
        step: aligned.length + 1,
        action: processAction(leftEvent),
        left: leftEvent,
        difference: "left-only",
      });
      i += 1;
    }
  }
  return aligned;
}

export function processEvents(steps: TrajectoryStep[] = []): ProcessEvent[] {
  const events: ProcessEvent[] = [];
  for (const step of steps) {
    if (step.source !== "agent") continue;
    const calls: ToolCall[] = step.tool_calls ?? [];
    if (!calls.length) {
      const status = processStatus("回复", step.observation);
      const message = messageText(step.message);
      events.push({
        key: `${step.step_id ?? events.length}-message`,
        step: events.length + 1,
        rawStep: step.original_step_id ?? step.step_id,
        stepName: step.portal_step_name,
        timestamp: step.timestamp ?? "",
        intervalSeconds: null,
        message,
        tool: "回复",
        arguments: null,
        observation: step.observation,
        metrics: step.metrics ?? {},
        status,
        signature: `message:${status}:${JSON.stringify(message)}:${observationSignature(step.observation)}`,
      });
      continue;
    }
    calls.forEach((call, index) => {
      const tool = call.function_name ?? "tool";
      const observation = observationForCall(step.observation, call.tool_call_id);
      const status = processStatus(tool, observation);
      const message = messageText(step.message);
      events.push({
        key: `${step.step_id ?? events.length}-${index}`,
        step: events.length + 1,
        rawStep: step.original_step_id ?? step.step_id,
        stepName: step.portal_step_name,
        timestamp: step.timestamp ?? "",
        intervalSeconds: null,
        message,
        tool,
        arguments: call.arguments,
        observation,
        metrics: step.metrics ?? {},
        status,
        signature: `${tool}:${status}:${canonicalJson(call.arguments)}:${observationSignature(observation)}`,
      });
    });
  }
  return events.map((event, index) => {
    const timestamp = Date.parse(event.timestamp);
    if (!Number.isFinite(timestamp)) return event;
    const nextTimestamp = events.slice(index + 1)
      .map((candidate) => Date.parse(candidate.timestamp))
      .find((candidate) => Number.isFinite(candidate) && candidate > timestamp);
    return {
      ...event,
      intervalSeconds: nextTimestamp === undefined ? null : (nextTimestamp - timestamp) / 1000,
    };
  });
}
