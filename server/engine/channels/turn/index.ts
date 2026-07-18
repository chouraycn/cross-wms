export type {
  TurnStatus,
  TurnSource,
  TurnContext,
  TurnWindow,
  DeliveryStatus,
  DeliveryResult,
  DispatchStatus,
  DispatchResult,
  BotLoopProtectionState,
  TurnGuardrailConfig,
  GuardrailViolation,
} from "./types.js";

export {
  createTurn,
  getTurn,
  updateTurnStatus,
  addOutputMessage,
  setTurnMetadata,
  getConversationTurns,
  getActiveTurnCount,
  getTurnsByChannel,
  cancelTurn,
  clearTurnHistory,
} from "./kernel.js";

export type { HistoryWindowOptions } from "./history-window.js";
export {
  getTurnHistoryWindow,
  getRecentTurns,
  getTurnsInTimeRange,
  getTurnCountInWindow,
  getLastUserTurn,
  getLastBotTurn,
  formatHistoryForPrompt,
} from "./history-window.js";

export {
  recordDelivery,
  getDeliveryHistory,
  getLastDeliveryResult,
  updateDeliveryStatus,
  getPendingDeliveries,
  getFailedDeliveries,
  retryDelivery,
  clearDeliveryHistory,
  getDeliveryStats,
} from "./durable-delivery.js";

export type { DeliveryResultOptions } from "./delivery-result.js";
export {
  createDeliveryResult,
  isDeliverySuccess,
  isDeliveryFailure,
  isDeliveryRetryable,
  shouldRetryDelivery,
  calculateBackoff,
  mergeDeliveryResults,
  formatDeliverySummary,
  getFailedDeliveryErrors,
  logDeliveryResult,
} from "./delivery-result.js";

export {
  createDispatchResult,
  recordDispatch,
  getDispatchResult,
  isDispatchAccepted,
  isDispatchRejected,
  acceptDispatch,
  rejectDispatch,
  queueDispatch,
  markDuplicateDispatch,
  getQueuePosition,
  getQueueSize,
  dequeueNextDispatch,
  clearDispatchQueue,
  clearDispatchResults,
} from "./dispatch-result.js";

export type { BotLoopProtectionConfig } from "./bot-loop-protection.js";
export {
  configureBotLoopProtection,
  getLoopProtectionState,
  recordBotMessage,
  recordUserMessage,
  checkLoopRisk,
  isBotSuppressed,
  resetLoopProtection,
  clearAllLoopProtection,
  getProtectionStats,
} from "./bot-loop-protection.js";

export {
  configureTurnGuardrails,
  validateTurnInput,
  validateTurnRate,
  validateTurnOutput,
  checkTurnGuards,
  hasBlockingViolations,
  clearGuardrailTimestamps,
} from "./message-turn-guardrails.js";
