/**
 * Config Manager
 * 配置管理系统 - 统一管理应用配置
 */

export type ConfigScope = "global" | "user" | "workspace" | "session";

export interface ConfigEntry<T = unknown> {
  key: string;
  value: T;
  scope: ConfigScope;
  type: string;
  description?: string;
  defaultValue: T;
  options?: T[];
  min?: number;
  max?: number;
  validator?: (value: T) => boolean;
  readonly?: boolean;
  tags?: string[];
  updatedAt: number;
}

export interface ConfigChangeEvent {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  scope: ConfigScope;
  timestamp: number;
}

type ConfigChangeListener = (event: ConfigChangeEvent) => void;

class ConfigManager {
  private readonly entries = new Map<string, ConfigEntry>();
  private readonly listeners = new Map<string, ConfigChangeListener[]>();
  private readonly globalListeners: ConfigChangeListener[] = [];

  constructor() {
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs(): void {
    const now = Date.now();

    const defaults: Array<Omit<ConfigEntry, "updatedAt">> = [
      // General
      {
        key: "general.language",
        value: "zh-CN",
        scope: "global",
        type: "string",
        description: "界面语言",
        defaultValue: "zh-CN",
        options: ["zh-CN", "en-US", "ja-JP"],
        tags: ["general", "ui"],
      },
      {
        key: "general.theme",
        value: "dark",
        scope: "global",
        type: "string",
        description: "主题模式",
        defaultValue: "dark",
        options: ["light", "dark", "system"],
        tags: ["general", "ui"],
      },

      // AI / Model
      {
        key: "ai.defaultModel",
        value: "deepseek-chat",
        scope: "global",
        type: "string",
        description: "默认模型",
        defaultValue: "deepseek-chat",
        tags: ["ai", "model"],
      },
      {
        key: "ai.defaultProvider",
        value: "deepseek",
        scope: "global",
        type: "string",
        description: "默认提供商",
        defaultValue: "deepseek",
        options: ["deepseek", "openai", "anthropic", "minimax"],
        tags: ["ai", "model"],
      },
      {
        key: "ai.temperature",
        value: 0.7,
        scope: "global",
        type: "number",
        description: "温度参数",
        defaultValue: 0.7,
        min: 0,
        max: 2,
        tags: ["ai", "model"],
      },
      {
        key: "ai.maxTokens",
        value: 4096,
        scope: "global",
        type: "number",
        description: "最大输出 Token 数",
        defaultValue: 4096,
        min: 256,
        max: 128000,
        tags: ["ai", "model"],
      },
      {
        key: "ai.thinkingMode",
        value: "auto",
        scope: "global",
        type: "string",
        description: "思考模式",
        defaultValue: "auto",
        options: ["on", "off", "auto"],
        tags: ["ai", "thinking"],
      },
      {
        key: "ai.fastMode",
        value: false,
        scope: "global",
        type: "boolean",
        description: "快速模式",
        defaultValue: false,
        tags: ["ai", "performance"],
      },

      // Memory
      {
        key: "memory.enabled",
        value: true,
        scope: "global",
        type: "boolean",
        description: "启用记忆功能",
        defaultValue: true,
        tags: ["memory"],
      },
      {
        key: "memory.maxContextMessages",
        value: 50,
        scope: "global",
        type: "number",
        description: "最大上下文消息数",
        defaultValue: 50,
        min: 5,
        max: 200,
        tags: ["memory", "context"],
      },
      {
        key: "memory.autoCompaction",
        value: true,
        scope: "global",
        type: "boolean",
        description: "自动压缩会话",
        defaultValue: true,
        tags: ["memory", "compaction"],
      },

      // Tools
      {
        key: "tools.autoApprove",
        value: false,
        scope: "global",
        type: "boolean",
        description: "自动批准工具调用",
        defaultValue: false,
        tags: ["tools", "security"],
      },
      {
        key: "tools.sandboxLevel",
        value: "medium",
        scope: "global",
        type: "string",
        description: "沙箱安全级别",
        defaultValue: "medium",
        options: ["none", "light", "medium", "strict"],
        tags: ["tools", "security", "sandbox"],
      },

      // Agent
      {
        key: "agent.default",
        value: "general",
        scope: "global",
        type: "string",
        description: "默认 Agent",
        defaultValue: "general",
        options: ["wms-expert", "wms-analyst", "wms-operator", "general", "debugger"],
        tags: ["agent"],
      },
      {
        key: "agent.maxSubagents",
        value: 3,
        scope: "global",
        type: "number",
        description: "最大子代理数量",
        defaultValue: 3,
        min: 1,
        max: 10,
        tags: ["agent", "subagent"],
      },

      // Performance
      {
        key: "performance.streamingEnabled",
        value: true,
        scope: "global",
        type: "boolean",
        description: "启用流式输出",
        defaultValue: true,
        tags: ["performance", "streaming"],
      },
      {
        key: "performance.requestTimeout",
        value: 120000,
        scope: "global",
        type: "number",
        description: "请求超时时间（毫秒）",
        defaultValue: 120000,
        min: 10000,
        max: 600000,
        tags: ["performance"],
      },

      // Notifications
      {
        key: "notifications.enabled",
        value: true,
        scope: "global",
        type: "boolean",
        description: "启用通知",
        defaultValue: true,
        tags: ["notifications"],
      },

      // Privacy
      {
        key: "privacy.collectAnalytics",
        value: false,
        scope: "global",
        type: "boolean",
        description: "收集使用数据",
        defaultValue: false,
        tags: ["privacy"],
      },
      {
        key: "privacy.rememberHistory",
        value: true,
        scope: "global",
        type: "boolean",
        description: "记住对话历史",
        defaultValue: true,
        tags: ["privacy", "memory"],
      },

      // WMS Specific
      {
        key: "wms.defaultWarehouse",
        value: "",
        scope: "global",
        type: "string",
        description: "默认仓库",
        defaultValue: "",
        tags: ["wms"],
      },
      {
        key: "wms.autoRefreshInterval",
        value: 30000,
        scope: "global",
        type: "number",
        description: "自动刷新间隔（毫秒）",
        defaultValue: 30000,
        min: 5000,
        max: 300000,
        tags: ["wms", "performance"],
      },
    ];

    for (const def of defaults) {
      this.entries.set(def.key, { ...def, updatedAt: now });
    }
  }

  // ========== Get / Set ==========

  get<T = unknown>(key: string): T | undefined {
    const entry = this.entries.get(key);
    return entry?.value as T;
  }

  getOrDefault<T = unknown>(key: string, defaultValue: T): T {
    const entry = this.entries.get(key);
    return (entry?.value as T) ?? defaultValue;
  }

  set(key: string, value: unknown, scope: ConfigScope = "global"): boolean {
    const entry = this.entries.get(key);
    const oldValue = entry?.value;

    if (entry?.readonly) {
      return false;
    }

    // 验证
    if (entry && !this.validateValue(entry, value)) {
      return false;
    }

    const updatedEntry: ConfigEntry = entry
      ? { ...entry, value, scope, updatedAt: Date.now() }
      : {
          key,
          value,
          scope,
          type: typeof value,
          defaultValue: value,
          updatedAt: Date.now(),
        };

    this.entries.set(key, updatedEntry);

    // 触发变更事件
    const event: ConfigChangeEvent = {
      key,
      oldValue,
      newValue: value,
      scope,
      timestamp: Date.now(),
    };

    this.notifyListeners(key, event);

    return true;
  }

  private validateValue(entry: ConfigEntry, value: unknown): boolean {
    if (entry.type === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) return false;
      if (entry.min !== undefined && value < entry.min) return false;
      if (entry.max !== undefined && value > entry.max) return false;
    }

    if (entry.type === "boolean" && typeof value !== "boolean") {
      return false;
    }

    if (entry.type === "string" && typeof value !== "string") {
      return false;
    }

    if (entry.options && !entry.options.includes(value)) {
      return false;
    }

    if (entry.validator && !entry.validator(value)) {
      return false;
    }

    return true;
  }

