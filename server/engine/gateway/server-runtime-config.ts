import { logger } from '../../logger.js';

export type RuntimeConfig = {
  port: number;
  host: string;
  auth: {
    mode: string;
    token?: string;
    password?: string;
    trustedProxies: string[];
  };
  maxConnections: number;
  requestTimeoutMs: number;
  cors: {
    enabled: boolean;
    origins: string[];
    credentials: boolean;
  };
  rateLimit: {
    enabled: boolean;
    maxRequests: number;
    windowMs: number;
  };
  logging: {
    level: string;
    requestLog: boolean;
    slowRequestThresholdMs: number;
  };
  features: Record<string, boolean>;
  plugins: {
    autoLoad: boolean;
    pluginDir: string;
  };
  sessions: {
    maxSessions: number;
    maxAgeMs: number;
    compactionThreshold: number;
  };
  extensions: Record<string, unknown>;
};

const defaultConfig: RuntimeConfig = {
  port: 3000,
  host: '127.0.0.1',
  auth: {
    mode: 'none',
    trustedProxies: [],
  },
  maxConnections: 1000,
  requestTimeoutMs: 30000,
  cors: {
    enabled: false,
    origins: [],
    credentials: false,
  },
  rateLimit: {
    enabled: false,
    maxRequests: 100,
    windowMs: 60000,
  },
  logging: {
    level: 'info',
    requestLog: true,
    slowRequestThresholdMs: 1000,
  },
  features: {},
  plugins: {
    autoLoad: true,
    pluginDir: './plugins',
  },
  sessions: {
    maxSessions: 100,
    maxAgeMs: 86400000,
    compactionThreshold: 100,
  },
  extensions: {},
};

let runtimeConfig: RuntimeConfig = { ...defaultConfig };
const configListeners = new Set<(config: RuntimeConfig) => void>();

export function getRuntimeConfig(): Readonly<RuntimeConfig> {
  return runtimeConfig;
}

export function setRuntimeConfig(config: Partial<RuntimeConfig>): RuntimeConfig {
  const previous = { ...runtimeConfig };
  runtimeConfig = {
    ...defaultConfig,
    ...runtimeConfig,
    ...config,
    auth: {
      ...defaultConfig.auth,
      ...runtimeConfig.auth,
      ...config.auth,
    },
    cors: {
      ...defaultConfig.cors,
      ...runtimeConfig.cors,
      ...config.cors,
    },
    rateLimit: {
      ...defaultConfig.rateLimit,
      ...runtimeConfig.rateLimit,
      ...config.rateLimit,
    },
    logging: {
      ...defaultConfig.logging,
      ...runtimeConfig.logging,
      ...config.logging,
    },
    plugins: {
      ...defaultConfig.plugins,
      ...runtimeConfig.plugins,
      ...config.plugins,
    },
    sessions: {
      ...defaultConfig.sessions,
      ...runtimeConfig.sessions,
      ...config.sessions,
    },
    extensions: {
      ...defaultConfig.extensions,
      ...runtimeConfig.extensions,
      ...config.extensions,
    },
    features: {
      ...defaultConfig.features,
      ...runtimeConfig.features,
      ...config.features,
    },
  };

  logger.debug('[Gateway] Runtime config updated');

  for (const listener of configListeners) {
    try {
      listener(runtimeConfig);
    } catch (err) {
      logger.error('[Gateway] Config listener error:', err);
    }
  }

  return runtimeConfig;
}

export function updateRuntimeConfig(path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = runtimeConfig as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const lastKey = keys[keys.length - 1];
  current[lastKey] = value;

  logger.debug(`[Gateway] Runtime config updated: ${path}`);

  for (const listener of configListeners) {
    try {
      listener(runtimeConfig);
    } catch (err) {
      logger.error('[Gateway] Config listener error:', err);
    }
  }
}

export function getConfigValue(path: string): unknown {
  const keys = path.split('.');
  let current: unknown = runtimeConfig;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

export function isFeatureEnabled(featureName: string): boolean {
  return runtimeConfig.features[featureName] ?? false;
}

export function enableFeature(featureName: string): void {
  runtimeConfig.features[featureName] = true;
  logger.debug(`[Gateway] Feature enabled: ${featureName}`);
}

export function disableFeature(featureName: string): void {
  runtimeConfig.features[featureName] = false;
  logger.debug(`[Gateway] Feature disabled: ${featureName}`);
}

export function registerConfigListener(listener: (config: RuntimeConfig) => void): void {
  configListeners.add(listener);
}

export function unregisterConfigListener(listener: (config: RuntimeConfig) => void): boolean {
  return configListeners.delete(listener);
}

export function resetRuntimeConfig(): void {
  runtimeConfig = { ...defaultConfig };
  logger.info('[Gateway] Runtime config reset to defaults');
}

export function getDefaultRuntimeConfig(): Readonly<RuntimeConfig> {
  return { ...defaultConfig };
}
