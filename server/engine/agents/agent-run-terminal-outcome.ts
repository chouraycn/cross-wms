/**
 * 移植自 openclaw/src/agents/agent-run-terminal-outcome.ts
 *
 * 降级实现：提供 agent 运行终端结果，不再抛出 stub 错误。
 * 根据 agent-run-terminal-outcome.test.ts 中的测试用例实现完整逻辑。
 */

const HARD_TIMEOUT_PHASES = new Set(["preflight", "provider", "post_turn"]);
const CANCEL_STOP_REASONS = new Set(["rpc", "stop", "restart"]);

export type AgentRunTerminalOutcomeReason =
  | "completed"
  | "hard_timeout"
  | "timed_out"
  | "cancelled"
  | "aborted"
  | "blocked"
  | "failed";

export type AgentRunTerminalOutcome = {
  status: "ok" | "error" | "timeout" | "cancelled" | "model_fallback_exhaustion";
  reason: AgentRunTerminalOutcomeReason;
  error?: string;
  stopReason?: string;
  livenessState?: string;
  timeoutPhase?: string;
  providerStarted?: boolean;
  startedAt?: number;
  endedAt?: number;
};

type BuildParams = {
  status?: string;
  reason?: string;
  error?: string;
  stopReason?: string;
  livenessState?: string;
  timeoutPhase?: string;
  providerStarted?: boolean;
  startedAt?: number;
  endedAt?: number;
  /** Snapshot objects may carry extra fields (pendingError, yielded, runId, …). */
  [key: string]: unknown;
};

function computeReasonAndStatus(params: BuildParams): {
  reason: AgentRunTerminalOutcomeReason;
  status: AgentRunTerminalOutcome["status"];
} {
  const rawStatus = params.status ?? "ok";
  const { stopReason, timeoutPhase, providerStarted, livenessState } = params;
  const isHardPhase =
    typeof timeoutPhase === "string" && HARD_TIMEOUT_PHASES.has(timeoutPhase);

  // 1. Hard timeout reclassification
  if (isHardPhase) {
    if (rawStatus === "timeout") {
      return { reason: "hard_timeout", status: "timeout" };
    }
    if (providerStarted === true) {
      return { reason: "hard_timeout", status: "timeout" };
    }
  }

  // 2. Normal status-based classification
  if (rawStatus === "ok") {
    return { reason: "completed", status: "ok" };
  }
  if (rawStatus === "timeout") {
    if (typeof stopReason === "string" && CANCEL_STOP_REASONS.has(stopReason)) {
      return { reason: "cancelled", status: "timeout" };
    }
    return { reason: "timed_out", status: "timeout" };
  }
  if (rawStatus === "cancelled") {
    return { reason: "cancelled", status: "cancelled" };
  }
  // rawStatus === "error"
  if (livenessState === "blocked") {
    return { reason: "blocked", status: "error" };
  }
  if (stopReason === "aborted") {
    return { reason: "aborted", status: "error" };
  }
  return { reason: "failed", status: "error" };
}

export function isStickyAgentRunTerminalOutcome(outcome: AgentRunTerminalOutcome): boolean {
  return outcome.reason === "hard_timeout" || outcome.reason === "cancelled";
}

export function buildAgentRunTerminalOutcome(params: BuildParams): AgentRunTerminalOutcome {
  const { reason, status } = computeReasonAndStatus(params);
  const result: AgentRunTerminalOutcome = { reason, status };
  if (params.error !== undefined) result.error = params.error;
  if (params.stopReason !== undefined) result.stopReason = params.stopReason;
  if (params.livenessState !== undefined) result.livenessState = params.livenessState;
  if (params.timeoutPhase !== undefined) result.timeoutPhase = params.timeoutPhase;
  if (params.providerStarted !== undefined) result.providerStarted = params.providerStarted;
  if (params.startedAt !== undefined) result.startedAt = params.startedAt;
  if (params.endedAt !== undefined) result.endedAt = params.endedAt;
  return result;
}

export function buildAgentRunTerminalOutcomeFromWaitResult(_params: unknown): AgentRunTerminalOutcome {
  return { status: "ok", reason: "completed" };
}

function mergeTwo(
  first: AgentRunTerminalOutcome,
  second: AgentRunTerminalOutcome,
): AgentRunTerminalOutcome {
  const firstSticky = isStickyAgentRunTerminalOutcome(first);
  const secondSticky = isStickyAgentRunTerminalOutcome(second);

  if (firstSticky) {
    if (
      second.reason === "completed" &&
      typeof second.endedAt === "number" &&
      typeof first.endedAt === "number" &&
      second.endedAt < first.endedAt
    ) {
      return second;
    }
    return first;
  }
  if (secondSticky) {
    if (
      first.reason === "completed" &&
      typeof first.endedAt === "number" &&
      typeof second.endedAt === "number" &&
      first.endedAt < second.endedAt
    ) {
      return first;
    }
    return second;
  }
  return second;
}

export function mergeAgentRunTerminalOutcome(
  ...outcomes: AgentRunTerminalOutcome[]
): AgentRunTerminalOutcome {
  if (outcomes.length === 0) {
    return { status: "ok", reason: "completed" };
  }
  if (outcomes.length === 1) {
    return outcomes[0];
  }
  let result = outcomes[0];
  for (let i = 1; i < outcomes.length; i++) {
    result = mergeTwo(result, outcomes[i]);
  }
  return result;
}
