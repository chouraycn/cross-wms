// 移植自 openclaw/src/config/shell-env-expected-keys.ts
// 列出用于配置校验的预期 shell 环境键。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/string-normalization 的
// uniqueStrings，以及 ../secrets/channel-env-vars.js 的 listKnownChannelEnvVarNames
// 与 ../secrets/provider-env-vars.js 的 listKnownProviderAuthEnvVarNames。
// cross-wms 暂缺 secrets 模块，此处降级为仅返回核心键。

/** 内联降级实现：返回去重后的字符串数组。 */
function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/** 降级 stub：返回空数组（cross-wms 暂缺 provider env vars 模块）。 */
function listKnownProviderAuthEnvVarNames(_params: { env: NodeJS.ProcessEnv }): string[] {
  return [];
}

/** 降级 stub：返回空数组（cross-wms 暂缺 channel env vars 模块）。 */
function listKnownChannelEnvVarNames(_params: { env: NodeJS.ProcessEnv }): string[] {
  return [];
}

const CORE_SHELL_ENV_EXPECTED_KEYS = ['OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_GATEWAY_PASSWORD'];

/**
 * 列出值得为本次配置加载从 login-shell 回退导入的 env vars。
 *
 * Provider/channel 助手检查当前环境，因此可选的插件和 auth 别名仅在其配置键相关时触发 shell 探测。
 */
export function resolveShellEnvExpectedKeys(env: NodeJS.ProcessEnv): string[] {
  return uniqueStrings([
    ...listKnownProviderAuthEnvVarNames({ env }),
    ...listKnownChannelEnvVarNames({ env }),
    ...CORE_SHELL_ENV_EXPECTED_KEYS,
  ]);
}
