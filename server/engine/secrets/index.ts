/**
 * Secrets 模块 - 密钥管理
 */

export {
  resolveSecretRef,
  setSecret,
  removeSecret,
  resolveSecretRefs,
  validateSecretRef,
  initSecretsManager,
} from '../secretsManager.js';
export type { SecretRef, SecretValue, ResolvedSecret, SecretProvider } from '../secretsTypes.js';