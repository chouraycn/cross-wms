// Runtime barrel for embedded-agent steering helpers used by auto-reply commands.
export {
  formatEmbeddedAgentQueueFailureSummary,
  isEmbeddedAgentRunActive,
  queueEmbeddedAgentMessage,
  queueEmbeddedAgentMessageWithOutcomeAsync,
  resolveActiveEmbeddedRunSessionId,
} from '@openclaw-src/agents/embedded-agent-runner/runs.js';
