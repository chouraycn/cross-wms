/**
 * Events 模块 - 事件系统
 *
 * 整合所有事件相关功能：总线、监听、记录、策略
 */

// 事件总线（默认导出）
export { default as eventBus } from '../eventBus.js';
export {
  AutomationEventType,
  emitAutomationEvent,
  onAutomationEvent,
  emitAgentEvent,
  onAgentEvent,
  onAgentEventFrom,
  onAgentEventForSession,
} from '../eventBus.js';
export type { AutomationEventType as AutomationEventTypeType, AutomationEventPayload } from '../eventBus.js';

// 事件监听器
export { EventListener } from '../eventListener.js';

// 事件记录器
export {
  recordMessageCreated,
  recordMessageUpdated,
  recordMessageDeleted,
  recordTurnStarted,
  recordTurnCompleted,
  recordTurnFailed,
  recordToolCallStarted,
  recordToolCallCompleted,
  recordToolCallFailed,
  recordModelStreamStart,
  recordModelStreamEnd,
  recordSystemError,
  recordSessionCreated,
  recordSessionArchived,
  recordMemoryAdded,
} from '../eventRecorder.js';

// 事件策略
export {
  getEventPolicy,
  setEventPolicyOptions,
  resetEventPolicyForTests,
} from '../eventPolicy.js';
export type { EventRetentionPolicy, EventPolicyOptions, EventPolicyResult, EventPolicyManager } from '../eventPolicy.js';

// 事件分类账
export { EventLedger } from '../eventLedger.js';

// 频道健康监控
export {
  startChannelHealthMonitor,
  registerChannel,
  unregisterChannel,
  recordChannelEvent,
  getChannelHealth,
  listChannelHealth,
} from '../channelHealthMonitor.js';
export type { ChannelStatus, ChannelHealthInfo, ChannelHealthMonitorDeps, ChannelHealthMonitor } from '../channelHealthMonitor.js';

// 任务监控事件
export {
  publishTaskMonitorEvent,
  publishTodoCreated,
  publishTodoUpdated,
  publishTodoDeleted,
  publishArtifactCreated,
  publishArtifactDeleted,
  publishToolCallCreated,
  publishToolCallUpdated,
  publishTrajectoryEventCreated,
  publishPlanCreated,
} from '../taskMonitorEvents.js';