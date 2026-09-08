import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, CSSProperties, ReactNode, RefObject } from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  RocketOutlined,
  SwapOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Collapse,
  ConfigProvider,
  Descriptions,
  DatePicker,
  Empty,
  Flex,
  Input,
  Layout,
  Modal,
  Popover,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { api, artifactUrl } from "./api";
import type { TableProps } from "antd";
import type { ArtifactPreview, JobSummary, ScoreCheck, ToolStatus, TrialDetail, TrialSummary, WorkspaceResponse } from "./types";
import {
  alignProcessEvents,
  matchesModel,
  isHttpTrial,
  compactText,
  formatDate,
  formatDuration,
  formatNumber,
  formatScore,
  formatTime,
  processAction,
  processEvents,
  processSummary,
  type AlignedProcessEvent,
  type ProcessEvent,
  type ProcessStatus,
} from "./utils";
import { useDomTranslations, useI18n, LocaleProvider, tr } from "./i18n";

const { Header, Content } = Layout;
const { Text, Title } = Typography;
const DEFAULT_TABLE_PAGE_SIZE = 10;
const tableSerialColumn = (currentPage: number, fixed?: "left") => ({
  title: "序号",
  key: "serial",
  width: 64,
  align: "center" as const,
  ...(fixed ? { fixed } : {}),
  render: (_: unknown, __: unknown, index: number) => (currentPage - 1) * DEFAULT_TABLE_PAGE_SIZE + index + 1,
});

type NumberedTableProps<RecordType extends object> = TableProps<RecordType> & {
  serialFixed?: boolean;
  showSerial?: boolean;
};

function NumberedTable<RecordType extends object>({ columns, pagination, serialFixed = false, showSerial = true, ...props }: NumberedTableProps<RecordType>) {
  const [currentPage, setCurrentPage] = useState(1);
  const configuredPagination = typeof pagination === "object" ? pagination : {};
  const pageSize = configuredPagination.pageSize ?? DEFAULT_TABLE_PAGE_SIZE;
  const dataSignature = (props.dataSource ?? []).map((record, index) => {
    if (typeof props.rowKey === "function") return String(props.rowKey(record, index));
    if (typeof props.rowKey === "string") return String(record[props.rowKey as keyof RecordType]);
    return String(index);
  }).join("\u0001");
  useEffect(() => setCurrentPage(1), [dataSignature]);
  return <Table<RecordType>
    {...props}
    columns={[...(showSerial ? [tableSerialColumn(currentPage, serialFixed ? "left" : undefined)] : []), ...(columns ?? [])]}
    pagination={{
      ...configuredPagination,
      current: currentPage,
      pageSize,
      onChange: (page, size) => {
        setCurrentPage(page);
        configuredPagination.onChange?.(page, size);
      },
    }}
  />;
}
dayjs.locale("zh-cn");
function scoreColor(value: number | null): string {
  if (value === null) return "default";
  if (value >= 0.8) return "success";
  if (value >= 0.5) return "processing";
  return "warning";
}

type PagePosition = { left: number; top: number };

function currentPagePosition(): PagePosition {
  return typeof window === "undefined" ? { left: 0, top: 0 } : { left: window.scrollX, top: window.scrollY };
}

function restorePagePosition({ left, top }: PagePosition): void {
  if (typeof window === "undefined") return;
  if (Math.abs(window.scrollX - left) < 1 && Math.abs(window.scrollY - top) < 1) return;
  window.scrollTo({ left, top, behavior: "auto" });
}

function schedulePagePositionRestore(left: number, top: number): () => void {
  if (typeof window === "undefined") return () => undefined;
  const position = { left, top };
  let secondFrame = 0;
  const firstFrame = requestAnimationFrame(() => {
    restorePagePosition(position);
    secondFrame = requestAnimationFrame(() => restorePagePosition(position));
  });
  return () => {
    cancelAnimationFrame(firstFrame);
    cancelAnimationFrame(secondFrame);
  };
}

function preservePagePosition(action: () => void): void {
  if (typeof window === "undefined") {
    action();
    return;
  }
  const { left, top } = currentPagePosition();
  action();
  schedulePagePositionRestore(left, top);
}

function downloadJsonSnapshot(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

type PortalTabItems = NonNullable<ComponentProps<typeof Tabs>["items"]>;

function StableTabs({ items, defaultActiveKey = "score", activeKey: controlledActiveKey, onChange }: { items: PortalTabItems; defaultActiveKey?: string; activeKey?: string; onChange?: (key: string) => void }) {
  const [uncontrolledActiveKey, setUncontrolledActiveKey] = useState(defaultActiveKey);
  const activeKey = controlledActiveKey ?? uncontrolledActiveKey;
  const pendingPagePosition = useRef<PagePosition | null>(null);

  useLayoutEffect(() => {
    const position = pendingPagePosition.current;
    if (!position) return;
    pendingPagePosition.current = null;
    restorePagePosition(position);
    return schedulePagePositionRestore(position.left, position.top);
  }, [activeKey]);

  const changeTab = (nextKey: string) => {
    if (nextKey === activeKey) return;
    pendingPagePosition.current = currentPagePosition();
    if (controlledActiveKey === undefined) setUncontrolledActiveKey(nextKey);
    onChange?.(nextKey);
  };

  return (
    <div className="stable-tabs">
      <Tabs
        animated={false}
        activeKey={activeKey}
        onChange={changeTab}
        items={items}
      />
    </div>
  );
}

type TrialScope = "all" | "errors" | "score-failures";

function ClickableStat({
  title,
  value,
  prefix,
  valueStyle,
  onClick,
}: {
  title: string;
  value: number;
  prefix: ReactNode;
  valueStyle?: CSSProperties;
  onClick: () => void;
}) {
  return (
    <Card
      hoverable
      role="button"
      tabIndex={0}
      onClick={() => preservePagePosition(onClick)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          preservePagePosition(onClick);
        }
      }}
    >
      <Statistic title={title} value={value} prefix={prefix} valueStyle={valueStyle} />
    </Card>
  );
}

function datasetLabel(evalName: string): string {
  if (!evalName) return "—";
  return evalName.split("__").at(-1) || evalName;
}

const UNLABELED_DATASET_KEY = "__unlabeled__";
const UNLABELED_DATASET_LABEL = "无数据集信息（未产生 Trial）";

function jobDatasetKeys(job: Pick<JobSummary, "evalName" | "datasetNames">): string[] {
  if (job.datasetNames?.length) return job.datasetNames;
  return job.evalName ? [datasetLabel(job.evalName)] : [UNLABELED_DATASET_KEY];
}

function jobDatasetLabel(job: Pick<JobSummary, "evalName" | "datasetNames">): string {
  const values = jobDatasetKeys(job);
  return values[0] === UNLABELED_DATASET_KEY ? UNLABELED_DATASET_LABEL : values.join("、");
}

function jobModels(job: Pick<JobSummary, "model" | "models">): string[] {
  return job.models?.length ? job.models : job.model ? [job.model] : ["__unknown__"];
}

function taskNames(job: JobSummary): string[] {
  return Array.from(new Set(job.trials.map((trial) => trial.taskLabel || trial.taskName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function scopedTrials(job: JobSummary, scope: TrialScope): TrialSummary[] {
  if (scope === "errors") return job.trials.filter((trial) => Boolean(trial.exception));
  if (scope === "score-failures") return job.trials.filter((trial) => {
    const failed = failedCheckCount(trial);
    return failed !== null && failed > 0;
  });
  return job.trials;
}

function preferredTrial(job: JobSummary, scope: TrialScope = "all"): TrialSummary | undefined {
  const trials = scopedTrials(job, scope);
  return trials.find((trial) => Boolean(trial.exception)) ?? trials[0];
}

function trialScopeFromQuery(value: string | undefined): TrialScope {
  return value === "errors" || value === "score-failures" ? value : "all";
}

function failedCheckCount(trial: Pick<TrialSummary, "passed" | "total">): number | null {
  if (typeof trial.passed !== "number" || typeof trial.total !== "number") return null;
  return Math.max(0, Math.round(trial.total - trial.passed));
}

function trialReference(jobKey: string, trialName: string): string {
  return `${jobKey}::${trialName}`;
}

function trialStatusPresentation(trial: Pick<TrialSummary, "status" | "statusLabel" | "exceptionCategory">): { color: string; label: string } {
  const labels: Record<string, { color: string; label: string }> = {
    pending: { color: "default", label: "等待运行" },
    running: { color: "processing", label: "运行中" },
    verifying: { color: "processing", label: "评分中" },
    completed: { color: "success", label: "已完成" },
    unscored: { color: "warning", label: "无评分" },
    timeout: { color: "error", label: "超时" },
    cancelled: { color: "default", label: "已取消" },
    errored: { color: "error", label: "运行异常" },
  };
  const presentation = labels[trial.status] || { color: "default", label: trial.statusLabel || "未知状态" };
  return trial.exceptionCategory && ["errored", "timeout", "cancelled"].includes(trial.status)
    ? { ...presentation, label: `${presentation.label} · ${trial.exceptionCategory}` }
    : presentation;
}

function TrialStatusTag({ trial }: { trial: Pick<TrialSummary, "status" | "statusLabel" | "exceptionCategory"> }) {
  const presentation = trialStatusPresentation(trial);
  return <Tag color={presentation.color}>{presentation.label}</Tag>;
}

function TermGuide() {
  return (
    <Popover
      trigger="click"
      title="Harbor 术语说明"
      content={<Descriptions size="small" column={1} items={[
        { key: "job", label: "Job", children: "一次评测任务集合，通常包含多个 Trial。" },
        { key: "task", label: "Task", children: "一个待完成并验证的具体办公任务。" },
        { key: "trial", label: "Trial", children: "某模型/Agent 对一个 Task 的一次实际运行。" },
        { key: "attempt", label: "Attempt", children: "同一 Job 内同一 Task 的第几次尝试。" },
        { key: "regrade", label: "Regrade", children: "复用既有运行结果重新评分，不代表新的 Agent 运行。" },
        { key: "judge", label: "评分方式", children: "程序评分可重复执行；LLM Judge 由模型判断。" },
      ]} />}
    >
      <Button type="text" size="small" aria-label={tr("查看 Harbor 术语说明")}>术语说明</Button>
    </Popover>
  );
}

function attemptLabel(trial: Pick<TrialSummary, "attempt" | "attemptCount">): string {
  return trial.attemptCount > 1 ? `第 ${trial.attempt}/${trial.attemptCount} 次尝试` : "单次尝试";
}

function JobMetricLink({
  value,
  job,
  scope,
  taskName,
  onInspect,
}: {
  value: number | null;
  job: JobSummary;
  scope: TrialScope;
  taskName?: string;
  onInspect: (job: JobSummary, scope?: TrialScope, taskName?: string) => void;
}) {
  if (value === null) return <Text type="secondary">—</Text>;
  if (value <= 0) return <Text type="secondary">{value}</Text>;
  const label = tr(scope === "errors" ? `查看 ${job.name} 的异常 Trial` : `查看 ${job.name} 中包含未通过评分项的 Trial`);
  const activate = () => preservePagePosition(() => onInspect(job, scope, taskName));
  return (
    <Text
      className="job-metric-link"
      type="danger"
      role="button"
      tabIndex={0}
      title={label}
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); activate(); }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          activate();
        }
      }}
    >
      {value}
    </Text>
  );
}

interface OverviewFilters {
  dataset: string;
  task: string;
  model: string;
  status: string;
  scoreState: string;
  attempt: string;
  exceptionCategory: string;
  dateFrom: string;
  dateTo: string;
}

const ALL_FILTER_VALUE = "__all__";

interface TrialCandidate {
  job: JobSummary;
  trial: TrialSummary;
}

interface StabilityBatch {
  key: string;
  name: string;
  startedAt: string | null;
  trialCount: number;
}

function scoreStatistics(trials: TrialSummary[]) {
  const values = trials.map((trial) => trial.reward).filter((value): value is number => typeof value === "number");
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  const variance = values.length > 1 && average !== null
    ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
    : 0;
  const passed = trials.reduce((sum, trial) => sum + (trial.passed ?? 0), 0);
  const total = trials.reduce((sum, trial) => sum + (trial.total ?? 0), 0);
  return {
    scored: values.length,
    average,
    minimum: values.length ? Math.min(...values) : null,
    maximum: values.length ? Math.max(...values) : null,
    deviation: values.length > 1 ? Math.sqrt(variance) : null,
    passRate: total ? passed / total : null,
    errors: trials.filter((trial) => ["errored", "timeout", "cancelled"].includes(trial.status)).length,
  };
}

function isFinishedTrial(trial: TrialSummary): boolean {
  return ["completed", "unscored"].includes(trial.status) || Boolean(trial.finishedAt && !trial.exception);
}

function stableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "__missing__";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function StabilityMatrix({ candidates, onSelectBatch }: { candidates: TrialCandidate[]; onSelectBatch: (jobKey: string) => void }) {
  const regradeCount = candidates.filter(({ trial }) => trial.isRegrade).length;
  const primaryCandidates = candidates.filter(({ trial }) => !trial.isRegrade);
  const sourceCandidates = primaryCandidates.length ? primaryCandidates : candidates;
  const usingRegrades = !primaryCandidates.length && regradeCount > 0;
  const grouped = new Map<string, { taskName: string; task: string; model: string; configuration: string; batches: Map<string, StabilityBatch>; trials: TrialSummary[] }>();
  for (const { job, trial } of sourceCandidates) {
    const model = trial.model || (isHttpTrial(trial) ? "HTTP 服务（无模型）" : "未知模型");
    const task = trial.taskLabel || trial.taskName.split("/").pop() || trial.taskName || "未标注 Task";
    const configurationKey = stableValue({ checksum: trial.taskChecksum, agent: trial.agent, agentVersion: trial.agentVersion, reasoningEffort: trial.reasoningEffort, environment: trial.environmentConfig, verifier: trial.verifierConfig, verifierMode: trial.verifierMode });
    const configuration = [trial.agent, trial.agentVersion, trial.reasoningEffort, trial.taskChecksum ? `checksum ${trial.taskChecksum.slice(0, 10)}` : "无 checksum"].filter(Boolean).join(" · ");
    const key = `${trial.taskName}\u0000${model}\u0000${configurationKey}`;
    const entry = grouped.get(key) ?? { taskName: trial.taskName, task, model, configuration, batches: new Map<string, StabilityBatch>(), trials: [] };
    const batch = entry.batches.get(job.key) ?? {
      key: job.key,
      name: job.name,
      startedAt: job.startedAt || trial.startedAt,
      trialCount: 0,
    };
    batch.trialCount += 1;
    entry.batches.set(job.key, batch);
    entry.trials.push(trial);
    grouped.set(key, entry);
  }
  const rows = Array.from(grouped.entries()).map(([key, entry]) => {
    const batches = Array.from(entry.batches.values()).sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || "") || a.name.localeCompare(b.name));
    return {
      key,
      task: entry.task,
      model: entry.model,
      configuration: entry.configuration,
      jobs: batches.length,
      batches,
      trials: entry.trials.length,
      ...scoreStatistics(entry.trials),
    };
  }).sort((a, b) => a.task.localeCompare(b.task, "zh-CN") || a.model.localeCompare(b.model, "zh-CN"));
  return (
    <Card
      className="stability-card"
      title="Task × 模型稳定性与覆盖"
      extra={<Tooltip title="只有 Task checksum、Agent 版本、推理强度、环境和 Verifier 配置一致的 Trial 才会合并计算。Regrade 会复用既有 Agent 运行；存在原始 Trial 时会排除 Regrade。"><Text type="secondary">评分稳定性与运行效率{usingRegrades ? " · 当前只有 Regrade，统计仅供评分器复核" : regradeCount ? ` · 已排除 ${regradeCount} 个 Regrade` : ""}</Text></Tooltip>}
    >
      <NumberedTable
        rowKey="key"
        size="small"
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        dataSource={rows}
        scroll={{ x: 1664 }}
        columns={[
          { title: "Task", dataIndex: "task", width: 230, ellipsis: true },
          { title: "模型", dataIndex: "model", width: 160, ellipsis: true },
          { title: "实验配置", dataIndex: "configuration", width: 260, ellipsis: true },
          { title: "Job", dataIndex: "jobs", width: 76, align: "center" as const },
          {
            title: "运行批次",
            dataIndex: "batches",
            width: 290,
            render: (batches: StabilityBatch[]) => {
              const latest = batches[0];
              if (!latest) return "—";
              const content = <div className="batch-list">
                {batches.map((batch) => <button type="button" key={batch.key} onClick={() => onSelectBatch(batch.key)}>
                  <span>{batch.name}</span>
                  <small>{formatDate(batch.startedAt)} · {batch.trialCount} 个 Trial</small>
                </button>)}
              </div>;
              return <Popover title={`运行批次（${batches.length}）`} content={content} trigger={["hover", "click"]} placement="bottomLeft">
                <button type="button" className="batch-summary" onClick={() => onSelectBatch(latest.key)} aria-label={tr(`筛选运行批次 ${latest.name}`)}>
                  <span>{latest.name}</span>
                  <small>{formatDate(latest.startedAt)}{batches.length > 1 ? ` · 共 ${batches.length} 批` : ""}</small>
                </button>
              </Popover>;
            },
          },
          { title: "评分 / Trial", width: 110, align: "center" as const, render: (_: unknown, row: typeof rows[number]) => `${row.scored} / ${row.trials}` },
          { title: "均分", dataIndex: "average", width: 94, align: "center" as const, render: formatScore },
          { title: "范围", width: 130, align: "center" as const, render: (_: unknown, row: typeof rows[number]) => row.minimum === null || row.maximum === null ? "—" : `${row.minimum.toFixed(3)}–${row.maximum.toFixed(3)}` },
          { title: <Tooltip title="标准差越小，重复运行的评分越稳定。">标准差</Tooltip>, dataIndex: "deviation", width: 98, align: "center" as const, render: (value: number | null) => value === null ? "—" : value.toFixed(3) },
          { title: "检查通过率", dataIndex: "passRate", width: 112, align: "center" as const, render: (value: number | null) => value === null ? "—" : `${Math.round(value * 100)}%` },
          { title: "运行异常", dataIndex: "errors", width: 100, align: "center" as const, render: (value: number) => value ? <Tag color="error">{value}</Tag> : <Tag color="success">0</Tag> },
        ]}
      />
    </Card>
  );
}