  // ========== Entry Management ==========

  register<T>(entry: Omit<ConfigEntry<T>, "updatedAt">): void {
    this.entries.set(entry.key, { ...entry, updatedAt: Date.now() } as ConfigEntry);
  }

  unregister(key: string): boolean {
    return this.entries.delete(key);
  }

  getEntry(key: string): ConfigEntry | undefined {
    return this.entries.get(key);
  }

  listEntries(options?: {
    scope?: ConfigScope;
    tag?: string;
    prefix?: string;
  }): ConfigEntry[] {
    let entries = Array.from(this.entries.values());

    if (options?.scope) {
      entries = entries.filter((e) => e.scope === options.scope);
    }
    if (options?.tag) {
      entries = entries.filter((e) => e.tags?.includes(options.tag!));
    }
    if (options?.prefix) {
      entries = entries.filter((e) => e.key.startsWith(options.prefix!));
    }

    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }

  // ========== Change Listeners ==========

  onChange(key: string, listener: ConfigChangeListener): () => void {
    let listeners = this.listeners.get(key);
    if (!listeners) {
      listeners = [];
      this.listeners.set(key, listeners);
    }
    listeners.push(listener);
    return () => {
      const ls = this.listeners.get(key);
      if (ls) {
        const idx = ls.indexOf(listener);
        if (idx >= 0) ls.splice(idx, 1);
      }
    };
  }

