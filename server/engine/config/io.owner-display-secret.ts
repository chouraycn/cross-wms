// 移植自 openclaw/src/config/io.owner-display-secret.ts
// 配置 IO 专用的运行时 owner display secret 保留逻辑。
// 生成的 secret 留在内存中按配置路径索引，从不写回配置文件。
import type { OpenClawConfig } from './types/openclaw.js';

/** 配置 IO 期间按配置路径索引的运行时 owner display secret。 */
export type OwnerDisplaySecretRuntimeState = {
  pendingByPath: Map<string, string>;
};

/** 将生成的 owner display secret 保留在内存中，不持久化到配置。 */
export function retainGeneratedOwnerDisplaySecret(params: {
  config: OpenClawConfig;
  configPath: string;
  generatedSecret?: string;
  state: OwnerDisplaySecretRuntimeState;
}): OpenClawConfig {
  const { config, configPath, generatedSecret, state } = params;
  if (!generatedSecret) {
    // 当前配置加载不再为该路径生成 secret 时，清除陈旧的 pending secret。
    state.pendingByPath.delete(configPath);
    return config;
  }

  // 保留生成的 secret 供运行时调用方使用，同时保留配置对象标识，
  // 避免将 secret 写回磁盘。
  state.pendingByPath.set(configPath, generatedSecret);
  return config;
}