function JobOverview({
  jobs,
  filters,
  diagnostics,
  onInspect,
  onCompare,
  onFiltersChange,
}: {
  jobs: JobSummary[];
  filters: OverviewFilters;
  diagnostics?: WorkspaceResponse["diagnostics"];
  onInspect: (job: JobSummary, scope?: TrialScope, taskName?: string) => void;
  onCompare: (job: JobSummary, taskName?: string) => void;
  onFiltersChange: (filters: OverviewFilters) => void;
}) {
  const [jobFilter, setJobFilter] = useState<"all" | "completed" | "errors" | "score-failures">("all");
  const [jobSearch, setJobSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = DEFAULT_TABLE_PAGE_SIZE;
  const { message } = AntApp.useApp();
  const { locale } = useI18n();
  const datasetOptions = Array.from(new Set(jobs.flatMap(jobDatasetKeys))).sort((a, b) => a.localeCompare(b, "zh-CN")).map((value) => ({
    value,
    label: value === UNLABELED_DATASET_KEY ? UNLABELED_DATASET_LABEL : value,
  }));
  const datasetJobs = filters.dataset ? jobs.filter((job) => jobDatasetKeys(job).includes(filters.dataset)) : jobs;
  const taskCatalog = new Map<string, string>();
  datasetJobs.forEach((job) => job.trials.forEach((trial) => {
    if (trial.taskName) taskCatalog.set(trial.taskName, trial.taskLabel || trial.taskName.split("/").pop() || trial.taskName);
  }));
  const taskOptions = Array.from(taskCatalog, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  const taskJobs = filters.task ? datasetJobs.filter((job) => job.trials.some((trial) => trial.taskName === filters.task)) : datasetJobs;
  const modelOptions = Array.from(new Set(taskJobs.flatMap(jobModels))).sort((a, b) => a.localeCompare(b, "zh-CN")).map((value) => ({
    value,
    label: value === "__unknown__" ? "无模型 / 未记录" : value,
  }));
  const datasetFilterValid = !filters.dataset || datasetOptions.some((option) => option.value === filters.dataset);
  const taskFilterValid = !filters.task || taskOptions.some((option) => option.value === filters.task);
  const modelFilterValid = !filters.model || modelOptions.some((option) => option.value === filters.model);
  useEffect(() => {
    if (!datasetFilterValid) onFiltersChange({ ...filters, dataset: "", task: "", model: "" });
    else if (!taskFilterValid) onFiltersChange({ ...filters, task: "", model: "" });
    else if (!modelFilterValid) onFiltersChange({ ...filters, model: "" });
  }, [datasetFilterValid, filters, modelFilterValid, onFiltersChange, taskFilterValid]);
  const scopedJobs = filters.model ? taskJobs.filter((job) => jobModels(job).includes(filters.model)) : taskJobs;
  const trialsInScope = (job: JobSummary) => job.trials.filter((trial) => (!filters.task || trial.taskName === filters.task) && matchesModel(trial, filters.model));
  const scopedTrials = scopedJobs.flatMap(trialsInScope);
  const scopedCandidates = scopedJobs.flatMap((job) => trialsInScope(job).map((trial) => ({ job, trial })));
  const statusOptions = Array.from(new Set(scopedTrials.map((trial) => trial.status).filter(Boolean))).sort().map((value) => ({ value, label: trialStatusPresentation({ status: value, statusLabel: "", exceptionCategory: "" }).label }));
  const exceptionCategoryOptions = Array.from(new Set(scopedTrials.map((trial) => trial.exceptionCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN")).map((value) => ({ value, label: value }));
  const startOfDate = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
  const endOfDate = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;
  const trialMatchesAdvancedFilters = (trial: TrialSummary) => {
    if (filters.status && trial.status !== filters.status) return false;
    if (filters.scoreState === "scored" && typeof trial.reward !== "number") return false;
    if (filters.scoreState === "unscored" && typeof trial.reward === "number") return false;
    if (filters.attempt === "retries" && trial.attemptCount < 2) return false;
    if (filters.exceptionCategory && trial.exceptionCategory !== filters.exceptionCategory) return false;
    const startedAt = trial.startedAt ? new Date(trial.startedAt).getTime() : null;
    if (startOfDate !== null && (startedAt === null || startedAt < startOfDate)) return false;
    if (endOfDate !== null && (startedAt === null || startedAt > endOfDate)) return false;
    return true;
  };
  const matchingCandidates = scopedCandidates.filter(({ trial }) => trialMatchesAdvancedFilters(trial));
  const matchingTrials = matchingCandidates.map(({ trial }) => trial);
  const matchingJobKeys = new Set(matchingCandidates.map(({ job }) => job.key));
  const matchingJobs = scopedJobs.filter((job) => matchingJobKeys.has(job.key));
  const trialsForJob = (job: JobSummary) => trialsInScope(job).filter(trialMatchesAdvancedFilters);
  const completed = matchingTrials.filter(isFinishedTrial).length;
  const errors = matchingTrials.filter((trial) => ["errored", "timeout", "cancelled"].includes(trial.status)).length;
  const scoreFailures = matchingTrials.reduce((sum, trial) => sum + (failedCheckCount(trial) ?? 0), 0);
  const scoreFailureTrials = matchingTrials.filter((trial) => (failedCheckCount(trial) ?? 0) > 0).length;
  const models = new Set(matchingCandidates.map(({ job, trial }) => trial.model || job.model).filter(Boolean)).size;
  const diagnosticSummary = diagnostics
    ? locale === "en"
      ? `Found ${diagnostics.jobsDiscovered} Jobs and ${diagnostics.trialsDiscovered} Trials; skipped ${diagnostics.jobsSkipped} Jobs and ${diagnostics.trialsSkipped} Trials.`
      : `发现 ${diagnostics.jobsDiscovered} 个 Job、${diagnostics.trialsDiscovered} 个 Trial；跳过 ${diagnostics.jobsSkipped} 个 Job、${diagnostics.trialsSkipped} 个 Trial。`
    : "";
  const modelNames = Array.from(new Set(matchingCandidates.map(({ job, trial }) => trial.model || job.model || "未知模型")));
  const modelBreakdown = modelNames.map((model) => {
    const candidates = matchingCandidates.filter(({ job, trial }) => (trial.model || job.model || "未知模型") === model);
    return { model, jobs: new Set(candidates.map(({ job }) => job.key)).size, trials: candidates.length };
  });
  const statusFilteredJobs = jobFilter === "completed"
    ? matchingJobs.filter((job) => trialsForJob(job).some(isFinishedTrial))
    : jobFilter === "errors"
      ? matchingJobs.filter((job) => trialsForJob(job).some((trial) => ["errored", "timeout", "cancelled"].includes(trial.status)))
      : jobFilter === "score-failures"
        ? matchingJobs.filter((job) => trialsForJob(job).some((trial) => (failedCheckCount(trial) ?? 0) > 0))
        : matchingJobs;
  const normalizedSearch = jobSearch.trim().toLocaleLowerCase("zh-CN");
  const visibleJobs = normalizedSearch
    ? statusFilteredJobs.filter((job) => [job.name, ...jobModels(job), job.reasoningEffort, ...(job.evalNames ?? [job.evalName]), ...taskNames(job)].join(" ").toLocaleLowerCase("zh-CN").includes(normalizedSearch))
    : statusFilteredJobs;
  const displayScore = (job: JobSummary) => {
    const values = trialsForJob(job).map((trial) => trial.reward).filter((value): value is number => typeof value === "number");
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const jobFilteredMetrics = (job: JobSummary) => {
    const trials = trialsForJob(job);
    return {
      total: trials.length,
      completed: trials.filter(isFinishedTrial).length,
      errors: trials.filter((trial) => ["errored", "timeout", "cancelled"].includes(trial.status)).length,
      failedChecks: trials.reduce((sum, trial) => sum + (failedCheckCount(trial) ?? 0), 0),
    };
  };
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.attempt, filters.dataset, filters.dateFrom, filters.dateTo, filters.exceptionCategory, filters.model, filters.scoreState, filters.status, filters.task, jobFilter, jobSearch, jobs]);
  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const selectJobFilter = (filter: "all" | "completed" | "errors" | "score-failures") => {
    preservePagePosition(() => setJobFilter(filter));
  };
  const selectRunBatch = (jobKey: string) => {
    const selectedJob = jobs.find((job) => job.key === jobKey);
    if (!selectedJob) return;
    setJobFilter("all");
    setJobSearch(selectedJob.name);
    setCurrentPage(1);
    window.requestAnimationFrame(() => document.getElementById("job-runs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const changeDatasetFilter = (dataset: string) => {
    const matchingJobs = dataset ? jobs.filter((job) => jobDatasetKeys(job).includes(dataset)) : jobs;
    const task = filters.task && matchingJobs.some((job) => job.trials.some((trial) => trial.taskName === filters.task)) ? filters.task : "";
    const matchingTaskJobs = task ? matchingJobs.filter((job) => job.trials.some((trial) => trial.taskName === task)) : matchingJobs;
    const model = filters.model && matchingTaskJobs.some((job) => jobModels(job).includes(filters.model)) ? filters.model : "";
    preservePagePosition(() => onFiltersChange({ ...filters, dataset, task, model }));
  };
  const changeTaskFilter = (task: string) => {
    const matchingJobs = task ? datasetJobs.filter((job) => job.trials.some((trial) => trial.taskName === task)) : datasetJobs;
    const model = filters.model && matchingJobs.some((job) => jobModels(job).includes(filters.model)) ? filters.model : "";
    preservePagePosition(() => onFiltersChange({ ...filters, task, model }));
  };
  const resetOverviewFilters = () => preservePagePosition(() => {
    setJobFilter("all");
    setJobSearch("");
    onFiltersChange({ dataset: "", task: "", model: "", status: "", scoreState: "", attempt: "", exceptionCategory: "", dateFrom: "", dateTo: "" });
  });
  const changeStartDate = (value: dayjs.Dayjs | null) => {
    const dateFrom = value?.format("YYYY-MM-DD") ?? "";
    const dateTo = dateFrom && filters.dateTo && dateFrom > filters.dateTo ? dateFrom : filters.dateTo;
    preservePagePosition(() => onFiltersChange({ ...filters, dateFrom, dateTo }));
  };
  const changeEndDate = (value: dayjs.Dayjs | null) => {
    const dateTo = value?.format("YYYY-MM-DD") ?? "";
    const dateFrom = dateTo && filters.dateFrom && dateTo < filters.dateFrom ? dateTo : filters.dateFrom;
    preservePagePosition(() => onFiltersChange({ ...filters, dateFrom, dateTo }));
  };
  const columns = [
    {
      title: "序号",
      key: "index",
      width: 64,
      align: "center" as const,
      render: (_: unknown, _job: JobSummary, index: number) => (visiblePage - 1) * pageSize + index + 1,
    },
    {
      title: "模型 / 推理",
      key: "job",
      sorter: (a: JobSummary, b: JobSummary) => `${a.model} ${a.reasoningEffort}`.localeCompare(`${b.model} ${b.reasoningEffort}`, "zh-CN"),
      render: (_: unknown, job: JobSummary) => (
        <div>
          <Text strong>
            {job.model || "无模型 / 未记录"}
            {job.reasoningEffort && ` · ${job.reasoningEffort}`}
          </Text>
          <div className="secondary-line">{job.name}</div>
        </div>
      ),
    },
    {
      title: "数据集",
      key: "dataset",
      width: 280,
      render: (_: unknown, job: JobSummary) => {
        const names = taskNames(job);
        const fullNames = Array.from(new Set(job.trials.map((trial) => trial.taskName).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"));
        const taskList = fullNames.length ? fullNames : names;
        const datasetName = jobDatasetLabel(job);
        return (
          <Popover
            trigger={["hover", "focus", "click"]}
            placement="topLeft"
            content={(
              <div className="dataset-task-list">
                <div><Text strong>数据集</Text>：{datasetName}</div>
                <div><Text strong>{taskList.length} 个 Task</Text></div>
                {taskList.length ? taskList.map((name) => (
                  <div
                    key={name}
                    style={{
                      overflowWrap: name.length > 150 ? "anywhere" : undefined,
                      whiteSpace: name.length > 150 ? "normal" : "nowrap",
                    }}
                  >
                    {name}
                  </div>
                )) : <div>未识别 Task</div>}
              </div>
            )}
          >
            <Button type="link" className="dataset-popover-trigger" onClick={(event) => event.stopPropagation()}>
              {datasetName}{taskList.length ? ` · ${taskList.length} 个 Task` : ""}
            </Button>
          </Popover>
        );
      },
    },
    {
      title: filters.task ? "Task Trial 均分" : "筛选 Trial 均分",
      key: "score",
      width: 105,
      sorter: (a: JobSummary, b: JobSummary) => (displayScore(a) ?? -1) - (displayScore(b) ?? -1),
      render: (_: unknown, job: JobSummary) => {
        const value = displayScore(job);
        return <Tag color={scoreColor(value)}>{formatScore(value)}</Tag>;
      },
    },
    {
      title: "完成",
      width: 90,
      sorter: (a: JobSummary, b: JobSummary) => jobFilteredMetrics(a).completed - jobFilteredMetrics(b).completed,
      render: (_: unknown, job: JobSummary) => {
        const metrics = jobFilteredMetrics(job);
        return `${metrics.completed}/${metrics.total}`;
      },
    },
    {
      title: "异常 Trial",
      key: "erroredTrials",
      width: 100,
      sorter: (a: JobSummary, b: JobSummary) => jobFilteredMetrics(a).errors - jobFilteredMetrics(b).errors,
      render: (_: unknown, job: JobSummary) => <JobMetricLink value={jobFilteredMetrics(job).errors} job={job} scope="errors" taskName={filters.task || undefined} onInspect={onInspect} />,
    },
    {
      title: "未通过评分项",
      key: "failedChecks",
      width: 130,
      sorter: (a: JobSummary, b: JobSummary) => jobFilteredMetrics(a).failedChecks - jobFilteredMetrics(b).failedChecks,
      render: (_: unknown, job: JobSummary) => <JobMetricLink value={jobFilteredMetrics(job).failedChecks} job={job} scope="score-failures" taskName={filters.task || undefined} onInspect={onInspect} />,
    },
    { title: "开始时间", dataIndex: "startedAt", width: 180, sorter: (a: JobSummary, b: JobSummary) => (a.startedAt || "").localeCompare(b.startedAt || ""), render: formatDate },
    { title: "结束时间", dataIndex: "finishedAt", width: 180, sorter: (a: JobSummary, b: JobSummary) => (a.finishedAt || "").localeCompare(b.finishedAt || ""), render: formatDate },
    {
      title: "操作",
      key: "actions",
      width: 190,
      render: (_: unknown, job: JobSummary) => (
        <Space>
          <Button size="small" onClick={(event) => { event.stopPropagation(); onInspect(job, "all", filters.task || undefined); }}>查看 Trial</Button>
          <Button size="small" icon={<SwapOutlined />} onClick={(event) => { event.stopPropagation(); onCompare(job, filters.task || undefined); }}>对比</Button>
        </Space>
      ),
    },
  ];
  const exportVisibleJobs = () => downloadJsonSnapshot("harbor-overview-snapshot.json", {
    exportedAt: new Date().toISOString(),
    filters,
    jobs: visibleJobs.map((job) => ({
      key: job.key,
      name: job.name,
      model: job.model,
      dataset: jobDatasetLabel(job),
      mean: displayScore(job),
      trials: trialsForJob(job),
    })),
  });
  return (
    <section className="overview-grid">
      <Card size="small" className="overview-filter-card">
        <div className="overview-filter-bar">
          <label><span>数据集</span><Select showSearch optionFilterProp="label" value={filters.dataset || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部数据集" }, ...datasetOptions]} onChange={(value) => changeDatasetFilter(value === ALL_FILTER_VALUE ? "" : value)} /></label>
          <label><span>Task</span><Select showSearch optionFilterProp="label" value={filters.task || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部 Task" }, ...taskOptions]} onChange={(value) => changeTaskFilter(value === ALL_FILTER_VALUE ? "" : value)} /></label>
          <label><span>模型</span><Select showSearch optionFilterProp="label" value={filters.model || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部模型" }, ...modelOptions]} onChange={(value) => preservePagePosition(() => onFiltersChange({ ...filters, model: value === ALL_FILTER_VALUE ? "" : value }))} /></label>
          <label><span>运行状态</span><Select value={filters.status || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部状态" }, ...statusOptions]} onChange={(value) => preservePagePosition(() => onFiltersChange({ ...filters, status: value === ALL_FILTER_VALUE ? "" : value }))} /></label>
          <label><span>评分</span><Select value={filters.scoreState || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部" }, { value: "scored", label: "有评分" }, { value: "unscored", label: "无评分" }]} onChange={(value) => preservePagePosition(() => onFiltersChange({ ...filters, scoreState: value === ALL_FILTER_VALUE ? "" : value }))} /></label>
          <label><span>尝试</span><Select value={filters.attempt || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部尝试" }, { value: "retries", label: "仅重复尝试" }]} onChange={(value) => preservePagePosition(() => onFiltersChange({ ...filters, attempt: value === ALL_FILTER_VALUE ? "" : value }))} /></label>
          <label><span>异常类别</span><Select showSearch optionFilterProp="label" value={filters.exceptionCategory || ALL_FILTER_VALUE} options={[{ value: ALL_FILTER_VALUE, label: "全部类别" }, ...exceptionCategoryOptions]} onChange={(value) => preservePagePosition(() => onFiltersChange({ ...filters, exceptionCategory: value === ALL_FILTER_VALUE ? "" : value }))} /></label>
          <label><span>开始日期</span><DatePicker allowClear format="YYYY-MM-DD" placeholder={tr("选择开始日期")} value={filters.dateFrom ? dayjs(filters.dateFrom) : null} onChange={changeStartDate} /></label>
          <label><span>结束日期</span><DatePicker allowClear format="YYYY-MM-DD" placeholder={tr("选择结束日期")} value={filters.dateTo ? dayjs(filters.dateTo) : null} onChange={changeEndDate} /></label>
          <Button disabled={!filters.dataset && !filters.task && !filters.model && !filters.status && !filters.scoreState && !filters.attempt && !filters.exceptionCategory && !filters.dateFrom && !filters.dateTo && jobFilter === "all" && !jobSearch} onClick={resetOverviewFilters}>重置筛选</Button>
        </div>
      </Card>
      <div className="stats-grid">
        <ClickableStat title="Job" value={matchingJobs.length} prefix={<ApartmentOutlined />} onClick={() => selectJobFilter("all")} />
        <ClickableStat title="已完成 Trial" value={completed} prefix={<CheckCircleOutlined />} onClick={() => selectJobFilter("completed")} />
        <Popover
          trigger="click"
          title="模型分布"
          content={<div className="model-breakdown">{modelBreakdown.map((item) => <div key={item.model}><Text strong>{item.model}</Text><Text type="secondary">{item.jobs} 个 Job · {item.trials} 个 Trial</Text></div>)}</div>}
        >
          <div><ClickableStat title="模型" value={models} prefix={<ExperimentOutlined />} onClick={() => undefined} /></div>
        </Popover>
        <ClickableStat title="异常 Trial" value={errors} prefix={errors ? <WarningOutlined /> : <CheckCircleOutlined />} valueStyle={errors ? { color: "#ff7875" } : undefined} onClick={() => selectJobFilter("errors")} />
        <Tooltip title={`来自 ${scoreFailureTrials} 个 Trial，累计 ${scoreFailures} 个未通过评分项`}>
          <div><ClickableStat title="未通过评分项（累计）" value={scoreFailures} prefix={scoreFailures ? <WarningOutlined /> : <CheckCircleOutlined />} valueStyle={scoreFailures ? { color: "#ff7875" } : undefined} onClick={() => selectJobFilter("score-failures")} /></div>
        </Tooltip>
      </div>
      <StabilityMatrix candidates={matchingCandidates} onSelectBatch={selectRunBatch} />
      {diagnostics && (diagnostics.jobsSkipped > 0 || diagnostics.trialsSkipped > 0) && (
        <Alert
          type="warning"
          showIcon
          message="部分 Harbor 数据未被纳入分析"
          description={(
            <div>
              {diagnosticSummary}
              {diagnostics.issues.length > 0 && (
                <Collapse
                  ghost
                  size="small"
                  items={[{
                    key: "issues",
                    label: `查看解析问题（${diagnostics.issues.length}）`,
                    children: <ul className="diagnostic-issues">{diagnostics.issues.map((issue, index) => <li key={`${issue.path}-${index}`}><code>{issue.path}</code><span>{issue.message}</span></li>)}</ul>,
                  }]}
                />
              )}
            </div>
          )}
        />
      )}
      <Card
        id="job-runs"
        className="jobs-card"
        title="运行记录"
        extra={<Space wrap>
          {jobFilter === "completed" ? <Tag color="success">包含已完成 Trial 的 Job</Tag> : jobFilter === "errors" ? <Tag color="error">存在异常 Trial 的 Job</Tag> : jobFilter === "score-failures" ? <Tag color="warning">存在未通过评分项的 Job</Tag> : undefined}
          <Input.Search allowClear value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="搜索模型、Job、数据集或 Task" className="job-search" />
          <Button size="small" onClick={exportVisibleJobs} disabled={!visibleJobs.length}>导出快照</Button>
          {diagnostics && <Tooltip title="上次扫描完成时间"><Text type="secondary">更新于 {formatDate(diagnostics.refreshedAt)}</Text></Tooltip>}
        </Space>}
      >
        <Table<JobSummary>
          rowKey="key"
          size="middle"
          columns={columns}
          dataSource={visibleJobs}
          pagination={{ pageSize, current: visiblePage, hideOnSinglePage: true, onChange: setCurrentPage }}
          onRow={(job) => ({
            role: "link",
            tabIndex: 0,
            onClick: (event) => {
              const target = event.target;
              if (target instanceof Element && target.closest("button, a, [role='button'], input")) return;
              onInspect(job, "all", filters.task || undefined);
            },
            onKeyDown: (event) => {
              const target = event.target;
              if (target instanceof Element && target.closest("button, a, [role='button'], input") && target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onInspect(job, "all", filters.task || undefined);
              }
            },
          })}
          scroll={{ x: 1480 }}
        />
      </Card>
    </section>
  );
}

interface ComparisonEntry {
  key: string;
  job: JobSummary;
  detail: TrialDetail;
  marker: string;
  color: string;
}

interface ComparisonCandidate {
  key: string;
  job: JobSummary;
  trial: TrialSummary;
}

const comparisonColors = ["cyan", "geekblue", "purple", "gold"];

function comparisonEntryTitle(entry: ComparisonEntry, baseline = false) {
  return (
    <div className="comparison-column-title">
      <Space size={6}><Tag color={entry.color}>{entry.marker}</Tag><Text strong>{entry.detail.summary.model || entry.detail.summary.agent || tr("未知执行器")}</Text>{baseline && <Tag>{tr("基准")}</Tag>}</Space>
      <Text type="secondary" ellipsis={{ tooltip: entry.job.name }}>{entry.job.name}</Text>
    </div>
  );
}

function DifferenceOverview({ entries }: { entries: ComparisonEntry[] }) {
  const signed = (value: number, format: (number: number) => string) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;
  const baseline = entries[0];
  const rows = [
    {
      key: "score",
      label: "得分",
      value: (entry: ComparisonEntry) => entry.detail.summary.reward,
      format: (value: number | null | undefined) => formatScore(value),
      delta: (value: number) => signed(value, (number) => number.toFixed(3)),
      higherIsBetter: true,
    },
    {
      key: "checks",
      label: "通过检查",
      value: (entry: ComparisonEntry) => entry.detail.summary.passed,
      format: (_value: number | null | undefined, entry: ComparisonEntry) => `${entry.detail.summary.passed ?? "—"}/${entry.detail.summary.total ?? "—"}`,
      delta: (value: number) => signed(value, formatNumber),
      higherIsBetter: true,
    },
    {
      key: "duration",
      label: "Agent 用时",
      value: (entry: ComparisonEntry) => entry.detail.summary.agentSeconds,
      format: (value: number | null | undefined) => formatDuration(value),
      delta: (value: number) => signed(value, formatDuration),
      higherIsBetter: false,
    },
    {
      key: "tools",
      label: "工具调用",
      value: (entry: ComparisonEntry) => isHttpTrial(entry.detail.summary) ? null : entry.detail.summary.toolCalls,
      format: (value: number | null | undefined) => formatNumber(value),
      delta: (value: number) => signed(value, formatNumber),
      higherIsBetter: false,
    },
    {
      key: "input",
      label: "输入 token",
      value: (entry: ComparisonEntry) => isHttpTrial(entry.detail.summary) ? null : entry.detail.summary.inputTokens,
      format: (value: number | null | undefined) => formatNumber(value),
      delta: (value: number) => signed(value, formatNumber),
      higherIsBetter: false,
    },
    {
      key: "output",
      label: "输出 token",
      value: (entry: ComparisonEntry) => isHttpTrial(entry.detail.summary) ? null : entry.detail.summary.outputTokens,
      format: (value: number | null | undefined) => formatNumber(value),
      delta: (value: number) => signed(value, formatNumber),
      higherIsBetter: false,
    },
  ];
  return (
    <div className="difference-overview">
      <Text type="secondary">得分和通过检查越高越好；用时、工具调用和 token 消耗越低越好。</Text>
      <NumberedTable
        rowKey="key"
        size="small"
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        dataSource={rows.filter((row) => !["tools", "input", "output"].includes(row.key) || entries.some((entry) => !isHttpTrial(entry.detail.summary)))}
        scroll={{ x: Math.max(824, 324 + entries.length * 250) }}
        columns={[
          { title: "指标", dataIndex: "label", width: 180 },
          ...entries.map((entry, index) => ({
            title: comparisonEntryTitle(entry, index === 0),
            key: entry.key,
            width: 230,
            render: (_: unknown, row: typeof rows[number]) => {
              const value = row.value(entry);
              const baselineValue = baseline ? row.value(baseline) : null;
              const comparableValues = entries.map((item) => row.value(item)).filter((item): item is number => typeof item === "number");
              const bestValue = comparableValues.length ? (row.higherIsBetter ? Math.max(...comparableValues) : Math.min(...comparableValues)) : null;
              const isBest = typeof value === "number" && value === bestValue;
              return (
                <div className={`multi-metric-value${isBest ? " is-best" : ""}`}>
                  <strong>{row.format(value, entry)}</strong>
                  <small>{index === 0 ? "比较基准" : typeof value === "number" && typeof baselineValue === "number" ? `较基准 ${row.delta(value - baselineValue)}` : "较基准 —"}</small>
                </div>
              );
            },
          })),
        ]}
      />
    </div>
  );
}

function ComparabilityNotice({ entries }: { entries: ComparisonEntry[] }) {
  const { locale } = useI18n();
  const signatures = (selector: (entry: ComparisonEntry) => unknown) => new Set(entries.map((entry) => stableValue(selector(entry))));
  const issues: string[] = [];
  const variables: string[] = [];
  const taskChecksums = signatures((entry) => entry.detail.summary.taskChecksum);
  const taskVersions = signatures((entry) => entry.detail.summary.taskVersion);
  const taskSources = signatures((entry) => entry.detail.summary.taskSource);
  const taskConfigs = signatures((entry) => entry.detail.summary.taskConfig);
  const environments = signatures((entry) => entry.detail.summary.environmentConfig);
  const verifierConfigs = signatures((entry) => entry.detail.summary.verifierConfig);
  const verifierModes = signatures((entry) => entry.detail.summary.verifierMode);
  const agentNames = signatures((entry) => entry.detail.summary.agent);
  const agentVersions = signatures((entry) => entry.detail.summary.agentVersion);
  const models = signatures((entry) => entry.detail.summary.model);
  const reasoningEfforts = signatures((entry) => entry.detail.summary.reasoningEffort);
  if (taskChecksums.size > 1) issues.push("Task checksum 不一致");
  if (taskVersions.size > 1) issues.push("Task 版本不一致");
  if (taskSources.size > 1) issues.push("Task 来源不一致");
  if (taskConfigs.size > 1) issues.push("Task 配置不一致");
  if (environments.size > 1) issues.push("运行环境配置不一致");
  if (verifierConfigs.size > 1) issues.push("Verifier 配置不一致");
  if (verifierModes.size > 1) issues.push("Verifier 环境模式不一致");
  if (agentNames.size > 1) issues.push("Agent 类型不一致");
  if (agentVersions.size > 1) issues.push("Agent 版本不一致");
  if (models.size > 1) variables.push("模型");
  if (reasoningEfforts.size > 1) variables.push("推理强度");
  if (!issues.length && !variables.length) return null;
  if (!issues.length) {
    return <div className="comparability-status" role="status">
      <Tag color="success">{tr("可直接比较")}</Tag>
      <Text type="secondary">{locale === "en" ? `Variables: ${variables.map((variable) => tr(variable)).join(", ")}` : `变量：${variables.join("、")}`}</Text>
      <Text type="secondary">{tr("其余关键配置一致")}</Text>
    </div>;
  }
  const checksumIssue = taskChecksums.size > 1;
  return <Alert
    className="comparability-notice"
    type={checksumIssue ? "error" : "warning"}
    showIcon
    message={tr(checksumIssue ? "当前组合不适合直接比较结果" : "当前组合存在可比性风险")}
    description={locale === "en"
      ? `${issues.map((issue) => tr(issue)).join("; ")}${issues.length ? ". " : ""}${variables.length ? `Comparison variables: ${variables.map((variable) => tr(variable)).join(", ")}. ` : ""}${tr("请在“技术信息”中核对配置差异，必要时仅将本次比较用于排障。")}`
      : `${issues.join("；")}。${variables.length ? `对比变量：${variables.join("、")}。` : ""}请在“技术信息”中核对配置差异，必要时仅将本次比较用于排障。`}
  />;
}

function SingleSummary({ detail }: { detail: TrialDetail }) {
  const http = isHttpTrial(detail.summary);
  const cells: Array<[string, ReactNode]> = [
    ["得分", formatScore(detail.summary.reward)],
    ["状态", <TrialStatusTag trial={detail.summary} />],
    ["尝试", attemptLabel(detail.summary)],
    ["通过检查", `${detail.summary.passed ?? "—"}/${detail.summary.total ?? "—"}`],
    ["执行用时", formatDuration(detail.summary.agentSeconds)],
    ["工具调用", formatNumber(detail.summary.toolCalls)],
    ["输入 token", formatNumber(detail.summary.inputTokens)],
    ["输出 token", formatNumber(detail.summary.outputTokens)],
  ];
  return (
    <div className="summary-strip single-summary-strip">
      {cells.filter(([label]) => !http || !["工具调用", "输入 token", "输出 token"].includes(label)).map(([label, value]) => (
        <div className="summary-cell" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function PhaseTimeline({ detail }: { detail: TrialDetail }) {
  const phases = detail.summary.phases ?? [];
  if (!phases.length) return null;
  return (
    <div className="phase-timeline" aria-label={tr("运行阶段时间线")}>
      {phases.map((phase) => (
        <div className="phase-item" key={phase.key}>
          <Space size={6}><Text strong>{tr(phase.label)}</Text>{phase.status === "failed" ? <Tag color="error">{tr("失败")}</Tag> : phase.status === "empty" ? <Tag>{tr("无文件")}</Tag> : undefined}</Space>
          <strong>{phase.seconds === null ? tr("未记录耗时") : formatDuration(phase.seconds)}</strong>
          <Text type="secondary">{tr(phase.note || (phase.startedAt ? formatDate(phase.startedAt) : "尚未开始"))}</Text>
        </div>
      ))}
    </div>
  );
}

function RewardDetailsPanel({ detail }: { detail: TrialDetail }) {
  const rewards = Object.entries(detail.summary.rewards ?? {});
  const detailText = detail.rewardDetails && typeof detail.rewardDetails === "object" && Object.keys(detail.rewardDetails as object).length
    ? JSON.stringify(detail.rewardDetails, null, 2)
    : "没有 reward-details.json；该 Trial 可能使用了自定义评分器或只写入了总分。";
  return (
    <Collapse items={[
      {
        key: "rewards",
        label: `Reward 维度${rewards.length ? `（${rewards.length}）` : ""}`,
        children: rewards.length ? <Descriptions bordered size="small" column={2} items={rewards.map(([name, value]) => ({ key: name, label: name, children: formatScore(value) }))} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可识别的 reward 维度" />,
      },
      {
        key: "sources",
        label: "评分来源与 Judge 详情",
        children: <>
          <Space wrap><Text type="secondary">已读取：</Text>{detail.summary.rewardSources.length ? detail.summary.rewardSources.map((source) => <Tag key={source}>{source}</Tag>) : <Text type="secondary">—</Text>}</Space>
          <pre className="json-view">{detailText}</pre>
        </>,
      },
      {
        key: "ctrf",
        label: "CTRF 测试结果",
        children: detail.ctrf && typeof detail.ctrf === "object" && Object.keys(detail.ctrf as object).length ? <pre className="json-view">{JSON.stringify(detail.ctrf, null, 2)}</pre> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有 ctrf.json" />,
      },
    ]} />
  );
}

function StepResultsPanel({ detail }: { detail: TrialDetail }) {
  const steps = detail.summary.stepResults ?? [];
  if (!steps.length) return null;
  return <Collapse items={[{
    key: "steps",
    label: `多步骤结果（${steps.length}）`,
    children: <NumberedTable
      rowKey="index"
      size="small"
      pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
      dataSource={steps}
      scroll={{ x: 1504 }}
      columns={[
        { title: "步骤", dataIndex: "index", width: 80, align: "center" as const },
        { title: "名称", dataIndex: "name", width: 180 },
        { title: "得分", dataIndex: "reward", width: 100, align: "center" as const, render: (value: number | null) => <Tag color={scoreColor(value)}>{formatScore(value)}</Tag> },
        { title: "耗时", dataIndex: "seconds", width: 110, align: "center" as const, render: formatDuration },
        { title: "交付物", dataIndex: "artifactCount", width: 100, align: "center" as const, render: (value: number) => `${value} 个` },
        { title: "输入 token", dataIndex: "inputTokens", width: 110, align: "center" as const, render: formatNumber },
        { title: "缓存 token", dataIndex: "cachedTokens", width: 110, align: "center" as const, render: formatNumber },
        { title: "输出 token", dataIndex: "outputTokens", width: 110, align: "center" as const, render: formatNumber },
        { title: "费用（USD）", dataIndex: "costUsd", width: 110, align: "center" as const, render: (value: number | null) => typeof value === "number" ? value.toFixed(4) : "—" },
        { title: "提前终止", dataIndex: "terminatedEarly", width: 110, align: "center" as const, render: (value: boolean) => value ? <Tag color="warning">是</Tag> : <Text type="secondary">否</Text> },
        { title: "结果", dataIndex: "exception", render: (exception: unknown) => exception ? <Text type="danger">{compactText(typeof exception === "string" ? exception : JSON.stringify(exception), 160)}</Text> : <Tag color="success">完成</Tag> },
      ]}
    />,
  }]} />;
}

function scoreEvaluatorPresentation(check?: ScoreCheck): { label: string; color: string; description?: string } {
  const raw = check?.evaluator_type?.trim();
  if (!raw) return { label: "未标注", color: "default", description: "原始评分结果未提供 evaluator_type" };
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (["program", "programmatic", "deterministic", "rule", "rule_based", "code"].includes(normalized)) {
    return { label: "程序检查", color: "cyan" };
  }
  if (["llm", "judge", "llm_judge", "model", "model_judge"].includes(normalized)) {
    return { label: "LLM Judge", color: "purple" };
  }
  if (["hybrid", "mixed", "combined"].includes(normalized)) {
    return { label: "混合评分", color: "gold" };
  }
  return { label: raw, color: "default", description: "未识别的 evaluator_type，按原值展示" };
}

function ScoreEvaluatorTag({ check }: { check?: ScoreCheck }) {
  const presentation = scoreEvaluatorPresentation(check);
  const tag = <Tag color={presentation.color}>{presentation.label}</Tag>;
  return presentation.description ? <Tooltip title={presentation.description}>{tag}</Tooltip> : tag;
}

function SingleScorePanel({ detail }: { detail: TrialDetail }) {
  const checks = detail.score.checks ?? [];
  const conflicts = detail.summary.rewardConflicts ?? [];
  return (
    <>
      {!!detail.summary.stepResults.length && detail.summary.reward === null && <Alert className="score-gate-alert" type="info" showIcon message="Trial 总分未知" description="未读取到 Trial 层级总分。各步骤评分仍可查看，最后一步分数不代表整个 Trial 的总分。" />}
      {conflicts.length > 0 && <Alert className="score-gate-alert" type="warning" showIcon message="评分来源存在冲突，当前以 Harbor result.json 为准" description={conflicts.map((item) => `${item.dimension}: ${item.canonicalSource}=${item.canonicalValue}，${item.conflictingSource}=${item.conflictingValue}`).join("；")} />}
      {detail.score.gate_failed && <Alert className="score-gate-alert" type="error" showIcon message="门槛检查未通过，总分受到门槛规则影响" />}
      <NumberedTable<ScoreCheck>
        rowKey="name"
        size="small"
        dataSource={checks}
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        scroll={{ x: 980 }}
        columns={[
          { title: "评分项", dataIndex: "name", width: 220, render: (value: string) => <span data-i18n-raw>{value}</span> },
          { title: "评分方式", width: 120, render: (_: unknown, check: ScoreCheck) => <ScoreEvaluatorTag check={check} /> },
          { title: "结果", dataIndex: "passed", width: 90, render: (passed: boolean) => <Tag color={passed ? "success" : "error"}>{passed ? "通过" : "失败"}</Tag> },
          { title: "权重", width: 80, render: (_: unknown, check: ScoreCheck) => typeof check.weight === "number" ? `${Math.round(check.weight * 100)}%` : "—" },
          { title: "门槛", width: 80, render: (_: unknown, check: ScoreCheck) => check.gate ? <Tag color="purple">是</Tag> : "否" },
          { title: "检查说明", dataIndex: "detail", render: (value: string | undefined) => value ? <span data-i18n-raw>{value}</span> : "—" },
        ]}
      />
      {(detail.stepScores?.length ?? 0) > 0 && <Collapse className="step-score-details" items={detail.stepScores!.map((item) => ({
        key: item.stepName,
        label: `步骤 ${item.stepName} 的评分明细`,
        children: <pre className="json-view">{JSON.stringify({ score: item.score, rewardDetails: item.rewardDetails, ctrf: item.ctrf }, null, 2)}</pre>,
      }))} />}
    </>
  );
}

function ScoreComparison({ entries }: { entries: ComparisonEntry[] }) {
  const [filter, setFilter] = useState<"differences" | "failures" | "all">("differences");
  const { locale } = useI18n();
  const checkMaps = entries.map((entry) => new Map((entry.detail.score.checks ?? []).map((check) => [check.name, check])));
  const names = Array.from(new Set(checkMaps.flatMap((checks) => Array.from(checks.keys()))));
  const rows = names.map((name) => {
    const checks = checkMaps.map((checkMap) => checkMap.get(name));
    const signatures = new Set(checks.map((check) => check ? JSON.stringify([check.passed, check.gate, check.weight, check.evaluator_type, check.detail]) : "missing"));
    const differs = signatures.size > 1;
    return {
      key: name,
      name,
      checks,
      differs,
      failed: checks.some((check) => check?.passed === false),
      gate: checks.some((check) => check?.gate),
      maxWeight: Math.max(...checks.map((check) => check?.weight ?? 0)),
    };
  }).sort((a, b) => Number(b.gate) - Number(a.gate)
    || b.maxWeight - a.maxWeight
    || a.name.localeCompare(b.name, "zh-CN"));
  const visibleRows = filter === "differences" ? rows.filter((row) => row.differs) : filter === "failures" ? rows.filter((row) => row.failed) : rows;
  const renderCheck = (check?: ScoreCheck) =>
    check ? (
      <div>
        <Tag color={check.passed ? "success" : "error"}>{check.passed ? "通过" : "失败"}</Tag>
        {check.detail && <div className="check-detail" data-i18n-raw>{check.detail}</div>}
      </div>
    ) : <Text type="secondary">无此检查</Text>;
  return (
    <div className="score-comparison-panel">
      <Flex className="comparison-filter-bar" justify="space-between" align="center" gap={12} wrap>
        <Space wrap>
          {entries.map((entry, index) => <Tag key={entry.key} color={entry.color}>{locale === "en" ? `${entry.marker} failed ${rows.filter((row) => row.checks[index]?.passed === false).length}` : `${entry.marker} 未通过 ${rows.filter((row) => row.checks[index]?.passed === false).length}`}</Tag>)}
        </Space>
        <Segmented
          value={filter}
          onChange={(value) => setFilter(value as "differences" | "failures" | "all")}
          options={[{ label: tr(`仅看差异 ${rows.filter((row) => row.differs).length}`), value: "differences" }, { label: tr("仅看未通过"), value: "failures" }, { label: tr("显示全部"), value: "all" }]}
        />
      </Flex>
      <NumberedTable
        className="score-comparison-table"
        rowKey="key"
        size="small"
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        dataSource={visibleRows}
        scroll={{ x: Math.max(1164, 714 + entries.length * 300) }}
        serialFixed
        columns={[
          { title: "评分项", dataIndex: "name", width: 260, fixed: "left", render: (value: string) => <span data-i18n-raw>{value}</span> },
          {
            title: "评分方式",
            width: 120,
            render: (_: unknown, row: typeof rows[number]) => {
              const labels = row.checks.map((check) => check ? scoreEvaluatorPresentation(check).label : "无此检查");
              return new Set(labels).size === 1
                ? <ScoreEvaluatorTag check={row.checks[0]} />
                : <Tooltip title={entries.map((entry, index) => `${entry.marker}：${labels[index]}`).join("；")}><Text type="warning">配置不同</Text></Tooltip>;
            },
          },
          {
            title: "权重",
            width: 80,
            render: (_: unknown, row: typeof rows[number]) => {
              const labels = row.checks.map((check) => !check ? "无此检查" : typeof check.weight === "number" ? `${Math.round(check.weight * 100)}%` : "—");
              return new Set(labels).size === 1 ? labels[0] : <Tooltip title={entries.map((entry, index) => `${entry.marker}：${labels[index]}`).join("；")}><Text type="warning">不同</Text></Tooltip>;
            },
          },
          {
            title: "门槛",
            width: 80,
            render: (_: unknown, row: typeof rows[number]) => {
              const labels = row.checks.map((check) => !check ? "无此检查" : check.gate ? "是" : "否");
              return new Set(labels).size === 1
                ? labels[0] === "是" ? <Tag color="purple">是</Tag> : labels[0]
                : <Tooltip title={entries.map((entry, index) => `${entry.marker}：${labels[index]}`).join("；")}><Text type="warning">不同</Text></Tooltip>;
            },
          },
          ...entries.map((entry, index) => ({
            title: <Space size={6} wrap>{comparisonEntryTitle(entry, index === 0)}<Tag color={scoreColor(entry.detail.summary.reward)}>{tr("总分")} {formatScore(entry.detail.summary.reward)}</Tag></Space>,
            key: entry.key,
            width: 300,
            render: (_: unknown, row: typeof rows[number]) => renderCheck(row.checks[index]),
          })),
          { title: tr("对比结果"), dataIndex: "differs", width: 105, fixed: "right" as const, render: (differs: boolean) => differs ? <Tag color="warning">{tr("存在差异")}</Tag> : <Text type="secondary">{tr("一致")}</Text> },
        ]}
      />
    </div>
  );
}

const processStatusPresentation: Record<ProcessStatus, { label: string; color: string }> = {
  success: { label: "成功", color: "success" },
  failure: { label: "失败", color: "error" },
  reply: { label: "回复", color: "default" },
  unknown: { label: "未知", color: "default" },
};

function ProcessStatusTag({ status }: { status: ProcessStatus }) {
  const presentation = processStatusPresentation[status];
  return <Tag color={presentation.color}>{tr(presentation.label)}</Tag>;
}

function EventDetails({ event }: { event?: ProcessEvent }) {
  if (!event) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={tr("这一侧没有对应事件")} />;
  const metric = (key: string) => typeof event.metrics[key] === "number" ? event.metrics[key] as number : null;
  const metricItems = [
    { key: "input", label: "输入 Token", value: metric("prompt_tokens") },
    { key: "output", label: "输出 Token", value: metric("completion_tokens") },
    { key: "cached", label: "缓存 Token", value: metric("cached_tokens") },
    { key: "reasoning", label: "推理 Token", value: typeof event.metrics.extra === "object" && event.metrics.extra !== null && typeof (event.metrics.extra as Record<string, unknown>).reasoning_output_tokens === "number" ? (event.metrics.extra as Record<string, number>).reasoning_output_tokens : null },
    { key: "cost", label: "费用", value: metric("cost_usd"), cost: true },
  ].filter((item) => item.value !== null).map((item) => ({
    key: item.key,
    label: item.label,
    children: item.cost ? `$${item.value!.toFixed(6)}` : formatNumber(item.value),
  }));
  return (
    <div className="event-expanded">
      {event.stepName && <Text type="secondary">{tr("业务步骤")}：{event.stepName}</Text>}
      {typeof event.rawStep === "number" && event.rawStep !== event.step && <Text type="secondary">{tr("原始轨迹编号：")}{event.rawStep}</Text>}
      {metricItems.length > 0 && <><Text strong>{tr("资源消耗")}</Text><Descriptions size="small" bordered column={metricItems.length} items={metricItems} /></>}
      {event.message && <><Text strong>{tr("Agent 输出")}</Text><pre>{event.message}</pre></>}
      {event.arguments != null && <><Text strong>{tr("调用参数")}</Text><pre>{JSON.stringify(event.arguments, null, 2)}</pre></>}
      {event.observation != null && <><Text strong>{tr("执行结果")}</Text><pre>{JSON.stringify(event.observation, null, 2)}</pre></>}
    </div>
  );
}

function EventTable({ events, label = "Trial" }: { events: ProcessEvent[]; label?: string }) {
  return (
    <NumberedTable<ProcessEvent>
      className="event-table"
      rowKey="key"
      size="small"
      dataSource={events}
      showSerial={false}
      pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
      rowClassName={(row) => row.status === "failure" ? "process-failure-row" : ""}
      scroll={{ x: 980 }}
      expandable={{
        expandIcon: ({ expanded, onExpand, record }) => (
          <Button
            type="text"
            size="small"
            aria-label={tr(`${expanded ? "收起" : "展开"} ${label} 第 ${record.step} 步 ${record.tool}`)}
            onClick={(event) => onExpand(record, event)}
          >
            {expanded ? "−" : "+"}
          </Button>
        ),
        expandedRowRender: (event) => <EventDetails event={event} />,
      }}
      columns={[
        { title: "步骤", dataIndex: "step", width: 70 },
        {
          title: "时间",
          dataIndex: "timestamp",
          width: 105,
          render: (value: string) => <Tooltip title={formatDate(value)}>{formatTime(value)}</Tooltip>,
        },
        {
          title: <Tooltip title="根据当前步骤与下一个 Agent 轨迹时间戳的差值估算，包含模型思考、命令执行和等待时间">间隔耗时</Tooltip>,
          dataIndex: "intervalSeconds",
          width: 105,
          render: (value: number | null) => value === null ? <Text type="secondary">—</Text> : formatDuration(value),
        },
        { title: "业务动作", width: 130, render: (_: unknown, row) => processAction(row) },
        { title: "状态", dataIndex: "status", width: 88, render: (value: ProcessStatus) => <ProcessStatusTag status={value} /> },
        { title: "内容摘要", render: (_: unknown, row) => processSummary(row) },
      ]}
    />
  );
}

function ProcessComparison({ left, right }: { left?: TrialDetail; right?: TrialDetail }) {
  const [filter, setFilter] = useState<"differences" | "all">("differences");
  const [selectedRowKey, setSelectedRowKey] = useState("");
  const { locale } = useI18n();
  const leftEvents = processEvents(left?.trajectory.steps);
  const rightEvents = processEvents(right?.trajectory.steps);
  const rows = alignProcessEvents(leftEvents, rightEvents);
  const differenceCount = rows.filter((row) => row.difference !== "same").length;
  const visibleRows = filter === "differences" ? rows.filter((row) => row.difference !== "same") : rows;
  const leftOnlyCount = rows.filter((row) => row.difference === "left-only").length;
  const rightOnlyCount = rows.filter((row) => row.difference === "right-only").length;
  const detailDifferenceCount = rows.filter((row) => row.difference === "detail").length;
  const leftFailureCount = leftEvents.filter((event) => event.status === "failure").length;
  const rightFailureCount = rightEvents.filter((event) => event.status === "failure").length;
  const renderEvent = (event?: ProcessEvent) => event ? (
    <div className="aligned-event-cell">
      <Space size={6} wrap><Text strong>{processAction(event)}</Text><ProcessStatusTag status={event.status} /></Space>
      <div className="event-meta">
        {event.stepName && <><span>{event.stepName}</span><span>·</span></>}
        <Tooltip title={formatDate(event.timestamp)}>{formatTime(event.timestamp)}</Tooltip>
        <span>·</span>
        <Tooltip title={tr("相邻 Agent 轨迹时间戳差值（估算）")}>{locale === "en" ? "Interval" : "间隔"} {formatDuration(event.intervalSeconds)}</Tooltip>
      </div>
      <div className="check-detail">{processSummary(event)}</div>
    </div>
  ) : <Text type="secondary">—</Text>;
  const differenceLabel = (difference: AlignedProcessEvent["difference"]) => {
    if (difference === "same") return <Tag color="success">{tr("一致")}</Tag>;
    if (difference === "detail") return <Tag color="warning">{tr("细节不同")}</Tag>;
    if (difference === "left-only") return <Tag color="cyan">{tr("仅 A")}</Tag>;
    return <Tag color="geekblue">{tr("仅 B")}</Tag>;
  };
  const intervalDifference = (row: AlignedProcessEvent) => {
    const leftSeconds = row.left?.intervalSeconds;
    const rightSeconds = row.right?.intervalSeconds;
    if (typeof leftSeconds !== "number" || typeof rightSeconds !== "number") return <Text type="secondary">—</Text>;
    const difference = rightSeconds - leftSeconds;
    return <Text type={Math.abs(difference) >= 10 ? "warning" : "secondary"}>{difference > 0 ? "+" : difference < 0 ? "−" : ""}{formatDuration(Math.abs(difference))}</Text>;
  };
  return (
    <div>
      <Flex className="comparison-filter-bar" justify="space-between" align="center" gap={12} wrap>
        <Space wrap>
          <Tag>{locale === "en" ? `A steps ${leftEvents.length}` : `A 步骤 ${leftEvents.length}`}</Tag>
          <Tag>{locale === "en" ? `B steps ${rightEvents.length}` : `B 步骤 ${rightEvents.length}`}</Tag>
          <Tag color="warning">{locale === "en" ? `Details differ ${detailDifferenceCount}` : `细节不同 ${detailDifferenceCount}`}</Tag>
          <Tag color="cyan">{locale === "en" ? `A only ${leftOnlyCount}` : `仅 A ${leftOnlyCount}`}</Tag>
          <Tag color="geekblue">{locale === "en" ? `B only ${rightOnlyCount}` : `仅 B ${rightOnlyCount}`}</Tag>
          {(leftFailureCount > 0 || rightFailureCount > 0) && <Tag color="error">{locale === "en" ? `Failed steps A ${leftFailureCount} / B ${rightFailureCount}` : `失败步骤 A ${leftFailureCount} / B ${rightFailureCount}`}</Tag>}
        </Space>
        <Segmented value={filter} onChange={(value) => setFilter(value as "differences" | "all")} options={[{ label: tr(`仅看差异 ${differenceCount}`), value: "differences" }, { label: tr(`显示全部 ${rows.length}`), value: "all" }]} />
      </Flex>
      <NumberedTable<AlignedProcessEvent>
        className="aligned-process-table"
        rowKey="key"
        size="small"
        dataSource={visibleRows}
        showSerial={false}
        locale={{ emptyText: tr(filter === "differences" && rows.length ? "两侧结构化执行过程一致；切换到“显示全部”可查看完整步骤" : "没有可显示的执行步骤") }}
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        rowClassName={(row) => [row.difference === "same" ? "" : "divergence-row", row.key === selectedRowKey ? "selected-comparison-row" : ""].filter(Boolean).join(" ")}
        onRow={(row) => ({ onClick: () => setSelectedRowKey(row.key) })}
        expandable={{
          expandedRowRender: (row) => (
            <div className="aligned-event-details">
              <Card size="small" title={`A · ${left?.summary.model || "模型 A"}`}><EventDetails event={row.left} /></Card>
              <Card size="small" title={`B · ${right?.summary.model || "模型 B"}`}><EventDetails event={row.right} /></Card>
            </div>
          ),
        }}
        scroll={{ x: 1144 }}
        serialFixed
        columns={[
          { title: "阶段", dataIndex: "step", width: 72, fixed: "left" },
          { title: "业务动作", dataIndex: "action", width: 150 },
          { title: `A · ${left?.summary.model || "模型 A"}`, dataIndex: "left", render: renderEvent },
          { title: `B · ${right?.summary.model || "模型 B"}`, dataIndex: "right", render: renderEvent },
          { title: <Tooltip title={tr("B 与 A 的相邻轨迹时间戳间隔差值")}>{tr("间隔差 B−A")}</Tooltip>, width: 120, render: (_: unknown, row) => intervalDifference(row) },
          { title: tr("差异"), dataIndex: "difference", width: 110, render: differenceLabel },
        ]}
      />
    </div>
  );
}

type LogDifference = "same" | "changed" | "left-only" | "right-only";

interface LogDiffRow {
  key: string;
  leftNumber?: number;
  leftText?: string;
  rightNumber?: number;
  rightText?: string;
  difference: LogDifference;
}

function alignLogLines(leftLog = "", rightLog = ""): LogDiffRow[] {
  const leftLines = leftLog ? leftLog.split(/\r?\n/) : [];
  const rightLines = rightLog ? rightLog.split(/\r?\n/) : [];
  const rows: LogDiffRow[] = [];
  const lookAhead = 40;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length) {
    const leftText = leftLines[leftIndex];
    const rightText = rightLines[rightIndex];
    if (leftIndex < leftLines.length && rightIndex < rightLines.length && leftText === rightText) {
      rows.push({ key: `log-${rows.length}`, leftNumber: leftIndex + 1, leftText, rightNumber: rightIndex + 1, rightText, difference: "same" });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    const nextLeftMatch = rightIndex < rightLines.length
      ? leftLines.slice(leftIndex + 1, leftIndex + lookAhead + 1).findIndex((line) => line === rightText)
      : -1;
    const nextRightMatch = leftIndex < leftLines.length
      ? rightLines.slice(rightIndex + 1, rightIndex + lookAhead + 1).findIndex((line) => line === leftText)
      : -1;
    if (leftIndex < leftLines.length && nextLeftMatch >= 0 && (nextRightMatch < 0 || nextLeftMatch <= nextRightMatch)) {
      rows.push({ key: `log-${rows.length}`, leftNumber: leftIndex + 1, leftText, difference: "left-only" });
      leftIndex += 1;
    } else if (rightIndex < rightLines.length && nextRightMatch >= 0) {
      rows.push({ key: `log-${rows.length}`, rightNumber: rightIndex + 1, rightText, difference: "right-only" });
      rightIndex += 1;
    } else if (leftIndex < leftLines.length && rightIndex < rightLines.length) {
      rows.push({ key: `log-${rows.length}`, leftNumber: leftIndex + 1, leftText, rightNumber: rightIndex + 1, rightText, difference: "changed" });
      leftIndex += 1;
      rightIndex += 1;
    } else if (leftIndex < leftLines.length) {
      rows.push({ key: `log-${rows.length}`, leftNumber: leftIndex + 1, leftText, difference: "left-only" });
      leftIndex += 1;
    } else {
      rows.push({ key: `log-${rows.length}`, rightNumber: rightIndex + 1, rightText, difference: "right-only" });
      rightIndex += 1;
    }
  }
  return rows;
}

function LogComparison({ left, right }: { left?: TrialDetail; right?: TrialDetail }) {
  const [filter, setFilter] = useState<"differences" | "all">("differences");
  const [search, setSearch] = useState("");
  const [activeDifference, setActiveDifference] = useState(-1);
  const tableRef = useRef<HTMLDivElement>(null);
  const { locale } = useI18n();
  const rows = useMemo(() => alignLogLines(left?.agentLog, right?.agentLog), [left?.agentLog, right?.agentLog]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (filter === "differences" && row.difference === "same") return false;
    return !normalizedSearch || `${row.leftText || ""}\n${row.rightText || ""}`.toLowerCase().includes(normalizedSearch);
  });
  const differenceRows = visibleRows.filter((row) => row.difference !== "same");
  const differenceBlocks = rows.reduce((count, row, index) => row.difference !== "same" && (index === 0 || rows[index - 1].difference === "same") ? count + 1 : count, 0);
  const focusDifference = (offset: number) => {
    if (!differenceRows.length) return;
    const startingIndex = activeDifference < 0 ? (offset > 0 ? -1 : 0) : activeDifference;
    const nextIndex = (startingIndex + offset + differenceRows.length) % differenceRows.length;
    setActiveDifference(nextIndex);
    const row = tableRef.current?.querySelector(`[data-row-key="${differenceRows[nextIndex].key}"]`) as HTMLElement | null;
    const body = tableRef.current?.querySelector(".ant-table-body") as HTMLElement | null;
    if (row && body) body.scrollTo({ top: Math.max(0, row.offsetTop - body.clientHeight / 3), behavior: "smooth" });
  };
  const differenceTag = (difference: LogDifference) => {
    if (difference === "changed") return <Tag color="warning">{tr("修改")}</Tag>;
    if (difference === "left-only") return <Tag color="cyan">{tr("仅 A")}</Tag>;
    if (difference === "right-only") return <Tag color="geekblue">{tr("仅 B")}</Tag>;
    return <Text type="secondary">{tr("一致")}</Text>;
  };
  if (!left?.agentLog && !right?.agentLog) return <Empty description={tr("两侧都没有 Agent 日志")} />;
  return (
    <div ref={tableRef} className="log-comparison">
      <Flex className="comparison-filter-bar" justify="space-between" align="center" gap={12} wrap>
        <Space wrap>
          <Tag color="warning">{locale === "en" ? `Difference blocks ${differenceBlocks}` : `差异块 ${differenceBlocks}`}</Tag>
          <Button size="small" disabled={!differenceRows.length} onClick={() => focusDifference(-1)}>{tr("上一处")}</Button>
          <Button size="small" disabled={!differenceRows.length} onClick={() => focusDifference(1)}>{tr("下一处")}</Button>
        </Space>
        <Space wrap>
          <Input.Search allowClear value={search} onChange={(event) => { setSearch(event.target.value); setActiveDifference(-1); }} placeholder={tr("搜索两侧日志")} className="log-diff-search" />
          <Segmented value={filter} onChange={(value) => { setFilter(value as "differences" | "all"); setActiveDifference(-1); }} options={[{ label: tr(`仅看差异 ${rows.filter((row) => row.difference !== "same").length}`), value: "differences" }, { label: tr(`显示全部 ${rows.length}`), value: "all" }]} />
        </Space>
      </Flex>
      <NumberedTable<LogDiffRow>
        className="log-diff-table"
        rowKey="key"
        size="small"
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        dataSource={visibleRows}
        locale={{ emptyText: tr(normalizedSearch ? "没有匹配的日志行" : filter === "differences" && rows.length ? "两侧日志一致；切换到“显示全部”可查看完整日志" : "没有可显示的日志") }}
        rowClassName={(row) => row.difference === "same" ? "" : `log-${row.difference}-row`}
        scroll={{ x: 1244, y: 560 }}
        serialFixed
        columns={[
          { title: tr("A 行"), dataIndex: "leftNumber", width: 72, fixed: "left", render: (value?: number) => value ?? "" },
          { title: `A · ${left?.summary.model || "模型 A"}`, dataIndex: "leftText", render: (value?: string) => <code className="log-line-text">{value ?? ""}</code> },
          { title: tr("B 行"), dataIndex: "rightNumber", width: 72, render: (value?: number) => value ?? "" },
          { title: `B · ${right?.summary.model || "模型 B"}`, dataIndex: "rightText", render: (value?: string) => <code className="log-line-text">{value ?? ""}</code> },
          { title: tr("差异"), dataIndex: "difference", width: 92, fixed: "right", render: differenceTag },
        ]}
      />
    </div>
  );
}

function technicalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return tr(value ? "是" : "否");
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function TechnicalComparison({ entries }: { entries: ComparisonEntry[] }) {
  const [filter, setFilter] = useState<"differences" | "all">("differences");
  const status = (detail?: TrialDetail) => detail ? trialStatusPresentation(detail.summary).label : "—";
  const fields: Array<[string, string, (detail: TrialDetail) => unknown]> = [
    ["taskName", "Task", (detail) => detail.summary.taskName],
    ["taskChecksum", "Task checksum", (detail) => detail.summary.taskChecksum],
    ["taskVersion", "Task 版本", (detail) => detail.summary.taskVersion],
    ["taskSource", "Task 来源", (detail) => detail.summary.taskSource],
    ["verifierMode", "Verifier 模式", (detail) => detail.summary.verifierMode],
    ["schemaVersion", "轨迹 Schema", (detail) => detail.trajectory.schema_version],
    ["sessionId", "Session ID", (detail) => detail.trajectory.session_id],
    ["model", "模型", (detail) => detail.summary.model],
    ["agent", "Agent", (detail) => detail.summary.agent],
    ["agentVersion", "Agent 版本", (detail) => detail.summary.agentVersion],
    ["reasoning", "推理强度", (detail) => detail.summary.reasoningEffort],
    ["status", "运行状态", status],
    ["attempt", "Attempt", (detail) => attemptLabel(detail.summary)],
    ["regrade", "Regrade 来源", (detail) => detail.summary.isRegrade ? detail.summary.sourceTrial : "原始 Trial"],
    ["sourceReward", "Regrade 原评分", (detail) => detail.summary.isRegrade ? formatScore(detail.summary.sourceReward) : "—"],
    ["regradeDelta", "Regrade 分数变化", (detail) => typeof detail.summary.regradeDelta === "number" ? `${detail.summary.regradeDelta >= 0 ? "+" : ""}${detail.summary.regradeDelta.toFixed(3)}` : "—"],
    ["exception", "异常信息", (detail) => detail.summary.exception],
    ["startedAt", "开始时间", (detail) => formatDate(detail.summary.startedAt)],
    ["finishedAt", "结束时间", (detail) => formatDate(detail.summary.finishedAt)],
    ["agentSeconds", "Agent 用时", (detail) => formatDuration(detail.summary.agentSeconds)],
    ["reward", "得分", (detail) => formatScore(detail.summary.reward)],
    ["rewardSources", "评分来源", (detail) => detail.summary.rewardSources],
    ["checks", "通过检查", (detail) => `${detail.summary.passed ?? "—"}/${detail.summary.total ?? "—"}`],
    ["gateFailed", "门槛检查失败", (detail) => detail.summary.gateFailed],
    ["inputTokens", "输入 token", (detail) => isHttpTrial(detail.summary) ? null : formatNumber(detail.summary.inputTokens)],
    ["cachedTokens", "缓存 token", (detail) => isHttpTrial(detail.summary) ? null : formatNumber(detail.summary.cachedTokens)],
    ["outputTokens", "输出 token", (detail) => isHttpTrial(detail.summary) ? null : formatNumber(detail.summary.outputTokens)],
    ["cost", "费用（USD）", (detail) => detail.summary.costUsd],
    ["steps", "Agent 步骤", (detail) => detail.summary.agentSteps],
    ["toolCalls", "工具调用", (detail) => detail.summary.toolCalls],
    ["artifacts", "交付物数量", (detail) => detail.summary.artifacts.length],
    ["taskConfig", "Task 配置", (detail) => detail.summary.taskConfig],
    ["agentConfig", "Agent 配置", (detail) => detail.summary.agentConfig],
    ["environmentConfig", "环境配置", (detail) => detail.summary.environmentConfig],
    ["verifierConfig", "Verifier 配置", (detail) => detail.summary.verifierConfig],
  ];
  const rows = fields.map(([key, label, getter]) => {
    const values = entries.map((entry) => technicalValue(getter(entry.detail)));
    return { key, label: tr(label), values, differs: new Set(values).size > 1 };
  });
  const visibleRows = filter === "differences" ? rows.filter((row) => row.differs) : rows;
  return (
    <div className="technical-comparison">
      <Flex className="comparison-filter-bar" justify="flex-end">
        <Segmented value={filter} onChange={(value) => setFilter(value as "differences" | "all")} options={[{ label: tr(`仅看差异 ${rows.filter((row) => row.differs).length}`), value: "differences" }, { label: tr("显示全部"), value: "all" }]} />
      </Flex>
      <NumberedTable
        rowKey="key"
        size="small"
        pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
        dataSource={visibleRows}
        rowClassName={(row) => row.differs ? "technical-difference-row" : ""}
        scroll={{ x: Math.max(964, 344 + entries.length * 290), y: 520 }}
        serialFixed
        columns={[
          { title: "字段", dataIndex: "label", width: 180, fixed: "left" as const },
          ...entries.map((entry, index) => ({ title: comparisonEntryTitle(entry, index === 0), key: entry.key, width: 290, render: (_: unknown, row: typeof rows[number]) => <span className="technical-value">{row.values[index]}</span> })),
          { title: tr("对比结果"), dataIndex: "differs", width: 105, fixed: "right" as const, render: (differs: boolean) => differs ? <Tag color="warning">{tr("不同")}</Tag> : <Text type="secondary">{tr("一致")}</Text> },
        ]}
      />
      <Collapse className="technical-raw-collapse" items={[{
        key: "raw",
        label: tr("查看完整原始字段"),
        children: <div className="technical-raw-grid">{entries.map((entry, index) => <Card size="small" key={entry.key} title={comparisonEntryTitle(entry, index === 0)}><pre className="json-view">{JSON.stringify(entry.detail.result, null, 2)}</pre></Card>)}</div>,
      }]} />
    </div>
  );
}

function TrialMetadataPanel({ detail, label }: { detail?: TrialDetail; label: string }) {
  if (!detail) return <Empty description={`没有${label}技术信息`} />;
  return (
    <Collapse items={[
      { key: "result", label: "Trial 结果 JSON", children: <pre className="json-view">{JSON.stringify(detail.result, null, 2)}</pre> },
      { key: "trajectory", label: "轨迹元数据", children: <Descriptions column={1} bordered size="small" items={[
        { key: "schema", label: "Schema", children: detail.trajectory.schema_version || "—" },
        { key: "session", label: "Session", children: detail.trajectory.session_id || "—" },
      ]} /> },
    ]} />
  );
}

function artifactStoragePath(artifact: TrialSummary["artifacts"][number]): string {
  return artifact.storagePath || artifact.relativePath;
}

function ArtifactPanel({ job, detail }: { job?: JobSummary; detail?: TrialDetail }) {
  const { message } = AntApp.useApp();
  const [preview, setPreview] = useState<ArtifactPreview>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  if (!job || !detail) return <Empty description="请选择有交付物的 Trial" />;

  const openPreview = async (relativePath: string) => {
    setPreviewOpen(true);
    setPreview(undefined);
    setPreviewLoading(true);
    try {
      setPreview(await api.artifactPreview(job.key, detail.summary.name, relativePath));
    } catch (error) {
      setPreviewOpen(false);
      message.error(error instanceof Error ? error.message : "无法生成交付物预览");
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewContent = preview?.kind === "spreadsheet" ? (
    <Tabs
      className="artifact-preview-tabs"
      onTabClick={() => preservePagePosition(() => undefined)}
      items={(preview.sheets || []).map((sheet) => ({
        key: sheet.name,
        label: sheet.name,
        children: (
          <div className="artifact-sheet-preview">
            <Text type="secondary">
              共 {formatNumber(sheet.totalRows)} 行、{formatNumber(sheet.totalColumns)} 列；预览前 {formatNumber(sheet.rows.length)} 行、最多 16 列
            </Text>
            <div className="artifact-preview-table-wrap">
              <table className="artifact-preview-table">
                <tbody>
                  {sheet.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      <th>{rowIndex + 1}</th>
                      {row.map((cell, columnIndex) => <td key={columnIndex}>{cell || " "}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ),
      }))}
    />
  ) : preview?.kind === "unsupported" ? (
    <Empty description={preview.message || "该文件暂不支持在线预览"} />
  ) : preview ? (
    <pre className="artifact-text-preview">{preview.text || "文件中没有可显示的文本"}</pre>
  ) : null;

  return (
    <>
      {detail.summary.artifactManifest.length > 0 && <Collapse className="artifact-manifest" items={[{
        key: "manifest",
        label: `交付物采集状态（${detail.summary.artifactManifest.length}）`,
        children: <NumberedTable
          rowKey={(entry) => `${entry.stepName || "trial"}:${entry.destination || ""}:${entry.source || ""}`}
          size="small"
          pagination={{ pageSize: DEFAULT_TABLE_PAGE_SIZE, showSizeChanger: false, hideOnSinglePage: true }}
          dataSource={detail.summary.artifactManifest}
          scroll={{ x: 974 }}
          columns={[
            { title: "步骤", dataIndex: "stepName", width: 150, render: (value: string | undefined) => value || "Trial" },
            { title: "来源", dataIndex: "source", width: 250 },
            { title: "采集结果", dataIndex: "status", width: 120, align: "center" as const, render: (value: string) => <Tag color={value === "ok" ? "success" : value === "empty" ? "default" : value === "skipped" ? "warning" : "error"}>{value === "ok" ? "成功" : value === "empty" ? "为空" : value === "skipped" ? "跳过" : "失败"}</Tag> },
            { title: "服务", dataIndex: "service", width: 130, align: "center" as const, render: (value: string | null) => value || "主容器" },
            { title: "保存位置", dataIndex: "destination" },
          ]}
        />,
      }]} />}
      <div className="artifact-list">
        {detail.summary.artifacts.length ? detail.summary.artifacts.map((artifact) => (
          <Card size="small" key={artifactStoragePath(artifact)}>
            <Flex align="center" justify="space-between" gap={16}>
              <Space><FileSearchOutlined /><div><Text strong>{artifact.name}</Text><div className="secondary-line">{artifact.relativePath} · {formatNumber(artifact.size)} {tr("字节")}</div></div></Space>
              <Space>
                <Button aria-label={tr(`预览 ${detail.summary.model || "当前 Trial"} 的 ${artifact.name}`)} icon={<FileSearchOutlined />} onClick={() => openPreview(artifactStoragePath(artifact))}>{tr("预览")}</Button>
                <Button aria-label={tr(`下载 ${detail.summary.model || "当前 Trial"} 的 ${artifact.name}`)} href={artifactUrl(job.key, detail.summary.name, artifactStoragePath(artifact))}>{tr("下载")}</Button>
              </Space>
            </Flex>
          </Card>
        )) : <Empty description={detail.summary.artifactManifest.some((entry) => entry.status === "failed") ? "交付物采集失败，请查看上方采集状态" : "这个 Trial 没有保存交付物"} />}
      </div>
      <Modal
        className="artifact-preview-modal"
        title={`交付物预览${preview?.name ? ` · ${preview.name}` : ""}`}
        open={previewOpen}
        width="min(1120px, calc(100vw - 32px))"
        scrollLock={false}
        footer={preview ? <Text type="secondary">{tr("预览仅展示部分内容；完整内容请下载文件后查看。")}</Text> : null}
        onCancel={() => setPreviewOpen(false)}
      >
        {previewLoading ? <div className="loading-panel"><Spin tip={tr("正在读取交付物")} /></div> : previewContent}
      </Modal>
    </>
  );
}

function ArtifactComparisonPreview({
  preview,
  activeSheet,
  scrollRef,
  onScroll,
}: {
  preview?: ArtifactPreview;
  activeSheet: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (element: HTMLDivElement) => void;
}) {
  const { locale } = useI18n();
  if (!preview) return <Empty description={tr("没有可预览的交付物")} />;
  if (preview.kind === "unsupported") return <Empty description={tr(preview.message || "该文件暂不支持在线预览")} />;
  if (preview.kind !== "spreadsheet") {
    return (
      <div ref={scrollRef} className="artifact-comparison-text-wrap" onScroll={(event) => onScroll(event.currentTarget)}>
        <pre className="artifact-text-preview">{preview.text || tr("文件中没有可显示的文本")}</pre>
      </div>
    );
  }

  const sheets = preview.sheets || [];
  const sheet = sheets.find((item) => item.name === activeSheet) || sheets[0];
  if (!sheet) return <Empty description={tr("工作簿中没有可预览的工作表")} />;
  return (
    <div className="artifact-sheet-preview">
      <Text type="secondary">
        {locale === "en"
          ? `${sheet.name} · ${formatNumber(sheet.totalRows)} rows, ${formatNumber(sheet.totalColumns)} columns; first ${formatNumber(sheet.rows.length)} rows, up to 16 columns`
          : `${sheet.name} · 共 ${formatNumber(sheet.totalRows)} 行、${formatNumber(sheet.totalColumns)} 列；预览前 ${formatNumber(sheet.rows.length)} 行、最多 16 列`}
      </Text>
      <div ref={scrollRef} className="artifact-preview-table-wrap" onScroll={(event) => onScroll(event.currentTarget)}>
        <table className="artifact-preview-table">
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th>{rowIndex + 1}</th>
                {row.map((cell, columnIndex) => <td key={columnIndex}>{cell || " "}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ArtifactComparisonPanel({
  leftJob,
  leftDetail,
  rightJob,
  rightDetail,
}: {
  leftJob?: JobSummary;
  leftDetail?: TrialDetail;
  rightJob?: JobSummary;
  rightDetail?: TrialDetail;
}) {
  const { message } = AntApp.useApp();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leftPath, setLeftPath] = useState("");
  const [rightPath, setRightPath] = useState("");
  const [leftPreview, setLeftPreview] = useState<ArtifactPreview>();
  const [rightPreview, setRightPreview] = useState<ArtifactPreview>();
  const [activeSheet, setActiveSheet] = useState("");
  const [syncScroll, setSyncScroll] = useState(true);
  const previewRequestRef = useRef(0);
  const scrollSyncRef = useRef(false);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const leftArtifacts = leftDetail?.summary.artifacts || [];
  const rightArtifacts = rightDetail?.summary.artifacts || [];
  const canCompare = Boolean(leftJob && rightJob && leftDetail && rightDetail && leftArtifacts.length && rightArtifacts.length);

  const commonSheets = useMemo(() => {
    if (leftPreview?.kind !== "spreadsheet" || rightPreview?.kind !== "spreadsheet") return [];
    const rightNames = new Set((rightPreview.sheets || []).map((sheet) => sheet.name));
    return (leftPreview.sheets || []).map((sheet) => sheet.name).filter((name) => rightNames.has(name));
  }, [leftPreview, rightPreview]);

  const loadPreviews = async (nextLeftPath: string, nextRightPath: string) => {
    if (!leftJob || !rightJob || !leftDetail || !rightDetail || !nextLeftPath || !nextRightPath) return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setLoading(true);
    try {
      const [nextLeftPreview, nextRightPreview] = await Promise.all([
        api.artifactPreview(leftJob.key, leftDetail.summary.name, nextLeftPath),
        api.artifactPreview(rightJob.key, rightDetail.summary.name, nextRightPath),
      ]);
      if (previewRequestRef.current !== requestId) return;
      setLeftPreview(nextLeftPreview);
      setRightPreview(nextRightPreview);
      const rightSheetNames = new Set((nextRightPreview.sheets || []).map((sheet) => sheet.name));
      const nextCommonSheets = (nextLeftPreview.sheets || []).map((sheet) => sheet.name).filter((name) => rightSheetNames.has(name));
      setActiveSheet((current) => nextCommonSheets.includes(current) ? current : nextCommonSheets[0] || "");
    } catch (error) {
      if (previewRequestRef.current === requestId) message.error(error instanceof Error ? error.message : "无法生成交付物对比预览");
    } finally {
      if (previewRequestRef.current === requestId) setLoading(false);
    }
  };

  const openComparison = () => {
    if (!canCompare) return;
    const nextLeftPath = artifactStoragePath(leftArtifacts[0]);
    const matchingRight = rightArtifacts.find((artifact) => artifact.relativePath === leftArtifacts[0].relativePath)
      || rightArtifacts.find((artifact) => artifact.name === leftArtifacts[0].name)
      || rightArtifacts[0];
    const nextRightPath = artifactStoragePath(matchingRight);
    setLeftPath(nextLeftPath);
    setRightPath(nextRightPath);
    setLeftPreview(undefined);
    setRightPreview(undefined);
    preservePagePosition(() => setOpen(true));
    void loadPreviews(nextLeftPath, nextRightPath);
  };

  const syncPaneScroll = (source: "left" | "right", element: HTMLDivElement) => {
    if (!syncScroll || scrollSyncRef.current) return;
    const target = source === "left" ? rightScrollRef.current : leftScrollRef.current;
    if (!target) return;
    scrollSyncRef.current = true;
    target.scrollLeft = element.scrollLeft;
    target.scrollTop = element.scrollTop;
    window.requestAnimationFrame(() => { scrollSyncRef.current = false; });
  };

  const artifactOptions = (artifacts: typeof leftArtifacts) => artifacts.map((artifact) => ({
    label: `${artifact.name} · ${formatNumber(artifact.size)} ${tr("字节")}`,
    value: artifactStoragePath(artifact),
  }));

  return (
    <>
      <Flex className="artifact-comparison-toolbar" justify="flex-end">
        <Button type="primary" icon={<SwapOutlined />} disabled={!canCompare} onClick={openComparison}>{tr("对比预览")}</Button>
      </Flex>
      <div className="process-grid artifact-comparison-cards">
        <Card size="small" title={leftDetail?.summary.model || "模型 A"}><ArtifactPanel job={leftJob} detail={leftDetail} /></Card>
        <Card size="small" title={rightDetail?.summary.model || "模型 B"}><ArtifactPanel job={rightJob} detail={rightDetail} /></Card>
      </div>
      <Modal
        className="artifact-comparison-modal"
        title={tr("交付物对比预览")}
        open={open}
        width="min(1600px, calc(100vw - 32px))"
        scrollLock={false}
        footer={<Text type="secondary">{tr("预览仅展示部分内容；完整内容请分别下载文件后查看。")}</Text>}
        onCancel={() => setOpen(false)}
      >
        <div className="artifact-comparison-controls">
          <label><span>A · {leftDetail?.summary.model || "模型 A"}</span><Select value={leftPath} options={artifactOptions(leftArtifacts)} onChange={(value) => { setLeftPath(value); void loadPreviews(value, rightPath); }} /></label>
          <label><span>B · {rightDetail?.summary.model || "模型 B"}</span><Select value={rightPath} options={artifactOptions(rightArtifacts)} onChange={(value) => { setRightPath(value); void loadPreviews(leftPath, value); }} /></label>
          <Space wrap className="artifact-comparison-options">
            <Text type="secondary">{tr("同步滚动")}</Text>
            <Switch checked={syncScroll} onChange={setSyncScroll} />
            {commonSheets.length > 0 ? (
              <><Text type="secondary">{tr("同步工作表")}</Text><Select aria-label={tr("选择同步工作表")} className="artifact-sheet-select" value={activeSheet} options={commonSheets.map((name) => ({ label: name, value: name }))} onChange={setActiveSheet} /></>
            ) : leftPreview?.kind === "spreadsheet" && rightPreview?.kind === "spreadsheet" ? <Tag color="warning">{tr("没有同名工作表")}</Tag> : null}
          </Space>
        </div>
        {loading ? <div className="loading-panel"><Spin tip="正在读取两份交付物" /></div> : (
          <div className="artifact-comparison-grid">
            <Card size="small" title={`A · ${leftPreview?.name || tr("交付物")}`} extra={leftPath && leftJob && leftDetail ? <Button size="small" href={artifactUrl(leftJob.key, leftDetail.summary.name, leftPath)}>{tr("下载")}</Button> : null}>
              <ArtifactComparisonPreview preview={leftPreview} activeSheet={activeSheet} scrollRef={leftScrollRef} onScroll={(element) => syncPaneScroll("left", element)} />
            </Card>
            <Card size="small" title={`B · ${rightPreview?.name || tr("交付物")}`} extra={rightPath && rightJob && rightDetail ? <Button size="small" href={artifactUrl(rightJob.key, rightDetail.summary.name, rightPath)}>{tr("下载")}</Button> : null}>
              <ArtifactComparisonPreview preview={rightPreview} activeSheet={activeSheet} scrollRef={rightScrollRef} onScroll={(element) => syncPaneScroll("right", element)} />
            </Card>
          </div>
        )}
      </Modal>
    </>
  );
}

type ExternalTool = "harbor" | "rlviz" | "agentviz";

const EMPTY_TOOL_STATUS: ToolStatus = {
  harbor: false,
  rlviz: false,
  agentviz: false,
  node: false,
  npm: false,
  npx: false,
};

function ToolPanel({ status, job, detail }: { status: ToolStatus; job?: JobSummary; detail?: TrialDetail }) {
  const { message } = AntApp.useApp();
  const [liveStatus, setLiveStatus] = useState(status);
  const [installingRlviz, setInstallingRlviz] = useState(false);
  const trajectoryFiles = detail?.trajectoryFiles ?? [];
  const [selectedTrajectoryPath, setSelectedTrajectoryPath] = useState(trajectoryFiles[0]?.path ?? "");
  const selectedTrajectory = trajectoryFiles.find((entry) => entry.path === selectedTrajectoryPath) ?? trajectoryFiles[0];
  const nodeReady = liveStatus.node && liveStatus.npm && liveStatus.npx;
  const missingFoundation = [
    !liveStatus.node && "Node.js",
    !liveStatus.npm && "npm",
    !liveStatus.npx && "npx",
  ].filter(Boolean).join("、");

  useEffect(() => setLiveStatus(status), [status]);
  useEffect(() => {
    if (!trajectoryFiles.some((entry) => entry.path === selectedTrajectoryPath)) setSelectedTrajectoryPath(trajectoryFiles[0]?.path ?? "");
  }, [selectedTrajectoryPath, trajectoryFiles]);

  const refreshStatus = async () => {
    const updated = await api.toolStatus();
    setLiveStatus(updated);
    return updated;
  };

  const invoke = async (tool: ExternalTool) => {
    if (!job) return;
    const pendingWindow = tool === "harbor" ? window.open("about:blank", "_blank") : null;
    try {
      const result = await api.launch(tool, job.key, detail?.summary.name, tool === "agentviz" ? selectedTrajectory?.path : undefined);
      message.success(result.message);
      if (result.url && pendingWindow) pendingWindow.location.href = result.url;
      else pendingWindow?.close();
    } catch (error) {
      pendingWindow?.close();
      message.error(error instanceof Error ? error.message : "启动失败");
    }
  };

  const installAndLaunchRlviz = async () => {
    if (!nodeReady) {
      message.warning("未检测到完整的 Node.js 基础环境，请先安装 Node.js LTS 后刷新本页。");
      return;
    }
    if (!window.confirm(tr("将通过 npm 从公开仓库安装 RLViz，并在完成后打开当前 Job。是否继续？"))) return;
    setInstallingRlviz(true);
    try {
      const result = await api.install("rlviz");
      message.success(result.message);
      const updated = await refreshStatus();
      if (!updated.rlviz) {
        message.warning("RLViz 已安装，但当前门户尚未检测到命令。请关闭并重新打开门户后重试。");
        return;
      }
      await invoke("rlviz");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "RLViz 安装失败");
    } finally {
      setInstallingRlviz(false);
    }
  };
  const pathSeparator = job?.path.includes("\\") ? "\\" : "/";
  const agentVizPath = job && detail && selectedTrajectory
    ? [job.path.replace(/[\\/]$/, ""), detail.summary.name, selectedTrajectory.path.replaceAll("/", pathSeparator)].join(pathSeparator)
    : "";
  const commands = job && detail ? {
    harbor: `harbor view "${job.path}" --jobs`,
    rlviz: `rlviz open "${job.path}"`,
    agentviz: agentVizPath ? `npx agentviz "${agentVizPath}"` : "",
  } : null;
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    message.success("命令已复制");
  };
  if (!job || !detail || !commands) return <Empty description="请选择 Trial" />;
  return (
    <div className="tool-panel">
      <Alert
        type="info"
        showIcon
        message="日常分析能力已内置"
        description="当前页面已支持评分、执行过程、交付物、日志和 Trial 对比；以下工具仅用于多模型分析、深度审阅或查看未解析的 Harbor 原生信息。启动时只会把当前本机 Job / Trial 路径交给对应工具；外部工具的网络与数据策略由其自身控制。"
      />
      {!nodeReady && (
        <Alert
          className="tool-foundation-alert"
          type="warning"
          showIcon
          message="RLViz 和 AgentViz 需要 Node.js 基础环境"
          description={`未检测到：${missingFoundation || "Node.js 工具链"}。请先安装 Node.js LTS，完成后点击页面顶部的刷新按钮重新检测。`}
        />
      )}
      <div className="tool-grid">
        {([
          ["rlviz", "RLViz", "同时对齐多个模型的完整行为轨迹；Portal 可横向查看 2–4 个 Trial，并对其中两个做深度对比"],
          ["agentviz", "AgentViz", "深度逐步审阅、标注并制作汇报；首次启动会自动下载"],
          ["harbor", "Harbor Viewer（原生查看）", "查看当前页面未解析的 Harbor 原生字段和完整 Job 结构"],
        ] as const).map(([tool, title, description]) => {
          const noTrajectory = tool === "agentviz" && !selectedTrajectory;
          const available = (tool === "rlviz" ? liveStatus.rlviz : tool === "agentviz" ? nodeReady : liveStatus.harbor) && !noTrajectory;
          const needsInstall = tool === "rlviz" && !liveStatus.rlviz && nodeReady;
          const stateText = noTrajectory ? "无轨迹" : needsInstall ? "未安装" : tool === "harbor" ? "未检测到" : "缺少基础环境";
          return (
            <Card
              key={tool}
              title={title}
              extra={available ? null : <Tag color={needsInstall ? "warning" : "default"}>{stateText}</Tag>}
            >
              <p>{description}</p>
              {tool === "agentviz" && trajectoryFiles.length > 1 && <label className="tool-trajectory-select">
                <span>选择要打开的轨迹</span>
                <Select value={selectedTrajectory?.path} options={trajectoryFiles.map((entry) => ({ value: entry.path, label: entry.label }))} onChange={setSelectedTrajectoryPath} />
              </label>}
              {tool === "rlviz" && <div className="tool-platform-note"><WarningOutlined />Windows 暂不支持，请使用 WSL/Linux</div>}
              <Space wrap>
                <Tooltip title={noTrajectory ? "当前 Trial 没有可用轨迹" : needsInstall ? "从 npm 安装 RLViz 后打开当前 Job" : available ? "在本机启动" : tool === "harbor" ? "请先安装对应命令" : "请先安装 Node.js LTS"}>
                  <Button
                    aria-label={tr(needsInstall ? `安装并启动 ${title}` : `启动 ${title}`)}
                    type={tool === "harbor" ? "default" : "primary"}
                    icon={<RocketOutlined />}
                    disabled={!available && !needsInstall}
                    loading={tool === "rlviz" && installingRlviz}
                    onClick={needsInstall ? installAndLaunchRlviz : () => invoke(tool)}
                  >
                    {needsInstall ? "安装并启动" : available ? "启动" : "需要基础环境"}
                  </Button>
                </Tooltip>
                <Button aria-label={tr(`复制 ${title} 启动命令`)} icon={<CopyOutlined />} disabled={!commands[tool]} onClick={() => copy(commands[tool])}>复制命令</Button>
              </Space>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function isCompletedScoredTrial(trial: TrialSummary | undefined): boolean {
  return Boolean(trial && !trial.exception && trial.reward !== null);
}

function comparisonTrialLabel(job: JobSummary, trial: TrialSummary | undefined): string {
  const model = trial?.model || job.model || "未知模型";
  if (!trial) return `${model} · ${job.name} · 未找到 Trial`;
  if (trial.exception) return `${model} · ${job.name} · 运行异常`;
  if (trial.reward === null) return `${model} · ${job.name} · 无评分`;
  return `${model} · ${job.name} · 运行完成 · 得分 ${formatScore(trial.reward)}`;
}

function AgentLogPanel({ detail }: { detail: TrialDetail }) {
  const logs = detail.agentLogs ?? [];
  const [selectedPath, setSelectedPath] = useState(logs[0]?.path ?? "");
  useEffect(() => {
    if (!logs.some((entry) => entry.path === selectedPath)) setSelectedPath(logs[0]?.path ?? "");
  }, [logs, selectedPath]);
  if (!logs.length) return detail.agentLog ? <pre className="log-view single-log-view">{detail.agentLog}</pre> : <Empty description="没有可识别的 Agent 日志" />;
  const selected = logs.find((entry) => entry.path === selectedPath) ?? logs[0];
  return <div className="agent-log-panel">
    <Select aria-label={tr("选择 Agent 日志文件")} value={selected.path} options={logs.map((entry) => ({ label: entry.label, value: entry.path }))} onChange={setSelectedPath} />
    <pre className="log-view single-log-view">{selected.content}</pre>
  </div>;
}

function TrialWorkspace({
  jobs,
  initialJob,
  initialTrial,
  initialScope,
  initialTab,
  onCompare,
  onSelectionChange,
}: {
  jobs: JobSummary[];
  initialJob: string;
  initialTrial: string;
  initialScope: TrialScope;
  initialTab: string;
  onCompare: (task: string, job: string) => void;
  onSelectionChange: (job: string, trial: string, scope: TrialScope, tab: string) => void;
}) {
  const [jobKey, setJobKey] = useState(initialJob);
  const [trialName, setTrialName] = useState(initialTrial);
  const [scope, setScope] = useState<TrialScope>(initialScope);
  const [activeTab, setActiveTab] = useState(initialTab || "score");
  const [detail, setDetail] = useState<TrialDetail>();
  const [detailError, setDetailError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<"trajectory" | "log" | null>(null);
  const [toolStatus, setToolStatus] = useState<ToolStatus>(EMPTY_TOOL_STATUS);
  const [advancedToolsOpen, setAdvancedToolsOpen] = useState(false);
  const detailRequestRef = useRef(0);
  const sectionRequestRef = useRef(0);
  const { message } = AntApp.useApp();

  useEffect(() => {
    const routeJob = jobs.find((job) => job.key === initialJob);
    if (!routeJob) return;
    setJobKey(initialJob);
    setScope(initialScope);
    setActiveTab(initialTab || "score");
    if (initialTrial && routeJob.trials.some((trial) => trial.name === initialTrial)) setTrialName(initialTrial);
  }, [initialJob, initialScope, initialTab, initialTrial, jobs]);

  useEffect(() => {
    if (!jobs.some((job) => job.key === jobKey)) setJobKey(jobs[0]?.key ?? "");
  }, [jobKey, jobs]);

  const job = jobs.find((item) => item.key === jobKey);
  const visibleTrials = useMemo(() => job ? scopedTrials(job, scope) : [], [job, scope]);

  useEffect(() => {
    if (!job) return;
    if (!visibleTrials.some((trial) => trial.name === trialName)) setTrialName(preferredTrial(job, scope)?.name ?? "");
  }, [job, scope, trialName, visibleTrials]);

  const trial = visibleTrials.find((item) => item.name === trialName);
  const trialIndex = visibleTrials.findIndex((item) => item.name === trialName);
  const trialCount = visibleTrials.length;
  const trajectoryValidation = detail?.summary.trajectoryValidation;

  useEffect(() => {
    api.toolStatus().then(setToolStatus).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!job || !trial) {
      detailRequestRef.current += 1;
      sectionRequestRef.current += 1;
      setLoading(false);
      setSectionLoading(null);
      setDetailError("");
      setDetail(undefined);
      return;
    }
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    sectionRequestRef.current += 1;
    setSectionLoading(null);
    setDetail(undefined);
    setDetailError("");
    setLoading(true);
    api.trial(job.key, trial.name)
      .then((nextDetail) => {
        if (detailRequestRef.current === requestId) setDetail(nextDetail);
      })
      .catch((error) => {
        if (detailRequestRef.current === requestId) {
          const text = error instanceof Error ? error.message : "读取 Trial 失败";
          setDetailError(text);
          message.error(text);
        }
      })
      .finally(() => {
        if (detailRequestRef.current === requestId) setLoading(false);
      });
  }, [job, scope, trial, message, retryNonce]);

  useEffect(() => {
    if (job && trial) onSelectionChange(job.key, trial.name, scope, activeTab);
  }, [activeTab, job, onSelectionChange, scope, trial]);

  const ensureSection = (section: "trajectory" | "log") => {
    if (!job || !trial || detail?.loadedSections.includes(section)) return;
    const requestId = sectionRequestRef.current + 1;
    sectionRequestRef.current = requestId;
    const targetTrial = trial.name;
    setSectionLoading(section);
    api.trial(job.key, targetTrial, [section])
      .then((loaded) => {
        if (sectionRequestRef.current !== requestId) return;
        setDetail((current) => {
          if (!current || current.summary.name !== targetTrial) return current;
          return {
            ...current,
            trajectory: section === "trajectory" ? loaded.trajectory : current.trajectory,
            agentLog: section === "log" ? loaded.agentLog : current.agentLog,
            agentLogs: section === "log" ? loaded.agentLogs : current.agentLogs,
            loadedSections: Array.from(new Set([...current.loadedSections, section])),
          };
        });
      })
      .catch((error) => {
        if (sectionRequestRef.current === requestId) message.error(error instanceof Error ? error.message : "读取 Trial 内容失败");
      })
      .finally(() => {
        if (sectionRequestRef.current === requestId) setSectionLoading(null);
      });
  };

  useEffect(() => {
    if (!detail) return;
    if (activeTab === "process" || activeTab === "metadata") ensureSection("trajectory");
    if (activeTab === "log") ensureSection("log");
  }, [activeTab, detail, job, trial]);

  const jobOptions = jobs.map((item) => ({
    label: `${item.model || "无模型 / 未记录"}${item.reasoningEffort ? ` · ${item.reasoningEffort}` : ""} · ${item.name}`,
    value: item.key,
  }));
  const trialOptions = visibleTrials.map((item, index) => {
    const failedChecks = failedCheckCount(item);
    const status = [
      item.exception ? tr("运行异常") : "",
      failedChecks !== null && failedChecks > 0 ? tr(`未通过评分项 ${failedChecks}`) : "",
    ].filter(Boolean).join(" · ");
    return {
      label: `${index + 1}. ${item.taskLabel || item.taskName.split("/").pop() || item.name} · ${formatScore(item.reward)}${status ? ` · ${status}` : ""}`,
      value: item.name,
    };
  });

  const selectJob = (value: string) => {
    const nextJob = jobs.find((item) => item.key === value);
    preservePagePosition(() => {
      setJobKey(value);
      setTrialName(nextJob ? preferredTrial(nextJob, scope)?.name ?? "" : "");
    });
  };
  const moveTrial = () => {
    if (!job || trialIndex < 0) return;
    const nextTrial = visibleTrials[trialIndex + 1];
    if (nextTrial) preservePagePosition(() => setTrialName(nextTrial.name));
  };
  const clearScope = () => preservePagePosition(() => setScope("all"));
  const scopeLabel = scope === "errors" ? "仅显示运行异常 Trial" : scope === "score-failures" ? "仅显示含未通过评分项的 Trial" : "";

  return (
    <Card
      className="detail-card"
      title={<Space><FileSearchOutlined />Trial 详情</Space>}
      extra={detail && <Space wrap>
        <Button icon={<SwapOutlined />} onClick={() => onCompare(detail.summary.taskName, trialReference(jobKey, detail.summary.name))}>与另一个 Trial 对比</Button>
        <Button onClick={() => downloadJsonSnapshot(`harbor-${detail.summary.name}-snapshot.json`, detail)}>导出快照</Button>
        <Button icon={<RocketOutlined />} onClick={() => preservePagePosition(() => setAdvancedToolsOpen(true))}>高级工具</Button>
      </Space>}
    >
      <div className="single-controls">
        <label><span>第一步：选择 Job</span><Select showSearch optionFilterProp="label" value={jobKey || undefined} options={jobOptions} onChange={selectJob} /></label>
        <label className="trial-selector-label">
          <div className="trial-selector-heading">
            <span>第二步：选择 Trial</span>
            <Space size={4} wrap>
              {scopeLabel && <Tag color={scope === "errors" ? "error" : "warning"}>{scopeLabel}</Tag>}
              {trialCount > 0 && <Tag color="processing" className="trial-position-tag">Trial {trialIndex >= 0 ? trialIndex + 1 : "—"} / {trialCount}</Tag>}
              {scope !== "all" && <Button type="link" size="small" onClick={clearScope}>显示全部</Button>}
            </Space>
          </div>
          <div className="trial-selector-row">
            <Select showSearch optionFilterProp="label" value={trialName || undefined} options={trialOptions} onChange={(value) => preservePagePosition(() => setTrialName(value))} />
            <Button size="small" disabled={trialIndex < 0 || trialIndex >= trialCount - 1} onClick={moveTrial} aria-label={tr("查看下一个 Trial")}>下一项</Button>
          </div>
        </label>
      </div>
      {detail ? (
        <Spin spinning={loading} tip="正在加载所选 Trial" className="detail-loading">
        <>
          <SingleSummary detail={detail} />
          {isHttpTrial(detail.summary) && <Alert type="info" showIcon message={`HTTP 被测服务 · 版本 ${detail.summary.agentVersion || "未记录"}`} description="此执行器不调用模型，不生成 ATIF 轨迹。响应和 HTTP 调用耗时见交付物；调用记录见原始日志。执行用时包含文件传输等适配开销，远端状态不由 Harbor 自动隔离。" />}
          <StableTabs
            activeKey={activeTab}
            onChange={(key) => {
              setActiveTab(key);
              if (key === "process" || key === "metadata") ensureSection("trajectory");
              if (key === "log") ensureSection("log");
            }}
            items={[
              { key: "score", label: "评分结果", children: <><SingleScorePanel detail={detail} /><RewardDetailsPanel detail={detail} /></> },
              {
                key: "process",
                label: "执行过程",
                children: detail.loadedSections.includes("trajectory")
                  ? <><PhaseTimeline detail={detail} /><StepResultsPanel detail={detail} />{detail.summary.hasTrajectory ? <EventTable events={processEvents(detail.trajectory.steps)} label={detail.summary.model || "当前 Trial"} /> : <Empty description="此 Trial 没有 Agent 轨迹；请查看交付物与原始日志" />}</>
                  : <div className="loading-panel"><Spin spinning={sectionLoading === "trajectory"} tip="正在加载执行过程" /></div>,
              },
              { key: "artifact", label: "交付物", children: <ArtifactPanel job={job} detail={detail} /> },
              {
                key: "log",
                label: "原始日志",
                children: !detail.loadedSections.includes("log")
                  ? <div className="loading-panel"><Spin spinning={sectionLoading === "log"} tip="正在加载原始日志" /></div>
                  : <AgentLogPanel detail={detail} />,
              },
              {
                key: "metadata",
                label: "技术信息",
                children: <Collapse items={[
                  { key: "result", label: "Trial 结果 JSON", children: <pre className="json-view">{JSON.stringify(detail.result, null, 2)}</pre> },
                  { key: "config", label: "Trial 配置与来源", children: <><Descriptions column={1} bordered size="small" items={[
                    { key: "attempt", label: "Attempt", children: attemptLabel(detail.summary) },
                    { key: "regrade", label: "Regrade 来源", children: detail.summary.isRegrade ? JSON.stringify(detail.summary.sourceTrial) : "原始 Trial" },
                    { key: "regrade-score", label: "Regrade 评分变化", children: detail.summary.isRegrade ? `${formatScore(detail.summary.sourceReward)} → ${formatScore(detail.summary.reward)}${typeof detail.summary.regradeDelta === "number" ? `（${detail.summary.regradeDelta >= 0 ? "+" : ""}${detail.summary.regradeDelta.toFixed(3)}）` : ""}` : "—" },
                    { key: "task", label: "Task 来源 / 版本", children: `${detail.summary.taskSource || "—"}${detail.summary.taskVersion ? ` · ${detail.summary.taskVersion}` : ""}` },
                    { key: "verifier", label: "Verifier 环境模式", children: detail.summary.verifierMode || "—" },
                  ]} /><pre className="json-view">{JSON.stringify(detail.trialConfig, null, 2)}</pre></> },
                  { key: "atif", label: "ATIF 轨迹健康度", children: <Descriptions column={1} bordered size="small" items={[
                    { key: "valid", label: "验证结果", children: !trajectoryValidation ? <Tag>当前服务未提供校验结果</Tag> : trajectoryValidation.valid ? <Tag color="success">基础校验通过</Tag> : <Tag color="warning">存在 {trajectoryValidation.issues?.length ?? 0} 项问题</Tag> },
                    { key: "issues", label: "格式问题", children: trajectoryValidation?.issues?.length ? trajectoryValidation.issues.join("；") : "—" },
                    { key: "warnings", label: "分析提示", children: trajectoryValidation?.warnings?.length ? trajectoryValidation.warnings.join("；") : "—" },
                  ]} /> },
                  {
                    key: "trajectory",
                    label: "轨迹元数据",
                    children: detail.loadedSections.includes("trajectory")
                      ? <Descriptions column={1} bordered size="small" items={[{ key: "schema", label: "Schema", children: detail.trajectory.schema_version || "—" }, { key: "session", label: "Session", children: detail.trajectory.session_id || "—" }]} />
                      : <Spin spinning={sectionLoading === "trajectory"} tip="正在加载轨迹元数据" />,
                  },
                ].filter((item) => !isHttpTrial(detail.summary) || !["atif", "trajectory"].includes(item.key))} />,
              },
            ]}
          />
        </>
        </Spin>
      ) : loading ? <div className="loading-panel"><Spin size="large" /></div> : detailError ? <Alert type="error" showIcon message="Trial 读取失败" description={detailError} action={<Button onClick={() => setRetryNonce((value) => value + 1)}>重试</Button>} /> : <Empty description="请选择一个 Trial" />}
      <Modal
        className="advanced-tools-modal"
        title={<Space><RocketOutlined />高级工具</Space>}
        open={advancedToolsOpen}
        width="min(1160px, calc(100vw - 32px))"
        scrollLock={false}
        footer={null}
        onCancel={() => preservePagePosition(() => setAdvancedToolsOpen(false))}
      >
        <ToolPanel status={toolStatus} job={job} detail={detail} />
      </Modal>
    </Card>
  );
}

function ComparisonWorkspace({
  jobs,
  initialJob,
  initialRightJob,
  initialSelectedKeys,
  initialTask,
  initialTab,
  initialIncludeExceptional,
  onSelectionChange,
}: {
  jobs: JobSummary[];
  initialJob: string;
  initialRightJob: string;
  initialSelectedKeys: string;
  initialTask: string;
  initialTab: string;
  initialIncludeExceptional: boolean;
  onSelectionChange: (task: string, selected: string[], left: string, right: string, tab: string, includeExceptional: boolean) => void;
}) {
  const [leftKey, setLeftKey] = useState("");
  const [rightKey, setRightKey] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [taskName, setTaskName] = useState(initialTask);
  const [activeTab, setActiveTab] = useState(initialTab || "overview");
  const [detailsByKey, setDetailsByKey] = useState<Partial<Record<string, TrialDetail>>>({});
  const [loading, setLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);
  const [sectionLoading, setSectionLoading] = useState<"trajectory" | "log" | null>(null);
  const [includeExceptional, setIncludeExceptional] = useState(initialIncludeExceptional);
  const comparisonRequestRef = useRef(0);
  const comparisonSectionRequestRef = useRef(0);
  const { message } = AntApp.useApp();
  const { locale } = useI18n();
  const routeSelectedKeys = useMemo(() => initialSelectedKeys.split("|").filter(Boolean), [initialSelectedKeys]);

  const taskCatalog = useMemo(() => {
    const catalog = new Map<string, {
      name: string;
      label: string;
      trialKeys: Set<string>;
      completedScoredTrialKeys: Set<string>;
      models: Set<string>;
      completedScoredModels: Set<string>;
    }>();
    for (const job of jobs) {
      for (const trial of job.trials) {
        const item = catalog.get(trial.taskName) ?? {
          name: trial.taskName,
          label: trial.taskLabel || trial.taskName.split("/").pop() || trial.taskName,
          trialKeys: new Set<string>(),
          completedScoredTrialKeys: new Set<string>(),
          models: new Set<string>(),
          completedScoredModels: new Set<string>(),
        };
        item.trialKeys.add(trialReference(job.key, trial.name));
        if (isCompletedScoredTrial(trial)) {
          item.completedScoredTrialKeys.add(trialReference(job.key, trial.name));
          if (trial.model || job.model) item.completedScoredModels.add(trial.model || job.model);
        }
        if (trial.model || job.model) item.models.add(trial.model || job.model);
        catalog.set(trial.taskName, item);
      }
    }
    return Array.from(catalog.values()).filter((task) => task.trialKeys.size >= 2).sort((a, b) =>
      b.trialKeys.size - a.trialKeys.size || a.label.localeCompare(b.label, "zh-CN"),
    );
  }, [jobs]);

  useEffect(() => {
    if (!taskCatalog.some((task) => task.name === taskName)) {
      const routeTask = taskCatalog.find((task) => task.name === initialTask)?.name;
      setTaskName(routeTask ?? taskCatalog.find((task) => task.trialKeys.size >= 2)?.name ?? taskCatalog[0]?.name ?? "");
    }
  }, [initialTask, taskCatalog, taskName]);

  useEffect(() => setActiveTab(initialTab || "overview"), [initialTab]);
  useEffect(() => setIncludeExceptional(initialIncludeExceptional), [initialIncludeExceptional]);

  const taskTrials = useMemo<ComparisonCandidate[]>(
    () => jobs.flatMap((job) => job.trials.filter((trial) => trial.taskName === taskName).map((trial) => ({ key: trialReference(job.key, trial.name), job, trial }))),
    [jobs, taskName],
  );
  const completedScoredTrials = useMemo(
    () => taskTrials.filter((candidate) => isCompletedScoredTrial(candidate.trial)),
    [taskTrials],
  );
  const automaticallyIncludingExceptional = completedScoredTrials.length < 2;
  const routeRequestsExceptional = routeSelectedKeys.some((key) => taskTrials.some((candidate) => candidate.key === key && !isCompletedScoredTrial(candidate.trial)));
  const effectiveIncludeExceptional = includeExceptional || routeRequestsExceptional;
  const eligibleTrials = effectiveIncludeExceptional || automaticallyIncludingExceptional ? taskTrials : completedScoredTrials;
  const exceptionalTrialCount = Math.max(0, taskTrials.length - completedScoredTrials.length);

  useEffect(() => {
    const availableKeys = new Set(eligibleTrials.map((candidate) => candidate.key));
    const nextSelected = Array.from(new Set(selectedKeys.filter((key) => availableKeys.has(key)))).slice(0, 4);
    if (!nextSelected.length) {
      for (const key of routeSelectedKeys) {
        if (availableKeys.has(key) && nextSelected.length < 4) nextSelected.push(key);
      }
      const initialLeft = eligibleTrials.find((candidate) => candidate.key === initialJob || candidate.job.key === initialJob)?.key;
      const initialRight = eligibleTrials.find((candidate) => candidate.key === initialRightJob || candidate.job.key === initialRightJob)?.key;
      if (initialLeft) nextSelected.push(initialLeft);
      if (initialRight && initialRight !== initialLeft) nextSelected.push(initialRight);
    }
    for (const candidate of eligibleTrials) {
      if (nextSelected.length >= 2) break;
      if (!nextSelected.includes(candidate.key)) nextSelected.push(candidate.key);
    }
    const minimumSelection = nextSelected;
    if (minimumSelection.join("\u0000") !== selectedKeys.join("\u0000")) setSelectedKeys(minimumSelection);
    const preferredLeft = minimumSelection.length === 2
      ? minimumSelection[0]
      : minimumSelection.includes(leftKey) ? leftKey : minimumSelection[0] || "";
    const preferredRight = minimumSelection.length === 2
      ? minimumSelection[1]
      : minimumSelection.includes(rightKey) && rightKey !== preferredLeft
        ? rightKey
        : minimumSelection.find((key) => key !== preferredLeft) || "";
    if (preferredLeft !== leftKey) setLeftKey(preferredLeft);
    if (preferredRight !== rightKey) setRightKey(preferredRight);
  }, [eligibleTrials, initialJob, initialRightJob, leftKey, rightKey, routeSelectedKeys, selectedKeys]);

  const leftCandidate = eligibleTrials.find((candidate) => candidate.key === leftKey);
  const rightCandidate = eligibleTrials.find((candidate) => candidate.key === rightKey);
  const leftJob = leftCandidate?.job;
  const rightJob = rightCandidate?.job;
  const selectedTask = taskCatalog.find((task) => task.name === taskName);
  const leftDetail = detailsByKey[leftKey];
  const rightDetail = detailsByKey[rightKey];

  useEffect(() => {
    const selections = selectedKeys.map((key) => {
      const candidate = eligibleTrials.find((item) => item.key === key);
      return candidate ? candidate : null;
    }).filter((selection): selection is ComparisonCandidate => Boolean(selection));
    if (selections.length < 2) {
      comparisonRequestRef.current += 1;
      comparisonSectionRequestRef.current += 1;
      setLoading(false);
      setSectionLoading(null);
      setComparisonError("");
      setDetailsByKey({});
      return;
    }
    const requestId = comparisonRequestRef.current + 1;
    comparisonRequestRef.current = requestId;
    comparisonSectionRequestRef.current += 1;
    setSectionLoading(null);
    setDetailsByKey({});
    setComparisonError("");
    setLoading(true);
    Promise.all(selections.map((candidate) => api.trial(candidate.job.key, candidate.trial.name).then((detail) => [candidate.key, detail] as const))).then((loaded) => {
      if (comparisonRequestRef.current === requestId) {
        setDetailsByKey(Object.fromEntries(loaded));
      }
    }).catch((error) => {
      if (comparisonRequestRef.current === requestId) {
        const text = error instanceof Error ? error.message : "读取 Trial 失败";
        setComparisonError(text);
        message.error(text);
      }
    }).finally(() => {
      if (comparisonRequestRef.current === requestId) setLoading(false);
    });
  }, [eligibleTrials, selectedKeys, taskName, message, retryNonce]);

  const ensureComparisonSection = (section: "trajectory" | "log", allSelected = false, requestedKeys?: string[]) => {
    const targetKeys = requestedKeys ?? (allSelected ? selectedKeys : [leftKey, rightKey].filter(Boolean));
    const targets = targetKeys.map((key) => {
      const candidate = eligibleTrials.find((item) => item.key === key);
      return candidate ? { ...candidate, detail: detailsByKey[key] } : null;
    }).filter((target): target is { key: string; job: JobSummary; trial: TrialSummary; detail: TrialDetail | undefined } => Boolean(target));
    if (!targets.length || targets.every((target) => target.detail?.loadedSections.includes(section))) return;
    const requestId = comparisonSectionRequestRef.current + 1;
    comparisonSectionRequestRef.current = requestId;
    setSectionLoading(section);
    Promise.all(targets.map((target) => target.detail?.loadedSections.includes(section)
      ? Promise.resolve([target.key, undefined] as const)
      : api.trial(target.job.key, target.trial.name, [section]).then((detail) => [target.key, detail] as const),
    )).then((loaded) => {
      if (comparisonSectionRequestRef.current !== requestId) return;
      setDetailsByKey((current) => {
        const next = { ...current };
        for (const [key, loadedDetail] of loaded) {
          const existing = next[key];
          if (!existing || !loadedDetail || existing.summary.name !== loadedDetail.summary.name) continue;
          next[key] = {
            ...existing,
            trajectory: section === "trajectory" ? loadedDetail.trajectory : existing.trajectory,
            agentLog: section === "log" ? loadedDetail.agentLog : existing.agentLog,
            agentLogs: section === "log" ? loadedDetail.agentLogs : existing.agentLogs,
            loadedSections: Array.from(new Set([...existing.loadedSections, section])),
          };
        }
        return next;
      });
    }).catch((error) => {
      if (comparisonSectionRequestRef.current === requestId) message.error(error instanceof Error ? error.message : "读取对比内容失败");
    }).finally(() => {
      if (comparisonSectionRequestRef.current === requestId) setSectionLoading(null);
      });
  };

  useEffect(() => {
    if (selectedKeys.length < 2 || Object.keys(detailsByKey).length !== selectedKeys.length) return;
    if (activeTab === "process") ensureComparisonSection("trajectory");
    if (activeTab === "metadata") ensureComparisonSection("trajectory", true);
    if (activeTab === "log") ensureComparisonSection("log");
  }, [activeTab, detailsByKey, leftKey, rightKey, selectedKeys]);

  useEffect(() => {
    if (taskName && leftKey) onSelectionChange(taskName, selectedKeys, leftKey, rightKey, activeTab, effectiveIncludeExceptional);
  }, [activeTab, effectiveIncludeExceptional, leftKey, onSelectionChange, rightKey, selectedKeys, taskName]);

  const trialOptions = eligibleTrials.map((candidate) => ({
    label: `${candidate.trial.model || candidate.job.model || tr("未知模型")} · ${candidate.job.name} · ${tr(attemptLabel(candidate.trial))} · ${tr(trialStatusPresentation(candidate.trial).label)} · ${locale === "en" ? "Score" : "得分"} ${formatScore(candidate.trial.reward)}`,
    value: candidate.key,
    disabled: selectedKeys.length >= 4 && !selectedKeys.includes(candidate.key),
  }));
  const selectedTrialOptions = trialOptions.filter((option) => selectedKeys.includes(option.value)).map((option) => ({ ...option, disabled: false }));
  const taskOptions = taskCatalog.map((task) => ({
    label: tr(`${task.label} · 可对比结果 ${task.completedScoredTrialKeys.size} · ${task.completedScoredModels.size} 个模型 · 共 ${task.trialKeys.size} 个 Trial`),
    value: task.name,
  }));
  const orderedKeys = selectedKeys;
  const comparisonEntries = orderedKeys.map((key, index) => {
    const candidate = eligibleTrials.find((item) => item.key === key);
    const detail = detailsByKey[key];
    return candidate && detail ? { key, job: candidate.job, detail, marker: String.fromCharCode(65 + index), color: comparisonColors[index] } : null;
  }).filter((entry): entry is ComparisonEntry => Boolean(entry));
  const selectedTrials = selectedKeys.map((key) => eligibleTrials.find((candidate) => candidate.key === key)?.trial).filter((trial): trial is TrialSummary => Boolean(trial));
  const comparisonStatus = (() => {
    if (!taskName) return { type: "info" as const, message: "请先选择 Task", description: "选择后，只会列出运行过该 Task 的 Trial。" };
    if (selectedTrials.length < 2) return { type: "warning" as const, message: "当前 Task 暂时无法形成对比", description: `只找到 ${eligibleTrials.length} 个可用 Trial，至少需要两个。` };
    if (selectedTrials.some((trial) => !isCompletedScoredTrial(trial))) return { type: "warning" as const, message: "当前对比包含运行异常或无评分 Trial", description: "该组合适合排查失败原因；若需要比较模型能力，请优先选择运行完成且有评分的 Trial。" };
    if (selectedTrials.some((trial) => !trial.taskChecksum)) return { type: "warning" as const, message: "Task 名称一致，但部分 Trial 缺少完整性标识", description: "可以查看结果，但无法确认所有运行使用了完全相同的任务定义和输入。" };
    const checksums = new Set(selectedTrials.map((trial) => trial.taskChecksum));
    if (checksums.size > 1) return { type: "error" as const, message: "Task 定义或输入不同，不建议直接比较", description: `已选 Trial 中存在 ${checksums.size} 个不同的 task checksum。` };
    return null;
  })();
  const scoreTab = <ScoreComparison entries={comparisonEntries} />;
  const trajectoryReady = Boolean(leftDetail?.loadedSections.includes("trajectory") && (!rightDetail || rightDetail.loadedSections.includes("trajectory")));
  const metadataReady = comparisonEntries.length === selectedKeys.length && comparisonEntries.every((entry) => entry.detail.loadedSections.includes("trajectory"));
  const logsReady = Boolean(leftDetail?.loadedSections.includes("log") && (!rightDetail || rightDetail.loadedSections.includes("log")));
  const processTab = trajectoryReady
    ? <ProcessComparison left={leftDetail} right={rightDetail} />
    : <div className="loading-panel"><Spin spinning={sectionLoading === "trajectory"} tip="正在加载两条执行过程" /></div>;
  const artifactTab = <ArtifactComparisonPanel leftJob={leftJob} leftDetail={leftDetail} rightJob={rightJob} rightDetail={rightDetail} />;
  const logTab = logsReady
    ? <LogComparison left={leftDetail} right={rightDetail} />
    : <div className="loading-panel"><Spin spinning={sectionLoading === "log"} tip="正在加载两侧原始日志" /></div>;
  const deepComparisonSelector = (section?: "trajectory" | "log") => selectedKeys.length > 2 ? (
    <div className="deep-comparison-toolbar">
      <div className="deep-comparison-intro">
        <Text strong>双 Trial 深度对比</Text>
        <Text type="secondary">从横向对比范围中选择当前 Tab 使用的两项</Text>
      </div>
      <label><span>基准 Trial</span><Select showSearch optionFilterProp="label" value={leftKey || undefined} options={selectedTrialOptions} onChange={(value) => preservePagePosition(() => {
        const nextRight = rightKey === value ? selectedKeys.find((key) => key !== value) || "" : rightKey;
        setLeftKey(value);
        setRightKey(nextRight);
        if (section) ensureComparisonSection(section, false, [value, nextRight]);
      })} /></label>
      <label><span>对比 Trial</span><Select showSearch optionFilterProp="label" value={rightKey || undefined} options={selectedTrialOptions.filter((option) => option.value !== leftKey)} onChange={(value) => preservePagePosition(() => {
        setRightKey(value);
        if (section) ensureComparisonSection(section, false, [leftKey, value]);
      })} /></label>
    </div>
  ) : null;
  const deepComparisonTab = (content: ReactNode, section?: "trajectory" | "log") => (
    <div className="deep-comparison-tab">
      {deepComparisonSelector(section)}
      {content}
    </div>
  );
  const exportComparison = () => downloadJsonSnapshot("harbor-trial-comparison-snapshot.json", {
    exportedAt: new Date().toISOString(),
    task: selectedTask,
    selectedTrialReferences: selectedKeys,
    baselineTrialReference: leftKey,
    comparedTrialReference: rightKey,
    entries: comparisonEntries.map((entry) => ({ marker: entry.marker, job: entry.job, detail: entry.detail })),
  });

  return (
    <Card className="comparison-card" title={<Space><CodeOutlined />Trial 对比</Space>} extra={<Button size="small" onClick={exportComparison} disabled={comparisonEntries.length < 2}>导出快照</Button>}>
      <div className="compare-controls">
        <label className="compare-task-control"><span>第一步：选择相同 Task</span><Select showSearch optionFilterProp="label" value={taskName || undefined} options={taskOptions} onChange={(value) => preservePagePosition(() => setTaskName(value))} placeholder="选择需要对比的 Task" /></label>
        <label className="compare-selection-control"><span>第二步：选择横向对比范围（2–4 个 Trial）</span><Select mode="multiple" showSearch optionFilterProp="label" maxTagCount="responsive" disabled={!taskName} value={selectedKeys} options={trialOptions} onChange={(values) => preservePagePosition(() => {
          if (values.length < 2) { message.warning("至少需要保留两个 Trial 才能对比"); return; }
          const next = values.slice(0, 4);
          setSelectedKeys(next);
          const nextLeft = next.length === 2 ? next[0] : next.includes(leftKey) ? leftKey : next[0];
          const nextRight = next.length === 2 ? next[1] : next.includes(rightKey) && rightKey !== nextLeft ? rightKey : next.find((key) => key !== nextLeft) || "";
          setLeftKey(nextLeft);
          setRightKey(nextRight);
        })} placeholder="选择需要横向比较的 Trial" /></label>
      </div>
      {selectedTask && <div className="compare-filter">
        <Space wrap>
          <Switch
            checked={effectiveIncludeExceptional || automaticallyIncludingExceptional}
            disabled={automaticallyIncludingExceptional}
            onChange={(checked) => preservePagePosition(() => {
              setIncludeExceptional(checked);
              if (!checked) {
                const normalKeys = completedScoredTrials.map((candidate) => candidate.key);
                const next = selectedKeys.filter((key) => normalKeys.includes(key));
                for (const key of normalKeys) {
                  if (next.length >= 2) break;
                  if (!next.includes(key)) next.push(key);
                }
                setSelectedKeys(next.slice(0, 4));
              }
            })}
          />
          <Text>显示运行异常 / 无评分 Trial</Text>
          {automaticallyIncludingExceptional && <Tag color="warning">可对比结果不足 2 个，已显示全部</Tag>}
          {!automaticallyIncludingExceptional && exceptionalTrialCount > 0 && <Text type="secondary">另有 {exceptionalTrialCount} 个异常或无评分 Trial 可按需加入</Text>}
        </Space>
      </div>}
      {comparisonStatus && <Alert className="comparison-status" showIcon {...comparisonStatus} message={tr(comparisonStatus.message)} description={tr(comparisonStatus.description)} />}
      {comparisonError && <Alert className="comparison-status" type="error" showIcon message="对比数据读取失败" description={comparisonError} action={<Button onClick={() => setRetryNonce((value) => value + 1)}>重试</Button>} />}
      {comparisonEntries.length >= 2 && <ComparabilityNotice entries={comparisonEntries} />}
      {comparisonEntries.length >= 2 ? (
        <Spin spinning={loading} tip="正在加载对比 Trial" className="detail-loading">
        <>
          <StableTabs
            activeKey={activeTab}
            defaultActiveKey="overview"
            onChange={(key) => {
              setActiveTab(key);
              if (key === "process") ensureComparisonSection("trajectory");
              if (key === "metadata") ensureComparisonSection("trajectory", true);
              if (key === "log") ensureComparisonSection("log");
            }}
            items={[
              { key: "overview", label: "差异总览", children: <DifferenceOverview entries={comparisonEntries} /> },
              { key: "score", label: "评分差异", children: scoreTab },
              { key: "process", label: "执行过程（双 Trial）", children: deepComparisonTab(processTab, "trajectory") },
              { key: "artifact", label: "交付物（双 Trial）", children: deepComparisonTab(artifactTab) },
              { key: "log", label: "原始日志（双 Trial）", children: deepComparisonTab(logTab, "log") },
              {
                key: "metadata",
                label: "技术信息",
                children: metadataReady ? <TechnicalComparison entries={comparisonEntries} /> : <div className="loading-panel"><Spin spinning={sectionLoading === "trajectory"} tip="正在加载技术信息" /></div>,
              },
            ]}
          />
        </>
        </Spin>
      ) : loading ? <div className="loading-panel"><Spin size="large" /></div> : <Empty description="选择至少两个 Trial 进行对比" />}
    </Card>
  );
}

type PageKey = "overview" | "trial" | "compare";

interface RouteState {
  page: PageKey;
  params: Record<string, string>;
}

function readRoute(): RouteState {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const page: PageKey = path === "/trial" ? "trial" : path === "/compare" ? "compare" : "overview";
  return { page, params: Object.fromEntries(new URLSearchParams(window.location.search)) };
}

function Portal() {
  const { locale, setLocale } = useI18n();
  useDomTranslations(locale);
  const [rootInput, setRootInput] = useState("");
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [route, setRoute] = useState<RouteState>(() => readRoute());
  const [overviewFilters, setOverviewFilters] = useState<OverviewFilters>(() => ({
    dataset: route.page === "overview" ? route.params.dataset ?? "" : "",
    task: route.page === "overview" ? route.params.task ?? "" : "",
    model: route.page === "overview" ? route.params.model ?? "" : "",
    status: route.page === "overview" ? route.params.status ?? "" : "",
    scoreState: route.page === "overview" ? route.params.scoreState ?? "" : "",
    attempt: route.page === "overview" ? route.params.attempt ?? "" : "",
    exceptionCategory: route.page === "overview" ? route.params.exceptionCategory ?? "" : "",
    dateFrom: route.page === "overview" ? route.params.dateFrom ?? "" : "",
    dateTo: route.page === "overview" ? route.params.dateTo ?? "" : "",
  }));
  const [diagnostics, setDiagnostics] = useState<WorkspaceResponse["diagnostics"]>();
  const { message } = AntApp.useApp();

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.page !== "overview") return;
    setOverviewFilters({
      dataset: route.params.dataset ?? "",
      task: route.params.task ?? "",
      model: route.params.model ?? "",
      status: route.params.status ?? "",
      scoreState: route.params.scoreState ?? "",
      attempt: route.params.attempt ?? "",
      exceptionCategory: route.params.exceptionCategory ?? "",
      dateFrom: route.params.dateFrom ?? "",
      dateTo: route.params.dateTo ?? "",
    });
  }, [route.page, route.params.attempt, route.params.dataset, route.params.dateFrom, route.params.dateTo, route.params.exceptionCategory, route.params.model, route.params.scoreState, route.params.status, route.params.task]);

  const navigate = useCallback((page: PageKey, params: Record<string, string> = {}, replace = false) => {
    const path = page === "overview" ? "/overview" : page === "trial" ? "/trial" : "/compare";
    const search = new URLSearchParams(Object.entries(params).filter(([, value]) => Boolean(value))).toString();
    const url = `${path}${search ? `?${search}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` === url) return;
    const pageChanged = window.location.pathname !== path;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url);
    setRoute({ page, params });
    if (!replace && pageChanged) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }, []);

  const openTrial = useCallback((job: string, trial: string, scope: TrialScope = "all") => navigate("trial", { job, trial, ...(scope === "all" ? {} : { scope }) }), [navigate]);
  const openCompare = useCallback((task: string, left: string, right = "") => navigate("compare", { task, a: left, b: right }), [navigate]);
  const syncTrialRoute = useCallback((job: string, trial: string, scope: TrialScope, tab: string) => navigate("trial", { job, trial, ...(scope === "all" ? {} : { scope }), ...(tab === "score" ? {} : { tab }) }, true), [navigate]);
  const syncCompareRoute = useCallback((task: string, selected: string[], left: string, right: string, tab: string, includeExceptional: boolean) => navigate("compare", { task, selected: selected.join("|"), a: left, b: right, ...(tab === "overview" ? {} : { tab }), ...(includeExceptional ? { exceptional: "1" } : {}) }, true), [navigate]);
  const syncOverviewFilters = useCallback((filters: OverviewFilters) => {
    setOverviewFilters(filters);
    navigate("overview", { ...filters }, true);
  }, [navigate]);

  const applyWorkspace = (workspace: Pick<WorkspaceResponse, "root" | "jobs" | "diagnostics">) => {
    setRootInput(workspace.root);
    setJobs(workspace.jobs);
    setDiagnostics(workspace.diagnostics);
    setError("");
  };
  const load = async () => {
    setLoading(true);
    try { applyWorkspace(await api.workspace()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取 Harbor Job"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const changeRoot = async () => {
    if (!rootInput.trim()) return;
    setLoading(true);
    try { applyWorkspace(await api.setWorkspace(rootInput.trim())); message.success("目录已加载"); }
    catch (reason) { message.error(reason instanceof Error ? reason.message : "目录加载失败"); }
    finally { setLoading(false); }
  };
  const pickRoot = async () => {
    setLoading(true);
    try {
      const workspace = await api.selectDirectory();
      if (!workspace.cancelled) { applyWorkspace(workspace); message.success("目录已切换"); }
    } catch (reason) { message.warning(reason instanceof Error ? reason.message : "系统文件夹选择不可用，请手动填写路径"); }
    finally { setLoading(false); }
  };

  const inspectJob = (job: JobSummary, scope: TrialScope = "all", taskName?: string) => {
    const candidates = scopedTrials(job, scope);
    const trial = taskName ? candidates.find((candidate) => candidate.taskName === taskName) ?? candidates[0] : preferredTrial(job, scope);
    openTrial(job.key, trial?.name ?? "", scope);
  };
  const compareJob = (job: JobSummary, taskName?: string) => {
    const trial = (taskName ? job.trials.find((candidate) => candidate.taskName === taskName) : undefined)
      ?? job.trials.find((candidate) => jobs.filter((item) => item.trials.some((entry) => entry.taskName === candidate.taskName)).length >= 2)
      ?? job.trials[0];
    openCompare(trial?.taskName ?? "", job.key);
  };

  const pageIntro = {
    overview: "运行概览",
    trial: "Trial 详情",
    compare: "Trial 对比",
  }[route.page];

  const pageContent = jobs.length ? (
    route.page === "overview" ? (
      <JobOverview jobs={jobs} filters={overviewFilters} diagnostics={diagnostics} onInspect={inspectJob} onCompare={compareJob} onFiltersChange={syncOverviewFilters} />
    ) : route.page === "trial" ? (
      <TrialWorkspace
        jobs={jobs}
        initialJob={route.params.job ?? ""}
        initialTrial={route.params.trial ?? ""}
        initialScope={trialScopeFromQuery(route.params.scope)}
        initialTab={route.params.tab ?? "score"}
        onCompare={openCompare}
        onSelectionChange={syncTrialRoute}
      />
    ) : (
      <ComparisonWorkspace
        jobs={jobs}
        initialJob={route.params.a ?? ""}
        initialRightJob={route.params.b ?? ""}
        initialSelectedKeys={route.params.selected ?? ""}
        initialTask={route.params.task ?? ""}
        initialTab={route.params.tab ?? "overview"}
        initialIncludeExceptional={route.params.exceptional === "1"}
        onSelectionChange={syncCompareRoute}
      />
    )
  ) : <Card><Empty description="所选目录中没有可识别的 Harbor Job" /></Card>;

  return (
    <Layout className="app-shell">
      <Header className="portal-header">
        <div className="brand-mark"><ApartmentOutlined /></div>
        <div className="portal-brand"><Title level={3}>Harbor 结果分析</Title></div>
        <nav className="portal-nav" aria-label={tr("主要页面")}>
          <Button type={route.page === "overview" ? "primary" : "text"} icon={<DashboardOutlined />} onClick={() => preservePagePosition(() => navigate("overview", { ...overviewFilters }))}>运行概览</Button>
          <Button type={route.page === "trial" ? "primary" : "text"} icon={<FileSearchOutlined />} onClick={() => preservePagePosition(() => navigate("trial"))}>Trial 详情</Button>
          <Button type={route.page === "compare" ? "primary" : "text"} icon={<SwapOutlined />} onClick={() => preservePagePosition(() => navigate("compare"))}>Trial 对比</Button>
          <TermGuide />
          <Button className="locale-switch" size="small" onClick={() => setLocale(locale === "zh" ? "en" : "zh")} aria-label={tr(locale === "zh" ? "切换到 English" : "切换到中文", locale)}>{locale === "zh" ? "EN" : "中文"}</Button>
        </nav>
      </Header>
      <Content className="portal-content">
        <Card className="workspace-card workspace-card-compact global-workspace-card">
          <div className="workspace-row">
            <div className="workspace-copy"><FolderOpenOutlined /><div><Text strong>Job 根目录</Text></div></div>
            <Input value={rootInput} onChange={(event) => setRootInput(event.target.value)} onPressEnter={changeRoot} placeholder={tr("例如 D:\\github\\agentic-office-evals\\harbor-jobs")} aria-label={tr("Job 根目录")} />
            <Space>
              <Button icon={<FolderOpenOutlined />} onClick={pickRoot}>{tr("选择文件夹")}</Button>
              <Button type="primary" onClick={changeRoot}>{tr("加载")}</Button>
              <Button icon={<ReloadOutlined />} onClick={load} aria-label={tr("刷新")} />
            </Space>
          </div>
        </Card>
        {error && <Alert type="error" showIcon message="无法加载评测目录" description={error} />}
        <section className="page-intro">
          <Title level={2}>{pageIntro}</Title>
        </section>
        {loading ? <div className="loading-panel"><Spin size="large" /></div> : pageContent}
      </Content>
    </Layout>
  );
}

export default function App() {
  return (
    <LocaleProvider><LocalizedApp /></LocaleProvider>
  );
}

function LocalizedApp() {
  const { locale } = useI18n();
  useLayoutEffect(() => {
    dayjs.locale(locale === "en" ? "en" : "zh-cn");
  }, [locale]);
  return (
    <ConfigProvider
      locale={locale === "en" ? enUS : zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#26c6a5",
          colorInfo: "#6c8cff",
          colorBgBase: "#07111f",
          colorBgContainer: "#101d2f",
          colorBorder: "#263951",
          borderRadius: 8,
          fontSize: 16,
          fontFamily: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntApp><Portal /></AntApp>
    </ConfigProvider>
  );
}
