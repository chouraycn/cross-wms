/**
 * security 模块统一导出
 *
 * - SecretStore: 凭证存取（AES-256-GCM 加密）
 * - SecretLifecycle: 凭证生命周期（过期 / 审计 / 清理）
 * - Redactor / redactText / redactObject: 内容级脱敏
 */

// 凭证存储
export {
  SecretStore,
  type SecretEntry,
  type SetSecretOptions,
  type ListFilter,
} from './secretStore.js';

// 生命周期
export {
  SecretLifecycle,
  type SecretAuditReport,
} from './secretLifecycle.js';

// 内容级脱敏
export {
  Redactor,
  redactor,
  redactText,
  redactObject,
} from './secretRedaction.js';
