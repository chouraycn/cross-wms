// @ts-nocheck
/** Runtime facade for compact command dependencies. */
export {
  abortEmbeddedAgentRun,
  compactEmbeddedAgentSession,
  isEmbeddedAgentRunAbortableForCompaction,
  waitForEmbeddedAgentRunEnd,
} from '@openclaw-src/agents/embedded-agent.js';
export {
  resolveFreshSessionTotalTokens,
  resolveSessionFilePath,
  resolveSessionFilePathOptions,
} from '@openclaw-src/config/sessions.js';
export { enqueueSystemEvent } from '@openclaw-src/infra/system-events.js';
export { formatContextUsageShort, formatTokenCount } from "../status.js";
export { incrementCompactionCount } from "./session-updates.js";
