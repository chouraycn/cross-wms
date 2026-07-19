/**
 * Context 模块 - 上下文管理
 *
 * 管理对话上下文：缓存、压缩、截断、投影
 */

// 上下文缓存
export { ContextWindowCache } from '../contextCache.js';
export type { ModelContextWindowInfo, ContextCacheConfig } from '../contextCache.js';

// 上下文窗口守护
export { ContextWindowGuard } from '../contextWindowGuard.js';

// 上下文投影
export type { ContextProjection } from '../context-projection.js';
export { ContextProjectionManager } from '../context-projection.js';
export type { ProjectionContent, ProjectionBuildOptions } from '../context-projection.js';

// 上下文截断
export {
  estimateTokens,
  estimateMessagesTokens,
  sanitizeToolMessages,
  truncateContextForModel,
} from '../contextTruncate.js';
export type { ApiMessage } from '../contextTruncate.js';