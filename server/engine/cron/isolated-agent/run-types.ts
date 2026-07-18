import type { CronJob, CronRunOutcome, CronRunDiagnostics, CronRunTelemetry } from "../types.js";
import type {
  IsolatedAgentRunMode,
  IsolatedAgentRunOrigin,
  IsolatedAgentExitCode,
  IsolatedAgentRuntimeConfig,
  IsolatedAgentAuthProfile,
  IsolatedAgentModelSelection,
  IsolatedAgentDeliveryOptions,
  IsolatedAgentSessionState,
} from "./types.js";

export interface IsolatedAgentRunParams {
  job: CronJob;
  runId: string;
  mode: IsolatedAgentRunMode;
  origin: IsolatedAgentRunOrigin;
  abortSignal?: AbortSignal;
}

export interface IsolatedAgentRunContext {
  job: CronJob;
  runId: string;
  mode: IsolatedAgentRunMode;
  origin: IsolatedAgentRunOrigin;
  abortSignal?: AbortSignal;
  startTimeMs: number;
  config: IsolatedAgentRuntimeConfig;
  authProfile: IsolatedAgentAuthProfile;
  modelSelection: IsolatedAgentModelSelection;
  deliveryOptions: IsolatedAgentDeliveryOptions;
  sessionState: IsolatedAgentSessionState;
  diagnostics: CronRunDiagnostics;
}

export interface IsolatedAgentRunResult {
  outcome: CronRunOutcome;
  sessionState?: IsolatedAgentSessionState;
  telemetry?: CronRunTelemetry;
}

export interface IsolatedAgentExecutionState {
  context: IsolatedAgentRunContext;
  startedAtMs: number;
  lastOutputAtMs?: number;
  completed?: boolean;
  exitCode?: IsolatedAgentExitCode;
  error?: string;
  summary?: string;
}

export interface IsolatedAgentExecutor {
  execute(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult>;
}

export interface IsolatedAgentExecutionStep {
  name: string;
  description?: string;
  execute(state: IsolatedAgentExecutionState): Promise<void>;
}

export interface IsolatedAgentDeliveryResult {
  delivered: boolean;
  status: "delivered" | "not-delivered" | "unknown" | "not-requested";
  error?: string;
  threadId?: string;
}