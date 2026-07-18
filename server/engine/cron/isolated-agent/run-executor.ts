import type { IsolatedAgentExecutor, IsolatedAgentRunContext, IsolatedAgentRunResult } from "./run-types.js";
import type { CronJob, CronRunOutcome } from "../types.js";
import { logger } from "../../../logger.js";

class DefaultIsolatedAgentExecutor implements IsolatedAgentExecutor {
  async execute(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult> {
    const { job, runId } = context;

    logger.debug({ jobId: job.id, runId }, "[cron-isolated-agent] executing job");

    if (job.payload.kind === "agentTurn") {
      return this.executeAgentTurn(context);
    }

    if (job.payload.kind === "command") {
      return this.executeCommand(context);
    }

    if (job.payload.kind === "systemEvent") {
      return this.executeSystemEvent(context);
    }

    return {
      outcome: {
        status: "error",
        error: "unsupported payload kind",
      },
    };
  }

  private async executeAgentTurn(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult> {
    const { job, runId, abortSignal } = context;

    try {
      const outcome: CronRunOutcome = {
        status: "ok",
        summary: "agent turn completed",
        diagnostics: context.diagnostics,
      };

      return { outcome };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.id, runId, error }, "[cron-isolated-agent] agent turn execution failed");
      return {
        outcome: {
          status: "error",
          error,
          diagnostics: context.diagnostics,
        },
      };
    }
  }

  private async executeCommand(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult> {
    const { job, runId } = context;

    try {
      const outcome: CronRunOutcome = {
        status: "ok",
        summary: "command execution completed",
        diagnostics: context.diagnostics,
      };

      return { outcome };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error({ jobId: job.id, runId, error }, "[cron-isolated-agent] command execution failed");
      return {
        outcome: {
          status: "error",
          error,
          diagnostics: context.diagnostics,
        },
      };
    }
  }

  private async executeSystemEvent(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult> {
    const { job, runId } = context;

    const text = job.payload.kind === "systemEvent" ? job.payload.text : "";
    logger.info({ jobId: job.id, runId, text }, "[cron-isolated-agent] system event");

    return {
      outcome: {
        status: "ok",
        summary: "system event processed",
        diagnostics: context.diagnostics,
      },
    };
  }
}

export function createIsolatedAgentExecutor(): IsolatedAgentExecutor {
  return new DefaultIsolatedAgentExecutor();
}

/** 隔离运行参数（精简版） */
export type IsolatedRunParams = {
  job: CronJob;
  runId: string;
  prompt: string;
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  model?: string;
  provider?: string;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
};

/** 隔离运行结果（精简版） */
export type IsolatedRunResult = {
  status: "ok" | "error";
  outputText?: string;
  summary?: string;
  error?: string;
  model?: string;
  provider?: string;
  startedAtMs: number;
  endedAtMs: number;
};

/**
 * 执行隔离 agent 运行。
 *
 * 精简版实现：记录运行参数并基于默认执行器执行一次 agent 回合。
 * 实际模型调用和交付由上层执行器与分发器完成。
 */
export async function executeIsolatedRun(
  params: IsolatedRunParams,
): Promise<IsolatedRunResult> {
  const { job, runId, prompt, abortSignal, model, provider, timeoutMs } = params;
  const startedAtMs = Date.now();

  logger.info(
    { jobId: job.id, runId, promptLength: prompt.length },
    "[cron-isolated-agent] executing isolated run",
  );

  // 中止信号检查
  if (abortSignal?.aborted) {
    return {
      status: "error",
      error: "run aborted before start",
      startedAtMs,
      endedAtMs: Date.now(),
    };
  }

  try {
    // 精简版：通过默认执行器执行 agent 回合
    const executor = createIsolatedAgentExecutor();
    const context: IsolatedAgentRunContext = {
      job,
      runId,
      mode: "regular",
      origin: "scheduled",
      startTimeMs: startedAtMs,
      abortSignal,
      config: {
        allowUnsafeExternalContent: false,
        ...(timeoutMs ? { timeoutSeconds: Math.floor(timeoutMs / 1000) } : {}),
      },
      authProfile: { kind: "none" },
      modelSelection: {
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
      },
      deliveryOptions: {},
      sessionState: {},
      diagnostics: { entries: [] },
    };

    const result = await executor.execute(context);
    const endedAtMs = Date.now();

    const telemetry = result.outcome.telemetry;
    const runResult: IsolatedRunResult = {
      status: result.outcome.status === "ok" ? "ok" : "error",
      startedAtMs,
      endedAtMs,
    };
    if (result.outcome.summary) {
      runResult.summary = result.outcome.summary;
    }
    if (result.outcome.error) {
      runResult.error = result.outcome.error;
    }
    if (telemetry?.model) {
      runResult.model = telemetry.model;
    }
    if (telemetry?.provider) {
      runResult.provider = telemetry.provider;
    }
    return runResult;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobId: job.id, runId, error },
      "[cron-isolated-agent] isolated run failed",
    );
    return {
      status: "error",
      error,
      startedAtMs,
      endedAtMs: Date.now(),
    };
  }
}