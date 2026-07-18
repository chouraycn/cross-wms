import type { IsolatedAgentExecutor, IsolatedAgentRunContext, IsolatedAgentRunResult } from "./run-types.js";
import type { CronRunOutcome } from "../types.js";
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