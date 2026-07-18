export type {
  BindingTargetKind,
  BindingStatus,
  ConversationRef,
  SessionBindingBindInput,
  SessionBindingCapabilities,
  SessionBindingErrorCode,
  SessionBindingPlacement,
  SessionBindingRecord,
  SessionBindingUnbindInput,
  SessionBindingAdapter,
} from "./types.js";

export {
  SessionBindingError,
  isSessionBindingError,
  getSessionBindingService,
  registerSessionBindingAdapter,
  unregisterSessionBindingAdapter,
} from "./session-binding-service.js";

export {
  createConversationBindingRecord,
  getConversationBindingCapabilities,
  listSessionBindingRecords,
  resolveConversationBindingRecord,
  touchConversationBindingRecord,
  unbindConversationBindingRecord,
} from "./records.js";