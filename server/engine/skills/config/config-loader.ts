import { logger } from "../../../logger.js";
import type { AgentSkillVisibility } from "../discovery/agent-filter.js";

export interface ClawHubConfig {
  url?: string;
  enabled: boolean;
}

export interface RemoteSyncNodeConfig {
  nodeId: string;
  nodeUrl: string;
  nodeName?: string;
  autoPull?: boolean;
}

export interface RemoteSyncConfig {
  enabled: boolean;
  intervalMs: number;
  nodes: RemoteSyncNodeConfig[];
}

export interface SecurityConfig {
  autoVerify: boolean;
  minScore: number;
  cacheTtlMs: number;
}

export interface AgentFilterConfig {
  defaultVisibility: AgentSkillVisibility;
}

export interface SkillConfig {
  clawhub: ClawHubConfig;
  snapshotIntervalMs: number;
  envOverrides: boolean;
  remoteSync: RemoteSyncConfig;
  security: SecurityConfig;
  agentFilter: AgentFilterConfig;
}

const DEFAULT_CONFIG: SkillConfig = {
  clawhub: {
    url: undefined,
    enabled: true,
  },
  snapshotIntervalMs: 300000,
  envOverrides: true,
  remoteSync: {
    enabled: false,
    intervalMs: 60000,
    nodes: [],
  },
  security: {
    autoVerify: true,
    minScore: 0.7,
    cacheTtlMs: 86400000,
  },
  agentFilter: {
    defaultVisibility: 'all',
  },
};

type ConfigChangeListener = (newConfig: SkillConfig, oldConfig: SkillConfig) => void;

let cachedConfig: SkillConfig = { ...DEFAULT_CONFIG };
const changeListeners = new Set<ConfigChangeListener>();
let isLoaded = false;

function mergeConfig(base: SkillConfig, override: Partial<SkillConfig>): SkillConfig {
  return {
    ...base,
    clawhub: {
      ...base.clawhub,
      ...override.clawhub,
    },
    snapshotIntervalMs: override.snapshotIntervalMs ?? base.snapshotIntervalMs,
    envOverrides: override.envOverrides ?? base.envOverrides,
    remoteSync: {
      ...base.remoteSync,
      ...override.remoteSync,
      nodes: override.remoteSync?.nodes ?? base.remoteSync.nodes,
    },
    security: {
      ...base.security,
      ...override.security,
    },
    agentFilter: {
      ...base.agentFilter,
      ...override.agentFilter,
    },
  };
}

export function loadSkillConfig(config?: Partial<SkillConfig>): SkillConfig {
  if (config) {
    cachedConfig = mergeConfig(DEFAULT_CONFIG, config);
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  isLoaded = true;
  logger.info('[SkillConfig] Loaded skill configuration', {
    clawhubEnabled: cachedConfig.clawhub.enabled,
    snapshotIntervalMs: cachedConfig.snapshotIntervalMs,
    envOverrides: cachedConfig.envOverrides,
    remoteSyncEnabled: cachedConfig.remoteSync.enabled,
    securityAutoVerify: cachedConfig.security.autoVerify,
    agentFilterDefaultVisibility: cachedConfig.agentFilter.defaultVisibility,
  });

  return { ...cachedConfig };
}

export function getSkillConfig(): SkillConfig {
  return { ...cachedConfig };
}

export function reloadSkillConfig(config?: Partial<SkillConfig>): SkillConfig {
  const oldConfig = { ...cachedConfig };

  if (config) {
    cachedConfig = mergeConfig(DEFAULT_CONFIG, config);
  } else {
    cachedConfig = { ...DEFAULT_CONFIG };
  }

  isLoaded = true;

  for (const listener of changeListeners) {
    try {
      listener(cachedConfig, oldConfig);
    } catch (err) {
      logger.error('[SkillConfig] Error calling change listener:', err);
    }
  }

  logger.info('[SkillConfig] Reloaded skill configuration', {
    clawhubEnabled: cachedConfig.clawhub.enabled,
    snapshotIntervalMs: cachedConfig.snapshotIntervalMs,
    remoteSyncEnabled: cachedConfig.remoteSync.enabled,
  });

  return { ...cachedConfig };
}

export function watchSkillConfig(listener: ConfigChangeListener): () => void {
  changeListeners.add(listener);
  logger.debug('[SkillConfig] Registered config change listener');

  return function unwatch() {
    changeListeners.delete(listener);
    logger.debug('[SkillConfig] Unregistered config change listener');
  };
}

export function isConfigLoaded(): boolean {
  return isLoaded;
}

export function getDefaultSkillConfig(): SkillConfig {
  return { ...DEFAULT_CONFIG };
}