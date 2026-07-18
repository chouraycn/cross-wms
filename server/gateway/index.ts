/**
 * Gateway EventBus Module Index
 * Gateway 事件总线模块入口
 *
 * 导出 GatewayEventBus 单例、类型与事件常量，
 * 业务模块直接从此处导入即可。
 */

export {
  GatewayEventBus,
  getGatewayEventBus,
  gatewayEventBus,
} from './gatewayEventBus.js';

export type {
  GatewayEvent,
  GatewayEventHandler,
  GatewayAsyncHandler,
  GatewayEventFilter,
  GatewayEventBusOptions,
} from './gatewayEventBus.js';

export {
  GATEWAY_EVENT_TYPES,
  GATEWAY_EVENT_SOURCES,
} from './gatewayEventTypes.js';

export type {
  GatewayEventType,
  GatewayEventSource,
  GatewayEventPayloadMap,
  ChatMessagePayload,
  ChatResponsePayload,
  ChatErrorPayload,
  SessionCreatePayload,
  SessionUpdatePayload,
  SessionDeletePayload,
  ToolCallStartPayload,
  ToolCallEndPayload,
  CronTickPayload,
  CronDonePayload,
  GatewayAuthPayload,
  GatewayProbePayload,
  SystemShutdownPayload,
  SystemReadyPayload,
} from './gatewayEventTypes.js';
