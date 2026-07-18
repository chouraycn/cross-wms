import type { IsolatedAgentRunContext } from "./run-types.js";

export function setupIsolatedAgentTimeout(context: IsolatedAgentRunContext) {
  const { timeoutSeconds = 30 } = context.config;
  const abortController = new AbortController();

  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutSeconds * 1000);

  return {
    timeoutSignal: abortController,
    cleanup: () => {
      clearTimeout(timeoutId);
    },
  };
}