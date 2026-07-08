/**
 * ACP Persistent Bindings
 * 持久绑定 - 持久化存储会话绑定和权限规则
 *
 * 参考 openclaw/src/acp/persistent-bindings 系列文件设计
 *
 * v3.0: 重构为模块化设计，类型定义在 persistentBindingsTypes.ts
 *                        解析逻辑在 persistentBindingsResolve.ts
 *                        生命周期管理在 persistentBindingsLifecycle.ts
 */

import * as fs from "fs";
import * as path from "path";
import type { SessionBinding } from "./sessionMapper.js";
import type { PolicyRule } from "./policy.js";
import type { PersistentBindingsConfig } from "./persistentBindingsTypes.js";

// 重新导出所有子模块的类型和函数，方便使用方统一导入
export * from "./persistentBindingsTypes.js";
export * from "./persistentBindingsResolve.js";
export {
  ensureConfiguredAcpBindingSession,
  ensureConfiguredAcpBindingSessions,
  syncConfiguredAcpBindingSession,
  removeConfiguredAcpBindingSession,
  type AcpSessionManagerLike,
  type BindingLifecycleConfig,
} from "./persistentBindingsLifecycle.js";

/**
 * 持久化绑定管理器
 * 负责将 session bindings 和 policy rules 持久化到磁盘
 */
export class PersistentBindings {
  private configPath: string;
  private config: PersistentBindingsConfig;
  private lastSaveTime = 0;
  private saveInterval = 5000;

  constructor(configDir: string) {
    this.configPath = path.join(configDir, "acp-bindings.json");
    this.config = this.load();
    this.startAutoSave();
  }

  private load(): PersistentBindingsConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, "utf-8");
        return JSON.parse(content);
      }
    } catch {
      // Ignore parse errors
    }

    return {
      bindings: [],
      rules: [],
    };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      this.lastSaveTime = Date.now();
    } catch {
      // Ignore save errors
    }
  }

  private startAutoSave(): void {
    setInterval(() => {
      if (Date.now() - this.lastSaveTime > this.saveInterval) {
        this.save();
      }
    }, this.saveInterval);
  }

  saveBinding(binding: SessionBinding): void {
    const index = this.config.bindings.findIndex(b => b.sessionId === binding.sessionId);
    if (index >= 0) {
      this.config.bindings[index] = binding;
    } else {
      this.config.bindings.push(binding);
    }
    this.save();
  }

  loadBinding(sessionId: string): SessionBinding | undefined {
    return this.config.bindings.find(b => b.sessionId === sessionId);
  }

  deleteBinding(sessionId: string): void {
    this.config.bindings = this.config.bindings.filter(b => b.sessionId !== sessionId);
    this.save();
  }

  getAllBindings(): SessionBinding[] {
    return [...this.config.bindings];
  }

  saveRule(rule: PolicyRule): void {
    const index = this.config.rules.findIndex(r => r.id === rule.id);
    if (index >= 0) {
      this.config.rules[index] = rule;
    } else {
      this.config.rules.push(rule);
    }
    this.save();
  }

  loadRule(ruleId: string): PolicyRule | undefined {
    return this.config.rules.find(r => r.id === ruleId);
  }

  deleteRule(ruleId: string): void {
    this.config.rules = this.config.rules.filter(r => r.id !== ruleId);
    this.save();
  }

  getAllRules(): PolicyRule[] {
    return [...this.config.rules];
  }

  clear(): void {
    this.config = {
      bindings: [],
      rules: [],
    };
    this.save();
  }

  getStats(): {
    bindings: number;
    rules: number;
    configPath: string;
  } {
    return {
      bindings: this.config.bindings.length,
      rules: this.config.rules.length,
      configPath: this.configPath,
    };
  }

  flush(): void {
    this.save();
  }
}

let persistentBindingsInstance: PersistentBindings | null = null;

export function getPersistentBindings(configDir: string = "./config"): PersistentBindings {
  if (!persistentBindingsInstance) {
    persistentBindingsInstance = new PersistentBindings(configDir);
  }
  return persistentBindingsInstance;
}
