import type { IsolatedAgentRunContext, IsolatedAgentRunResult } from "./run-types.js";
import type { IsolatedAgentExitCode } from "./types.js";
import { createIsolatedAgentExecutor } from "./run-executor.js";
import { setupIsolatedAgentTimeout } from "./run-timeout.js";

export async function executeIsolatedAgentRun(context: IsolatedAgentRunContext): Promise<IsolatedAgentRunResult> {
  const { job, runId, mode, abortSignal } = context;

  if (mode === "dry-run") {
    return {
      outcome: {
        status: "ok",
        summary: "dry-run completed without actual execution",
      },
    };
  }

  if (mode === "preview") {
    return {
      outcome: {
        status: "ok",
        summary: "preview completed without actual execution",
      },
    };
  }

  const { timeoutSignal, cleanup } = setupIsolatedAgentTimeout(context);

  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutSignal.signal])
    : timeoutSignal.signal;

  const executor = createIsolatedAgentExecutor();

  try {
    const result = await executor.execute({ ...context, abortSignal: combinedSignal });
    return result;
  } catch (err) {
    if (combinedSignal.aborted) {
      return {
        outcome: {
          status: "error",
          error: "execution cancelled or timed out",
          diagnostics: context.diagnostics,
        },
      };
    }
    throw err;
  } finally {
    cleanup();
  }
}