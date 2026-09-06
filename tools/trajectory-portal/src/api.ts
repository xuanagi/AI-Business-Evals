import type { ArtifactPreview, JobSummary, ToolStatus, TrialDetail, TrialSummary, WorkspaceResponse } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

function exceptionText(exception: unknown): string {
  if (typeof exception === "string") return exception.trim();
  if (exception === null || exception === undefined) return "";
  try {
    return JSON.stringify(exception);
  } catch {
    return String(exception);
  }
}

function inferredTrialStatus(summary: TrialSummary): Pick<TrialSummary, "status" | "statusLabel" | "exceptionCategory"> {
  const status = typeof summary.status === "string" ? summary.status.trim().toLowerCase() : "";
  const statusLabel = typeof summary.statusLabel === "string" ? summary.statusLabel.trim() : "";
  const exceptionCategory = typeof summary.exceptionCategory === "string" ? summary.exceptionCategory.trim() : "";

  if (status) {
    const normalizedStatus = status === "failed" || status === "error" ? "errored" : status;
    return { status: normalizedStatus, statusLabel, exceptionCategory };
  }

  const exception = exceptionText(summary.exception);
  if (exception) {
    const classification = `${exceptionCategory} ${exception}`.toLocaleLowerCase();
    if (classification.includes("cancel") || classification.includes("取消")) {
      return { status: "cancelled", statusLabel: "已取消", exceptionCategory: exceptionCategory || "已取消" };
    }
    if (classification.includes("timeout") || classification.includes("timed out") || classification.includes("超时")) {
      return { status: "timeout", statusLabel: "超时", exceptionCategory: exceptionCategory || "超时" };
    }
    return { status: "errored", statusLabel: "运行异常", exceptionCategory: exceptionCategory || "运行失败" };
  }

  if (!summary.startedAt) return { status: "pending", statusLabel: "等待运行", exceptionCategory };
  if (!summary.finishedAt) return { status: "running", statusLabel: "运行中", exceptionCategory };

  const hasScore = typeof summary.reward === "number"
    || Object.keys(summary.rewards ?? {}).length > 0
    || typeof summary.passed === "number"
    || typeof summary.total === "number";
  return hasScore
    ? { status: "completed", statusLabel: "已完成", exceptionCategory }
    : { status: "unscored", statusLabel: "无评分", exceptionCategory };
}

function normalizeTrialSummary(summary: TrialSummary): TrialSummary {
  const inferredStatus = inferredTrialStatus(summary);
  return {
    ...summary,
    ...inferredStatus,
    rewards: summary.rewards ?? {},
    rewardSources: summary.rewardSources ?? [],
    phases: summary.phases ?? [],
    trajectoryValidation: summary.trajectoryValidation ?? {
      valid: false,
      issues: ["当前 Portal 服务未提供轨迹校验结果，请重启服务后重试"],
      warnings: [],
    },
    artifacts: summary.artifacts ?? [],
    artifactManifest: summary.artifactManifest ?? [],
    stepResults: summary.stepResults ?? [],
    sourceTrial: summary.sourceTrial ?? {},
    taskConfig: summary.taskConfig ?? {},
    agentConfig: summary.agentConfig ?? {},
    environmentConfig: summary.environmentConfig ?? {},
    verifierConfig: summary.verifierConfig ?? {},
  };
}

function normalizeJob(job: JobSummary): JobSummary {
  return {
    ...job,
    metrics: job.metrics ?? [],
    trials: (job.trials ?? []).map(normalizeTrialSummary),
  };
}

function normalizeWorkspace(payload: WorkspaceResponse): WorkspaceResponse {
  const jobs = (payload.jobs ?? []).map(normalizeJob);
  return {
    ...payload,
    root: payload.root ?? "",
    jobs,
    diagnostics: payload.diagnostics ?? {
      jobsDiscovered: jobs.length,
      jobsSkipped: 0,
      trialsDiscovered: jobs.reduce((total, job) => total + job.trials.length, 0),
      trialsSkipped: 0,
      issues: [],
      refreshedAt: "",
    },
  };
}

function normalizeTrialDetail(payload: TrialDetail): TrialDetail {
  return {
    ...payload,
    summary: normalizeTrialSummary(payload.summary),
    result: payload.result ?? {},
    score: { ...(payload.score ?? {}), checks: payload.score?.checks ?? [] },
    rewardDetails: payload.rewardDetails ?? {},
    ctrf: payload.ctrf ?? {},
    trialConfig: payload.trialConfig ?? {},
    trajectory: { ...(payload.trajectory ?? {}), steps: payload.trajectory?.steps ?? [] },
    trajectoryFiles: payload.trajectoryFiles ?? [],
    agentLog: payload.agentLog ?? "",
    agentLogs: payload.agentLogs ?? [],
    stepScores: payload.stepScores ?? [],
    loadedSections: payload.loadedSections ?? [],
  };
}

export const api = {
  workspace: () => request<WorkspaceResponse>("/api/workspace").then(normalizeWorkspace),
  setWorkspace: (path: string) =>
    request<WorkspaceResponse>("/api/workspace", { method: "POST", body: JSON.stringify({ path }) }).then(normalizeWorkspace),
  selectDirectory: () => request<WorkspaceResponse & { cancelled?: boolean }>("/api/select-directory", { method: "POST", body: "{}" })
    .then((payload) => ({ ...normalizeWorkspace(payload), cancelled: payload.cancelled })),
  trial: (job: string, trial: string, sections: Array<"trajectory" | "log"> = []) => {
    const include = sections.length ? `&include=${encodeURIComponent(sections.join(","))}` : "";
    return request<TrialDetail>(`/api/trial?job=${encodeURIComponent(job)}&trial=${encodeURIComponent(trial)}${include}`).then(normalizeTrialDetail);
  },
  artifactPreview: (job: string, trial: string, path: string) =>
    request<ArtifactPreview>(`/api/artifact-preview?job=${encodeURIComponent(job)}&trial=${encodeURIComponent(trial)}&path=${encodeURIComponent(path)}`),
  toolStatus: () => request<ToolStatus>("/api/tools/status"),
  launch: (tool: "harbor" | "rlviz" | "agentviz", job: string, trial?: string, trajectoryPath?: string) =>
    request<{ ok: boolean; message: string; url?: string }>("/api/tools/launch", {
      method: "POST",
      body: JSON.stringify({ tool, job, trial, trajectoryPath }),
    }),
  install: (tool: "rlviz") =>
    request<{ ok: boolean; message: string }>("/api/tools/install", {
      method: "POST",
      body: JSON.stringify({ tool }),
    }),
};

export function artifactUrl(job: string, trial: string, path: string): string {
  return `/api/artifact?job=${encodeURIComponent(job)}&trial=${encodeURIComponent(trial)}&path=${encodeURIComponent(path)}`;
}
