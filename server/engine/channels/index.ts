export {
  ChannelManager,
  getChannelManager,
  resetChannelManager,
} from '../channelSystem.js';

export type {
  ChannelType,
  ChannelStatus,
  ChannelConfig,
  ChannelMessage,
  ChannelAdapter,
  ChannelAccount,
} from '../channelSystem.js';

export {
  WebhookChannelAdapter,
  FeishuChannelAdapter,
  DingtalkChannelAdapter,
  WechatWorkChannelAdapter,
  WechatPersonalChannelAdapter,
  EmailChannelAdapter,
} from '../channelSystem.js';

export {
  InboundPipeline,
  RateLimitStep,
  ContentFilterStep,
} from '../channelSystem.js';

export {
  startChannelHealthMonitor,
  stopChannelHealthMonitor,
  getChannelHealth,
  listChannelHealth,
  registerChannel,
  unregisterChannel,
  recordChannelEvent,
} from '../channelHealthMonitor.js';

export type {
  ChannelHealthInfo,
  ChannelHealthMonitorDeps,
  ChannelHealthMonitor,
} from '../channelHealthMonitor.js';

export { sendTypingIndicator, stopTypingIndicator } from './typing.js';
export type { TypingIndicatorOptions } from './typing.js';

export { parseTarget, resolveTarget, validateTarget } from './targets.js';
export type { ChannelTarget, TargetResolutionResult } from './targets.js';

export { createChannelSession, getChannelSession, closeChannelSession } from './session.js';
export type { ChannelSession } from './session.js';

export { logChannelMessage, formatChannelLog } from './logging.js';

export {
  getConnection,
  setConnectionState,
  listConnections,
  getActiveConnections,
  getFailedConnections,
  clearConnection,
} from './connection.js';
export type { ChannelConnection, ChannelConnectionState } from './connection.js';

export {
  configureRateLimit,
  checkRateLimit,
  resetRateLimit,
  listRateLimits,
} from './rate-limit.js';
export type { ChannelRateLimit } from './rate-limit.js';

export {
  addRoute,
  removeRoute,
  matchRoute,
  listRoutes,
  clearRoutes,
} from './routing.js';
export type { ChannelMessageRoute } from './routing.js';
