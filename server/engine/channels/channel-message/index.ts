export {
  MessageValidationSchema,
  validateChannelMessage,
  validateMessageContent,
  validateMessageId,
  validateChannelId,
  type ValidationResult,
} from "./message-validator.js";

export {
  transformMessage,
  normalizeText,
  markdownToText,
  enrichMetadata,
  convertMessageParts,
  mergeMessageParts,
  type TransformOptions,
  type TransformResult,
} from "./message-transformer.js";

export {
  addRoute,
  removeRoute,
  getRoute,
  listRoutes,
  clearRoutes,
  routeMessage,
  matchRoute,
  type RouteCondition,
  type MessageRoute,
} from "./message-router.js";

export {
  MessageQueue,
  type QueuePriority,
  type QueuedMessage,
  type QueueOptions,
} from "./message-queue.js";

export {
  determinePriority,
  calculateDefaultPriority,
  comparePriority,
  isHigherPriority,
  isLowerPriority,
  getPriorityLabel,
  getPriorityColor,
  addPriorityRule,
  removePriorityRule,
  listPriorityRules,
  clearPriorityRules,
  type MessagePriority,
} from "./message-priority.js";