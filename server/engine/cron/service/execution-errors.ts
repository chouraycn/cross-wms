import type { CronJob, CronRunOutcome } from "../types.js";

export type ExecutionErrorCategory =
  | "delivery-target"
  | "model-error"
  | "timeout"
  | "validation"
  | "authorization"
  | "resource"
  | "unknown";

export interface ExecutionErrorInfo {
  category: ExecutionErrorCategory;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function classifyExecutionError(error: unknown): ExecutionErrorInfo {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("delivery") || message.includes("target")) {
    return {
      category: "delivery-target",
      message,
      retryable: false,
    };
  }

  if (message.includes("model") || message.includes("provider")) {
    return {
      category: "model-error",
      message,
      retryable: true,
    };
  }

  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      category: "timeout",
      message,
      retryable: true,
    };
  }

  if (message.includes("validation") || message.includes("invalid")) {
    return {
      category: "validation",
      message,
      retryable: false,
    };
  }

  if (message.includes("auth") || message.includes("permission") || message.includes("token")) {
    return {
      category: "authorization",
      message,
      retryable: false,
    };
  }

  if (message.includes("resource") || message.includes("limit")) {
    return {
      category: "resource",
      message,
      retryable: true,
    };
  }

  return {
    category: "unknown",
    message,
    retryable: false,
  };
}

export function createErrorOutcome(error: unknown): CronRunOutcome {
  const info = classifyExecutionError(error);
  return {
    status: "error",
    error: info.message,
    errorKind: info.category === "delivery-target" ? "delivery-target" : undefined,
  };
}