import type { CronRunOutcome } from "../types.js";
import type { IsolatedAgentRunMode, IsolatedAgentRunOrigin } from "./types.js";
import type { IsolatedAgentRunParams, IsolatedAgentRunResult, IsolatedAgentRunContext } from "./run-types.js";
import { createIsolatedAgentRunContext } from "./run-context.js";
import { executeIsolatedAgentRun } from "./run-execution.js";
import { logger } from "../../../logger.js";

export async function runIsolatedAgent(params: IsolatedAgentRunParams): Promise<IsolatedAgentRunResult> {
  const { job, runId, mode, origin } = params;

  logger.info({ jobId: job.id, jobName: job.name, runId, mode, origin }, "[cron-isolated-agent] starting isolated agent run");

  const context = createIsolatedAgentRunContext(params);

  try {
    const result = await executeIsolatedAgentRun(context);
    logger.info({ jobId: job.id, runId, status: result.outcome.status }, "[cron-isolated-agent] isolated agent run completed");
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ jobId: job.id, runId, error }, "[cron-isolated-agent] isolated agent run failed");
    return {
      outcome: {
        status: "error",
        error,
        diagnostics: context.diagnostics,
      },
    };
  }
}

export function createIsolatedAgentRunParams(
  job: CronRunOutcome extends { job?: infer J } ? J : never,
  opts: {
    runId: string;
    mode?: IsolatedAgentRunMode;
    origin?: IsolatedAgentRunOrigin;
    abortSignal?: AbortSignal;
  },
): IsolatedAgentRunParams {
  const typedJob = job as unknown as IsolatedAgentRunParams["job"];
  return {
    job: typedJob,
    runId: opts.runId,
    mode: opts.mode ?? "regular",
    origin: opts.origin ?? "scheduled",
    abortSignal: opts.abortSignal,
  };
}