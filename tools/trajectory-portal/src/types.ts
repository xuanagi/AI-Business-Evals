export interface ArtifactEntry {
  name: string;
  relativePath: string;
  storagePath?: string;
  stepName?: string;
  size: number;
}

export interface ArtifactManifestEntry {
  stepName?: string;
  source?: string;
  destination?: string;
  type?: string;
  status?: "ok" | "empty" | "failed" | "skipped" | string;
  service?: string | null;
}

export interface TrialPhase {
  key: string;
  label: string;
  startedAt: string | null;
  finishedAt: string | null;
  seconds: number | null;
  status?: "completed" | "failed" | "empty" | string;
  note?: string;
}

export interface TrajectoryValidation {
  valid: boolean;
  issues: string[];
  warnings?: string[];
  schemaVersion?: string;
}

export interface StepResult {
  index: number;
  name: string;
  reward: number | null;
  rewards: Record<string, number>;
  exception?: unknown;
  startedAt?: string | null;
  finishedAt?: string | null;
  seconds?: number | null;
  terminatedEarly: boolean;
  artifactCount: number;
  inputTokens?: number;
  cachedTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;
}

export interface ArtifactPreviewSheet {
  name: string;
  rows: string[][];
  totalRows: number;
  totalColumns: number;
}

export interface ArtifactPreview {
  kind: "spreadsheet" | "document" | "presentation" | "html" | "text" | "unsupported";
  name: string;
  sheets?: ArtifactPreviewSheet[];
  text?: string;
  truncated?: boolean;
  message?: string;
}

export interface TrialSummary {
  name: string;
  taskName: string;
  taskLabel: string;
  taskChecksum: string;
  model: string;
  agent: string;
  agentVersion: string;
  reasoningEffort: string;
  reward: number | null;
  rewards: Record<string, number>;
  rewardSources: string[];
  rewardConflicts?: Array<{ dimension: string; canonicalSource: string; canonicalValue: number; conflictingSource: string; conflictingValue: number }>;
  passed: number | null;
  total: number | null;
  gateFailed: boolean;
  exception: unknown;
  exceptionCategory: string;
  status: "pending" | "running" | "verifying" | "completed" | "errored" | "timeout" | "cancelled" | "unscored" | string;
  statusLabel: string;
  startedAt: string | null;
  finishedAt: string | null;
  agentSeconds: number | null;
  phases: TrialPhase[];
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number | null;
  agentSteps: number;
  toolCalls: number;
  hasTrajectory: boolean;
  trajectoryValidation?: TrajectoryValidation;
  artifacts: ArtifactEntry[];
  artifactManifest: ArtifactManifestEntry[];
  stepResults: StepResult[];
  attempt: number;
  attemptCount: number;
  isRegrade: boolean;
  sourceTrial: Record<string, unknown>;
  sourceReward?: number | null;
  regradeDelta?: number | null;
  taskVersion: string;
  taskSource: string;
  verifierMode: string;
  taskConfig?: Record<string, unknown>;
  agentConfig?: Record<string, unknown>;
  environmentConfig?: Record<string, unknown>;
  verifierConfig?: Record<string, unknown>;
}

export interface JobSummary {
  key: string;
  name: string;
  path: string;
  id: string;
  evalName: string;
  evalNames?: string[];
  datasetNames?: string[];
  models?: string[];
  reasoningEfforts?: string[];
  model: string;
  reasoningEffort: string;
  mean: number | null;
  metrics: Array<Record<string, unknown>>;
  failedChecks: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  jobSeconds: number | null;
  totalTrials: number;
  completedTrials: number;
  erroredTrials: number;
  cancelledTrials: number;
  retries: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  costUsd: number | null;
  trials: TrialSummary[];
}

export interface ScoreCheck {
  name: string;
  passed: boolean;
  detail?: string;
  weight?: number;
  gate?: boolean;
  evaluator_type?: string;
}

export interface ScoreData {
  reward?: number;
  passed?: number;
  total?: number;
  gate_failed?: boolean;
  checks?: ScoreCheck[];
}

export interface ToolCall {
  tool_call_id?: string;
  function_name?: string;
  arguments?: unknown;
}

export interface TrajectoryStep {
  step_id?: number;
  timestamp?: string;
  source?: string;
  model_name?: string;
  message?: string | Array<{ type?: string; text?: string; source?: { path?: string; media_type?: string } }>;
  tool_calls?: ToolCall[];
  observation?: unknown;
  metrics?: Record<string, unknown>;
  portal_step_name?: string;
  original_step_id?: number;
}

export interface TrajectoryData {
  schema_version?: string;
  session_id?: string;
  agent?: Record<string, unknown>;
  steps?: TrajectoryStep[];
}

export interface TrialDetail {
  summary: TrialSummary;
  result: Record<string, unknown>;
  score: ScoreData;
  rewardDetails: unknown;
  ctrf: unknown;
  trialConfig: Record<string, unknown>;
  trajectory: TrajectoryData;
  trajectoryFiles?: Array<{ stepName?: string; label: string; path: string }>;
  agentLog: string;
  agentLogs?: Array<{ label: string; path: string; content: string }>;
  stepScores?: Array<{ stepName: string; score: ScoreData; rewardDetails: unknown; ctrf: unknown }>;
  loadedSections: Array<"trajectory" | "log">;
}

export interface WorkspaceResponse {
  root: string;
  jobs: JobSummary[];
  diagnostics: {
    jobsDiscovered: number;
    jobsSkipped: number;
    trialsDiscovered: number;
    trialsSkipped: number;
    issues: Array<{ kind: string; path: string; message: string }>;
    refreshedAt: string;
  };
}

export interface ToolStatus {
  harbor: boolean;
  rlviz: boolean;
  agentviz: boolean;
  node: boolean;
  npm: boolean;
  npx: boolean;
}
