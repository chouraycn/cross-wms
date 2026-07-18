/**
 * 会话管理系统 - 统一导出
 *
 * 提供完整的会话管理功能，包括：
 * - 类型定义
 * - 会话分类
 * - 会话 ID 生成与解析
 * - 会话密钥管理
 * - 模型覆盖配置
 * - 发送策略
 * - 会话聊天类型
 * - 生命周期事件
 * - 用户轮次转录本
 * - 输入来源追踪
 */

export * from './types.js';
export * from './classify-session-kind.js';
export * from './session-id.js';
export * from './session-id-resolution.js';
export * from './session-key.js';
export * from './model-overrides.js';
export * from './send-policy.js';
export * from './session-chat-type.js';
export * from './session-lifecycle-events.js';
export * from './user-turn-transcript.js';
export * from './input-provenance.js';
export * from './routing-session-key.js';

// ============================================================================
// 数据访问层（engine 层调用 dao/service 层）
// 封装 dao/chat.js 与 services/sessionLifecycle.js 的会话数据访问，供路由层
// 统一通过 engine/sessions/ 调用。engine/sessions/ 聚焦会话分类/ID/密钥等
// 领域逻辑，数据持久化与生命周期管理由 dao/service 层提供。
// ============================================================================
export {
  getSessions,
  searchSessions,
  createSession,
  getSessionMessages,
  deleteSession,
  moveSessionToFolder,
  updateSession,
  getSessionsPaged,
  searchSessionsPaged,
  getArchivedSessionsPaged,
  searchArchivedSessionsPaged,
  // dao/chat.js 与 sessionLifecycle.js 均导出 deleteArchivedSession，
  // 此处将 dao 版本别名导出以避免与下方 sessionLifecycle 版本冲突。
  deleteArchivedSession as daoDeleteArchivedSession,
} from '../../dao/chat.js';
export {
  getActiveSessions,
  getArchivedSessions,
  searchArchivedSessions,
  archiveSession,
  restoreSession,
  getSubSessions,
  createSubSession,
  getTodaySessions,
  deleteArchivedSession,
  touchSession,
  sessionLifecycleManager,
} from '../../services/sessionLifecycle.js';
