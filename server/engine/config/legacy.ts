import { logger } from '../../logger.js';

export type LegacyConfigResult = {
  migrated: boolean;
  oldKeys: string[];
  warnings: string[];
};

const LEGACY_KEY_MAP: Record<string, string> = {
  'gateway.sharedSecret': 'gateway.auth.token',
  'gateway.secret': 'gateway.auth.token',
  'models.defaultModel': 'models.default',
  'models.apiKey': 'models.providers.openai.apiKey',
  'plugins.dir': 'plugins.directories',
  'agent.timeout': 'agents.defaultTimeoutMs',
  'loglevel': 'logging.level',
};

export function detectLegacyConfig(config: Record<string, unknown>): string[] {
  const found: string[] = [];
  for (const oldKey of Object.keys(LEGACY_KEY_MAP)) {
    if (getNestedValue(config, oldKey) !== undefined) {
      found.push(oldKey);
    }
  }
  return found;
}

export function migrateLegacyConfig(config: Record<string, unknown>): LegacyConfigResult {
  const oldKeys = detectLegacyConfig(config);
  const warnings: string[] = [];

  for (const oldKey of oldKeys) {
    const newKey = LEGACY_KEY_MAP[oldKey];
    const value = getNestedValue(config, oldKey);
    if (value !== undefined) {
      setNestedValue(config, newKey, value);
      deleteNestedValue(config, oldKey);
      logger.info(`[Config] Migrated ${oldKey} → ${newKey}`);
      warnings.push(`Migrated ${oldKey} to ${newKey}`);
    }
  }

  return {
    migrated: oldKeys.length > 0,
    oldKeys,
    warnings,
  };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function deleteNestedValue(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') return;
    current = current[parts[i]] as Record<string, unknown>;
  }
  delete current[parts[parts.length - 1]];
}
