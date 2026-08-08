// Builds expected system-run payloads for execution approval tests.
import { formatExecCommand } from "../infra/system-run-command.js";

type SystemRunPrepareInput = {
  command?: any;
  rawCommand?: any;
  cwd?: any;
  agentId?: any;
  sessionKey?: any;
};

/** Builds the normalized system-run prepare payload used by approval tests. */
export function buildSystemRunPreparePayload(params: SystemRunPrepareInput) {
  const argv = Array.isArray(params.command) ? params.command.map(String) : [];
  const previewCommand =
    typeof params.rawCommand === "string" && params.rawCommand.trim().length > 0
      ? params.rawCommand
      : null;
  const commandText = formatExecCommand(argv) || "";
  const commandPreview = previewCommand && previewCommand !== commandText ? previewCommand : null;
  return {
    payload: {
      plan: {
        argv,
        cwd: typeof params.cwd === "string" ? params.cwd : null,
        commandText,
        commandPreview,
        agentId: typeof params.agentId === "string" ? params.agentId : null,
        sessionKey: typeof params.sessionKey === "string" ? params.sessionKey : null,
      },
    },
  };
}