  onAnyChange(listener: ConfigChangeListener): () => void {
    this.globalListeners.push(listener);
    return () => {
      const idx = this.globalListeners.indexOf(listener);
      if (idx >= 0) this.globalListeners.splice(idx, 1);
    };
  }

  private notifyListeners(key: string, event: ConfigChangeEvent): void {
    const listeners = this.listeners.get(key);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (e) {
          console.error("[config] Listener error:", e);
        }
      }
    }

    for (const listener of this.globalListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("[config] Global listener error:", e);
      }
    }
  }

  // ========== Bulk Operations ==========

  getBulk(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (entry) {
        result[key] = entry.value;
      }
    }
    return result;
  }

  setBulk(values: Record<string, unknown>, scope: ConfigScope = "global"): {
    updated: string[];
    failed: string[];
  } {
    const updated: string[] = [];
    const failed: string[] = [];

    for (const [key, value] of Object.entries(values)) {
      if (this.set(key, value, scope)) {
        updated.push(key);
      } else {
        failed.push(key);
      }
    }

    return { updated, failed };
  }

  reset(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    return this.set(key, entry.defaultValue, entry.scope);
  }

  resetAll(scope?: ConfigScope): number {
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (!scope || entry.scope === scope) {
        if (this.reset(key)) count++;
      }
    }
    return count;
  }

  // ========== Import / Export ==========

  exportConfig(options?: {
    scope?: ConfigScope;
    includeDefaults?: boolean;
  }): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of this.entries) {
      if (options?.scope && entry.scope !== options.scope) continue;
      if (!options?.includeDefaults && entry.value === entry.defaultValue) continue;
      result[key] = entry.value;
    }
    return result;
  }

  importConfig(values: Record<string, unknown>, scope: ConfigScope = "global"): {
    updated: string[];
    failed: string[];
  } {
    return this.setBulk(values, scope);
  }

  // ========== Stats ==========

  getStats(): {
    totalEntries: number;
    byScope: Record<ConfigScope, number>;
    byTag: Record<string, number>;
  } {
    const byScope: Record<ConfigScope, number> = {
      global: 0,
      user: 0,
      workspace: 0,
      session: 0,
    };
    const byTag: Record<string, number> = {};

    for (const entry of this.entries.values()) {
      byScope[entry.scope]++;
      if (entry.tags) {
        for (const tag of entry.tags) {
          byTag[tag] = (byTag[tag] ?? 0) + 1;
        }
      }
    }

    return {
      totalEntries: this.entries.size,
      byScope,
      byTag,
    };
  }

  clear(): void {
    this.entries.clear();
    this.listeners.clear();
    this.globalListeners.length = 0;
  }
}

const CONFIG_INSTANCE = new ConfigManager();

export function getConfig(): ConfigManager {
  return CONFIG_INSTANCE;
}

export function getConfigValue<T = unknown>(key: string): T | undefined {
  return CONFIG_INSTANCE.get<T>(key);
}

export function setConfigValue(key: string, value: unknown): boolean {
  return CONFIG_INSTANCE.set(key, value);
}

export function resetConfigForTests(): void {
  CONFIG_INSTANCE.clear();
}

export type { ConfigManager };
