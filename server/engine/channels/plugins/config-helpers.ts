import { logger } from "../../../logger.js";
import type { ChannelId, AccountId, AppConfig, ChannelConfigAdapter } from "../../../channels/types.js";
import type { ChannelConfigSchema } from "../../../channels/plugin.js";

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigFieldMapping {
  sourceKey: string;
  targetKey: string;
  required?: boolean;
  transform?: (value: unknown) => unknown;
  validate?: (value: unknown) => string | null;
}

export function createSimpleConfigAdapter<TAccount extends Record<string, unknown>>(params: {
  configPath: string;
  accountsKey?: string;
  buildAccount?: (raw: Record<string, unknown>, accountId: string) => TAccount;
  isEnabled?: (account: TAccount, config: AppConfig) => boolean;
  isConfigured?: (account: TAccount, config: AppConfig) => boolean;
}): ChannelConfigAdapter<TAccount> {
  const accountsKey = params.accountsKey ?? "accounts";

  return {
    listAccountIds(config: AppConfig): AccountId[] {
      const channelConfig = getNestedValue(config, params.configPath) as Record<string, unknown> | undefined;
      const accounts = channelConfig?.[accountsKey] as Record<string, unknown> | undefined;
      if (!accounts) return [];
      return Object.keys(accounts);
    },

    resolveAccount(config: AppConfig, accountId: AccountId): TAccount | null {
      const channelConfig = getNestedValue(config, params.configPath) as Record<string, unknown> | undefined;
      const accounts = channelConfig?.[accountsKey] as Record<string, unknown> | undefined;
      const raw = accounts?.[accountId] as Record<string, unknown> | undefined;
      if (!raw) return null;
      if (params.buildAccount) {
        return params.buildAccount(raw, accountId);
      }
      return { ...raw, id: accountId } as unknown as TAccount;
    },

    isEnabled(account: TAccount, config: AppConfig): boolean {
      if (params.isEnabled) {
        return params.isEnabled(account, config);
      }
      return (account as unknown as Record<string, unknown>).enabled !== false;
    },

    isConfigured(account: TAccount, config: AppConfig): boolean {
      if (params.isConfigured) {
        return params.isConfigured(account, config);
      }
      return true;
    },
  };
}

export function validateConfig(
  config: AppConfig,
  schema?: ChannelConfigSchema
): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!schema) {
    return { valid: true, errors: [], warnings: ["No schema provided"] };
  }

  if (schema.type !== "object") {
    errors.push(`Expected object schema, got ${schema.type}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function applyConfigDefaults(
  config: AppConfig,
  defaults: Record<string, unknown>
): AppConfig {
  const result = { ...config };
  for (const [key, value] of Object.entries(defaults)) {
    if (result[key] === undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function mergeChannelConfig(
  base: AppConfig,
  override: Partial<AppConfig>
): AppConfig {
  return { ...base, ...override };
}

export function getChannelConfigValue(
  config: AppConfig,
  channelId: ChannelId,
  key: string
): unknown {
  const channelConfig = config[channelId] as Record<string, unknown> | undefined;
  return channelConfig?.[key];
}

export function setChannelConfigValue(
  config: AppConfig,
  channelId: ChannelId,
  key: string,
  value: unknown
): AppConfig {
  return {
    ...config,
    [channelId]: {
      ...(config[channelId] as Record<string, unknown> | undefined),
      [key]: value,
    },
  };
}

export function mapConfigFields(
  source: Record<string, unknown>,
  mappings: ConfigFieldMapping[]
): { result: Record<string, unknown>; errors: string[] } {
  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const mapping of mappings) {
    const value = source[mapping.sourceKey];

    if (value === undefined) {
      if (mapping.required) {
        errors.push(`Missing required field: ${mapping.sourceKey}`);
      }
      continue;
    }

    let transformed: unknown = value;
    if (mapping.transform) {
      try {
        transformed = mapping.transform(value);
      } catch (err) {
        errors.push(`Transform failed for ${mapping.sourceKey}: ${String(err)}`);
        continue;
      }
    }

    if (mapping.validate) {
      const error = mapping.validate(transformed);
      if (error) {
        errors.push(error);
        continue;
      }
    }

    result[mapping.targetKey] = transformed;
  }

  return { result, errors };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

export function logConfigIssues(channelId: ChannelId, result: ConfigValidationResult): void {
  if (result.errors.length > 0) {
    logger.error(`[Plugins:ConfigHelpers] ${channelId} config errors: ${result.errors.join(", ")}`);
  }
  if (result.warnings.length > 0) {
    logger.warn(`[Plugins:ConfigHelpers] ${channelId} config warnings: ${result.warnings.join(", ")}`);
  }
}
