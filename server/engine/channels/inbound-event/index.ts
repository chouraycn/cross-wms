export type {
  InboundEventType,
  InboundEventSource,
  InboundEventMedia,
  InboundEventClassification,
  InboundEventContext,
} from "./types.js";

export type { MediaProcessingOptions } from "./media.js";
export {
  processMediaAttachments,
  extractMediaText,
  getMediaByEventId,
  clearMediaCache,
  getMediaTypeCount,
} from "./media.js";

export type { ClassificationRule } from "./classification.js";
export {
  registerClassificationRule,
  unregisterClassificationRule,
  classifyInboundEvent,
  isHighPriority,
  hasTag,
  clearClassificationRules,
} from "./classification.js";

export type { EventCreationOptions } from "./context.js";
export {
  createInboundEvent,
  enrichEventContext,
  getEventContext,
  updateEventContext,
  setEventMetadata,
  getEventMetadata,
  listEventsByChannel,
  removeEvent,
  clearEvents,
  getEventStats,
} from "./context.js";
