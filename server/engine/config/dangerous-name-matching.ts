// 移植自 openclaw/src/config/dangerous-name-matching.ts
// 检测由校验和告警使用的危险配置名。
//
// 调整说明：
// 1. 源文件依赖 ../utils/boolean.js 的 asBoolean。cross-wms 该函数位于
//    ../infra/boolean-coerce.js。
// 2. 源文件依赖 ./config.js 的 OpenClawConfig 类型。cross-wms 该类型位于
//    ./types/openclaw.js。
import { asBoolean } from '../infra/boolean-coerce.js';
import type { OpenClawConfig } from './types/openclaw.js';

type DangerousNameMatchingConfig = {
  dangerouslyAllowNameMatching?: boolean;
};

type ProviderDangerousNameMatchingScope = {
  prefix: string;
  account: Record<string, unknown>;
  dangerousNameMatchingEnabled: boolean;
  dangerousFlagPath: string;
};

type DangerousNameMatchingResolverInput = {
  providerConfig?: DangerousNameMatchingConfig | null | undefined;
  accountConfig?: DangerousNameMatchingConfig | null | undefined;
};

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** 仅当显式启用危险名称匹配开关时返回 true。 */
export function isDangerousNameMatchingEnabled(
  config: DangerousNameMatchingConfig | null | undefined,
): boolean {
  return config?.dangerouslyAllowNameMatching === true;
}

/** 解析账户级别的危险名称匹配，未设置时继承 provider 开关。 */
export function resolveDangerousNameMatchingEnabled(
  input: DangerousNameMatchingResolverInput,
): boolean {
  if (typeof input.accountConfig?.dangerouslyAllowNameMatching === 'boolean') {
    return input.accountConfig.dangerouslyAllowNameMatching;
  }
  return isDangerousNameMatchingEnabled(input.providerConfig);
}

/** 收集 policy 和 doctor 表面可审计的 provider/account 作用域。 */
export function collectProviderDangerousNameMatchingScopes(
  cfg: OpenClawConfig,
  provider: string,
): ProviderDangerousNameMatchingScope[] {
  const scopes: ProviderDangerousNameMatchingScope[] = [];
  const channels = asObjectRecord(cfg.channels);
  if (!channels) {
    return scopes;
  }

  const providerCfg = asObjectRecord(channels[provider]);
  if (!providerCfg) {
    return scopes;
  }

  const providerPrefix = `channels.${provider}`;
  const providerDangerousFlagPath = `${providerPrefix}.dangerouslyAllowNameMatching`;
  const providerDangerousNameMatchingEnabled = isDangerousNameMatchingEnabled(providerCfg);

  scopes.push({
    prefix: providerPrefix,
    account: providerCfg,
    dangerousNameMatchingEnabled: providerDangerousNameMatchingEnabled,
    dangerousFlagPath: providerDangerousFlagPath,
  });

  const accounts = asObjectRecord(providerCfg.accounts);
  if (!accounts) {
    return scopes;
  }

  for (const key of Object.keys(accounts)) {
    const account = asObjectRecord(accounts[key]);
    if (!account) {
      continue;
    }

    const accountPrefix = `${providerPrefix}.accounts.${key}`;
    const accountDangerousNameMatching = asBoolean(account.dangerouslyAllowNameMatching);

    scopes.push({
      prefix: accountPrefix,
      account,
      // 账户配置可覆盖 provider 开关；nullish 表示继承 provider 状态。
      dangerousNameMatchingEnabled:
        accountDangerousNameMatching ?? providerDangerousNameMatchingEnabled,
      dangerousFlagPath:
        accountDangerousNameMatching == null
          ? providerDangerousFlagPath
          : `${accountPrefix}.dangerouslyAllowNameMatching`,
    });
  }

  return scopes;
}
