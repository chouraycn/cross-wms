import EventEmitter from 'eventemitter3';
import type {
  SkillDefinition,
  SkillHandler,
  SkillLifecycle,
  SkillStatus,
  RegisteredSkill,
  SkillContext,
  SkillResult,
  SkillTriggerMatch,
} from './types';

export interface SkillRegistryEvents {
  skill_registered: [skill: RegisteredSkill];
  skill_unregistered: [skillId: string];
  skill_enabled: [skillId: string];
  skill_disabled: [skillId: string];
  skill_executed: [skillId: string, result: SkillResult];
  skill_error: [skillId: string, error: Error];
  registry_cleared: [];
}

export class SkillRegistry extends EventEmitter<SkillRegistryEvents> {
  private skills: Map<string, RegisteredSkill> = new Map();
  private executionHistory: Array<{
    skillId: string;
    timestamp: number;
    duration: number;
    success: boolean;
  }> = [];
  private maxHistorySize = 1000;

  registerSkill(
    definition: SkillDefinition,
    handler: SkillHandler,
    lifecycle?: SkillLifecycle,
    source?: string,
  ): RegisteredSkill {
    if (this.skills.has(definition.id)) {
      throw new Error(`Skill ${definition.id} already registered`);
    }

    const registered: RegisteredSkill = {
      definition,
      handler,
      lifecycle,
      status: 'registered',
      registeredAt: Date.now(),
      source,
      version: definition.version,
      usageCount: 0,
    };

    this.skills.set(definition.id, registered);
    this.emit('skill_registered', registered);
    return registered;
  }

  unregisterSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    if (skill.lifecycle?.onUnload) {
      try {
        skill.lifecycle.onUnload(this.createContext(skill));
      } catch {
      }
    }

