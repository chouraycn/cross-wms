export {
  ChannelSystem,
  ChannelManager,
  registerAdapterFactory,
} from '../channelSystem.js';

export {
  startHealthMonitoring,
  stopHealthMonitoring,
  getChannelHealth,
} from '../channelHealthMonitor.js';

export { sendTypingIndicator, stopTypingIndicator } from './typing.js';
export type { TypingIndicatorOptions } from './typing.js';

export { parseTarget, resolveTarget, validateTarget } from './targets.js';
export type { ChannelTarget, TargetResolutionResult } from './targets.js';

export { createChannelSession, getChannelSession, closeChannelSession } from './session.js';
export type { ChannelSession } from './session.js';

export { logChannelMessage, formatChannelLog } from './logging.js';
