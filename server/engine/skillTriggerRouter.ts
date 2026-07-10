/**
 * SkillTriggerRouter — 服务端触发器路由
 *
 * 将 server 端 skillRegistry 中的 Skill 触发器（声明式 `triggers: string[]`）
 * 与三种高级触发器类型对接：
 *   - intent  : 意图触发器，借助已有的 MultilingualIntent 多语言意图识别
 *   - event   : 事件触发器，由系统事件（如 message.received）驱动
 *   - schedule: 定时触发器，枚举后交给 cron 调度器注册
 *
 * 约定（写在 Skill 的 triggers 字符串数组中）：
 *   - `intent:query`    → 当用户意图被识别为 query 时触发
 *   - `event:message.received` → 当系统发出 message.received 事件时触发
 *   - `schedule:0 9 * * *`     → 每天 09:00 由 cron 触发
 *
 * 该模块不修改 SkillDefinition 类型，也不侵入 skillRegistry 主流程，
 * 仅作为触发器匹配与 cron 注册之间的桥接层，便于测试与按需启用。
 */

import { MultilingualIntent } from './multilingualIntent.js';
import { skillRegistry } from './skillRegistry.js';
import type { RegisteredSkill } from '../types/skill-runtime.js';

export type StructuredTriggerType = 'intent' | 'event' | 'schedule' | 'keyword' | 'command';

export interface ParsedTrigger {
  type: StructuredTriggerType;
  value: string;
}

export interface SkillTriggerMatchResult {
  skillId: string;
  type: StructuredTriggerType;
  value: string;
  confidence: number;
}

export interface ScheduleJob {
  skillId: string;
  schedule: string;
}

/** 触发器字符串解析（约定前缀） */
export function parseTrigger(trigger: string): ParsedTrigger | null {
  const idx = trigger.indexOf(':');
  if (idx <= 0) return null;
  const prefix = trigger.slice(0, idx).toLowerCase();
  const value = trigger.slice(idx + 1).trim();
  if (!value) return null;
  switch (prefix) {
    case 'intent':
      return { type: 'intent', value };
    case 'event':
      return { type: 'event', value };
    case 'schedule':
      return { type: 'schedule', value };
    case 'keyword':
      return { type: 'keyword', value };
    case 'command':
      return { type: 'command', value };
    default:
      return null;
  }
}

export class SkillTriggerRouter {
  private intentEngine = new MultilingualIntent();
  private getSkills: () => RegisteredSkill[];

  constructor(getSkills: () => RegisteredSkill[] = () => skillRegistry.getAllSkills()) {
    this.getSkills = getSkills;
  }

  /** 识别文本意图，返回匹配 intent 触发器的 Skill 列表 */
  matchIntent(text: string): SkillTriggerMatchResult[] {
    const result = this.intentEngine.recognize(text);
    return this.matchIntentResults(result.intents);
  }

  /** 根据已识别的意图列表匹配 intent 触发器 */
  matchIntentResults(intents: string[]): SkillTriggerMatchResult[] {
    const intentSet = new Set(intents);
    const matches: SkillTriggerMatchResult[] = [];

    for (const skill of this.getSkills()) {
      if (skill.status !== 'enabled') continue;
      for (const t of skill.definition.triggers ?? []) {
        const parsed = parseTrigger(t);
        if (parsed?.type === 'intent' && intentSet.has(parsed.value)) {
          matches.push({
            skillId: skill.definition.id,
            type: 'intent',
            value: parsed.value,
            confidence: 0.85,
          });
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /** 匹配事件触发器（支持精确 / 通配符 `*` / 前缀通配 `message.*`） */
  matchEvent(eventName: string): SkillTriggerMatchResult[] {
    const matches: SkillTriggerMatchResult[] = [];

    for (const skill of this.getSkills()) {
      if (skill.status !== 'enabled') continue;
      for (const t of skill.definition.triggers ?? []) {
        const parsed = parseTrigger(t);
        if (parsed?.type === 'event' && eventMatches(parsed.value, eventName)) {
          matches.push({
            skillId: skill.definition.id,
            type: 'event',
            value: parsed.value,
            confidence: 1.0,
          });
        }
      }
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /** 枚举所有启用的定时触发器，供 cron 调度器注册 */
  getScheduleTriggers(): ScheduleJob[] {
    const result: ScheduleJob[] = [];

    for (const skill of this.getSkills()) {
      if (skill.status !== 'enabled') continue;
      for (const t of skill.definition.triggers ?? []) {
        const parsed = parseTrigger(t);
        if (parsed?.type === 'schedule') {
          result.push({ skillId: skill.definition.id, schedule: parsed.value });
        }
      }
    }

    return result;
  }

  /**
   * 将定时触发器注册到 cron 调度器。
   * @param register - 由调用方提供的注册函数（接收 skillId + cron 表达式）
   */
  registerSchedules(register: (job: ScheduleJob) => void): void {
    for (const job of this.getScheduleTriggers()) {
      try {
        register(job);
      } catch (e) {
        // 单个注册失败不影响其余
        // eslint-disable-next-line no-console
        console.warn(`[SkillTriggerRouter] 注册定时触发器失败 ${job.skillId}:`, e);
      }
    }
  }
}

/** 事件名匹配：精确 / 通配符 `*` / 前缀通配 `namespace.*` */
function eventMatches(pattern: string, eventName: string): boolean {
  if (pattern === eventName) return true;
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return eventName === prefix || eventName.startsWith(prefix + '.');
  }
  return false;
}

export const skillTriggerRouter = new SkillTriggerRouter();