    const existed = this.skills.delete(skillId);
    if (existed) {
      this.emit('skill_unregistered', skillId);
    }
    return existed;
  }

  enableSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    skill.status = 'enabled';
    skill.enabledAt = Date.now();

    if (skill.lifecycle?.onEnable) {
      try {
        skill.lifecycle.onEnable(this.createContext(skill));
      } catch (error) {
        skill.status = 'error';
        skill.errorMessage = (error as Error).message;
        this.emit('skill_error', skillId, error as Error);
        return false;
      }
    }

    this.emit('skill_enabled', skillId);
    return true;
  }

  disableSkill(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    if (skill.lifecycle?.onDisable) {
      try {
        skill.lifecycle.onDisable(this.createContext(skill));
      } catch {
      }
    }

    skill.status = 'disabled';
    this.emit('skill_disabled', skillId);
    return true;
  }

  getSkill(skillId: string): RegisteredSkill | undefined {
    return this.skills.get(skillId);
  }

  listSkills(options?: {
    status?: SkillStatus;
    category?: string;
    type?: string;
    tags?: string[];
  }): RegisteredSkill[] {
    let results = Array.from(this.skills.values());

    if (options?.status) {
      results = results.filter((s) => s.status === options.status);
    }

    if (options?.category) {
      results = results.filter((s) => s.definition.category === options.category);
    }

    if (options?.type) {
      results = results.filter((s) => s.definition.type === options.type);
    }

    if (options?.tags && options.tags.length > 0) {
      results = results.filter((s) =>
        options.tags!.some((tag) => s.definition.tags?.includes(tag)),
      );
    }

    return results;
  }

  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  async executeSkill(
    skillId: string,
    params: Record<string, unknown>,
    context: Partial<SkillContext> = {},
  ): Promise<SkillResult> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, error: `Skill ${skillId} not found` };
    }

    if (skill.status !== 'enabled' && skill.status !== 'registered') {
      return { success: false, error: `Skill ${skillId} is not enabled (status: ${skill.status})` };
    }

    const fullContext = {
      ...this.createContext(skill),
      ...context,
    };

    const startTime = Date.now();

    try {
      const result = await skill.handler(params, fullContext);

      const duration = Date.now() - startTime;
      skill.usageCount = (skill.usageCount || 0) + 1;
      skill.lastUsedAt = Date.now();

      this.recordExecution(skillId, duration, result.success);
      this.emit('skill_executed', skillId, result);

      return {
        ...result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordExecution(skillId, duration, false);
      this.emit('skill_error', skillId, error as Error);

      return {
        success: false,
        error: (error as Error).message,
        duration,
      };
    }
  }

  private createContext(skill: RegisteredSkill): SkillContext {
    return {
      skillId: skill.definition.id,
      sessionId: 'system',
      config: skill.definition.defaultConfig || {},
      permissions: skill.definition.permissions?.map((p) => p.name) || [],
      logger: {
        debug: (...args: unknown[]) => console.debug(`[skill:${skill.definition.id}]`, ...args),
        info: (...args: unknown[]) => console.info(`[skill:${skill.definition.id}]`, ...args),
        warn: (...args: unknown[]) => console.warn(`[skill:${skill.definition.id}]`, ...args),
        error: (...args: unknown[]) => console.error(`[skill:${skill.definition.id}]`, ...args),
      },
      variables: {},
      invokeSkill: (id, params) => this.executeSkill(id, params),
      getMemory: async () => undefined,
      setMemory: async () => {},
    };
  }

  matchTriggers(input: string): SkillTriggerMatch[] {
    const matches: SkillTriggerMatch[] = [];

    for (const skill of this.skills.values()) {
      if (skill.status !== 'enabled') continue;

      for (const trigger of skill.definition.triggers) {
        let confidence = 0;
        let matchedText: string | undefined;
        const extractedParams: Record<string, unknown> = {};

        switch (trigger.type) {
          case 'keyword':
            if (trigger.keywords?.length) {
              const lowerInput = input.toLowerCase();
              const matchedKeywords = trigger.keywords.filter((k) =>
                lowerInput.includes(k.toLowerCase()),
              );
              if (matchedKeywords.length > 0) {
                confidence = matchedKeywords.length / trigger.keywords.length;
                matchedText = matchedKeywords.join(', ');
              }
            }
            break;

          case 'regex':
            if (trigger.pattern) {
              try {
                const regex = new RegExp(trigger.pattern, 'i');
                const match = input.match(regex);
                if (match) {
                  confidence = 0.9;
                  matchedText = match[0];
                  if (match.groups) {
                    Object.assign(extractedParams, match.groups);
                  }
                }
              } catch {
              }
            }
            break;

          case 'command':
            if (trigger.command && input.startsWith(`/${trigger.command}`)) {
              confidence = 1.0;
              matchedText = trigger.command;
            }
            break;
        }

        if (confidence > 0) {
          matches.push({
            skillId: skill.definition.id,
            trigger,
            confidence,
            matchedText,
            extractedParams: Object.keys(extractedParams).length > 0 ? extractedParams : undefined,
          });
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  private recordExecution(skillId: string, duration: number, success: boolean): void {
    this.executionHistory.push({
      skillId,
      timestamp: Date.now(),
      duration,
      success,
    });

    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  getExecutionHistory(skillId?: string): typeof this.executionHistory {
    if (skillId) {
      return this.executionHistory.filter((h) => h.skillId === skillId);
    }
    return [...this.executionHistory];
  }

  getSkillStats(skillId: string): {
    totalExecutions: number;
    successRate: number;
    averageDuration: number;
    lastUsedAt?: number;
  } {
    const history = this.executionHistory.filter((h) => h.skillId === skillId);
    const totalExecutions = history.length;
    const successful = history.filter((h) => h.success).length;
    const successRate = totalExecutions > 0 ? successful / totalExecutions : 0;
    const averageDuration =
      totalExecutions > 0
        ? history.reduce((sum, h) => sum + h.duration, 0) / totalExecutions
        : 0;
    const lastUsedAt = history.length > 0 ? history[history.length - 1].timestamp : undefined;

    return { totalExecutions, successRate, averageDuration, lastUsedAt };
  }

  size(): number {
    return this.skills.size;
  }

  clear(): void {
    this.skills.clear();
    this.executionHistory = [];
    this.emit('registry_cleared');
  }
}

export const skillRegistry = new SkillRegistry();
