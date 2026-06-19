/**
 * Observer — 观察者引擎
 *
 * 在工具执行后观察结果，匹配预定义规则，生成反思提示，
 * 并决定是否建议重试或调整策略。
 *
 * 核心流程：
 * 1. observe() — 匹配规则 → 生成评估 → 生成反思提示
 * 2. generateReflectionHint() — 替换模板变量，截断到 200 字符
 * 3. shouldRetry() — 判断是否应该重试
 *
 * 错误容忍：Observer 内部错误 → console.error + 视为 success
 *
 * v4.0.0: ReAct + Planner 模块
 */

import { ObserverRule, OBSERVER_RULES, ObservationLevel } from './observerRules.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 观察评估结果 */
export interface ObservationAssessment {
  /** 观察级别 */
  level: ObservationLevel;
  /** 评估原因 */
  reason: string;
  /** 是否建议重试 */
  shouldRetry: boolean;
  /** 是否建议调整策略 */
  shouldAdjustStrategy: boolean;
  /** 策略调整建议 */
  strategyHint?: string;
  /** 最大重试次数 */
  maxRetries: number;
}

/** 单次观察结果 */
export interface Observation {
  /** 工具调用信息 */
  toolCall: { name: string; arguments: Record<string, unknown> };
  /** 工具执行结果文本 */
  result: string;
  /** 评估结果 */
  assessment: ObservationAssessment;
  /** 反思提示（可选） */
  reflectionHint?: string;
  /** 置信度评分 (1-10)（可选，v5.0 新增） */
  confidenceScore?: number;
  /** 元数据（可选，v5.1 新增：压缩信息等） */
  metadata?: Record<string, unknown>;
}

/** 观察者事件（用于 SSE 推送） */
export interface ObserverEvent {
  type: 'observer_reflection';
  toolName: string;
  level: ObservationLevel;
  hint: string;
  willRetry: boolean;
  retryIndex: number;
  maxRetries: number;
}

// ===================== Glob 匹配工具 =====================

/**
 * 简单 glob 模式匹配，仅支持 * 通配符。
 * 将 glob 模式转换为正则表达式进行匹配。
 *
 * 示例：
 * - db_* → /^db_.*$/
 * - file_readFile → /^file_readFile$/
 * - * → /^.*$/
 */
function globToRegex(pattern: string): RegExp {
  // 转义正则特殊字符（除了 *）
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * 检查工具名是否匹配 glob 模式
 */
function matchesPattern(toolName: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(toolName);
}

// ===================== RuleEngine =====================

/**
 * 规则引擎 — 负责匹配观察者规则
 */
class RuleEngine {
  private rules: ObserverRule[];

  constructor(rules: ObserverRule[]) {
    // 按 priority 升序排序（数字越小越优先）
    this.rules = [...rules].sort((a, b) => a.priority - b.priority);
  }

  /**
   * 匹配规则。返回按优先级排序的匹配规则列表。
   *
   * 匹配逻辑：
   * 1. toolNamePattern 必须匹配（glob 模式）
   * 2. 如果定义了 hasError，则结果文本必须包含 "error" 字段
   * 3. 如果定义了 resultPattern，则结果文本必须匹配该正则
   * 4. 如果定义了 resultContains，则结果文本必须包含其中任一关键词
   */
  match(toolName: string, result: string): ObserverRule[] {
    const matched: ObserverRule[] = [];

    for (const rule of this.rules) {
      const cond = rule.condition;

      // 1. toolNamePattern 必须匹配
      if (!matchesPattern(toolName, cond.toolNamePattern)) {
        continue;
      }

      // 2. hasError 检查：结果文本需包含 error 相关字段
      if (cond.hasError === true) {
        // 尝试解析 JSON 检查 error 字段，或检查文本中是否含 "error"
        const hasErrorField = result.includes('"error"') || result.includes('"error":');
        if (!hasErrorField) {
          continue;
        }
      } else if (cond.hasError === false) {
        // 明确要求无 error
        const hasErrorField = result.includes('"error"') || result.includes('"error":');
        if (hasErrorField) {
          continue;
        }
      }

      // 3. resultPattern 检查（正则匹配）
      if (cond.resultPattern) {
        try {
          const regex = new RegExp(cond.resultPattern, 'i');
          if (!regex.test(result)) {
            continue;
          }
        } catch {
          // 正则语法错误，跳过此规则
          continue;
        }
      }

      // 4. resultContains 检查（任一匹配即命中）
      if (cond.resultContains && cond.resultContains.length > 0) {
        const resultLower = result.toLowerCase();
        const hasMatch = cond.resultContains.some((keyword) =>
          resultLower.includes(keyword.toLowerCase())
        );
        if (!hasMatch) {
          continue;
        }
      }

      matched.push(rule);
    }

    return matched;
  }
}

// ===================== Observer =====================

/**
 * 观察者引擎 — 在工具执行后观察结果并生成反思
 */
export class Observer {
  private ruleEngine: RuleEngine;

  constructor(rules?: ObserverRule[]) {
    this.ruleEngine = new RuleEngine(rules ?? OBSERVER_RULES);
  }

  /**
   * 观察工具执行结果，生成观察评估和反思提示。
   *
   * 核心逻辑：
   * 1. 匹配规则 → 取优先级最高的规则
   * 2. 生成评估（ObservationAssessment）
   * 3. 生成反思提示（reflectionHint）
   *
   * 错误容忍：Observer 内部错误 → console.error + 视为 success
   */
  observe(
    toolCall: { name: string; arguments: Record<string, unknown> },
    result: string,
  ): Observation {
    try {
      // 匹配规则
      const matchedRules = this.ruleEngine.match(toolCall.name, result);

      // 无匹配规则 → 视为成功
      if (matchedRules.length === 0) {
        return {
          toolCall,
          result,
          assessment: {
            level: 'success',
            reason: '无匹配规则，视为成功',
            shouldRetry: false,
            shouldAdjustStrategy: false,
            maxRetries: 0,
          },
        };
      }

      // 取优先级最高的规则
      const topRule = matchedRules[0];

      // 提取错误信息用于模板替换
      const errorText = this.extractErrorText(result);

      // 生成评估
      const assessment: ObservationAssessment = {
        level: topRule.action.level,
        reason: topRule.description,
        shouldRetry: topRule.action.shouldRetry,
        shouldAdjustStrategy: topRule.action.shouldAdjustStrategy,
        maxRetries: topRule.action.maxRetries,
      };

      // 生成观察结果
      const observation: Observation = {
        toolCall,
        result,
        assessment,
      };

      // v5.0: 计算置信度评分
      if (assessment.level === 'success') {
        observation.confidenceScore = 9;
      } else if (assessment.level === 'warning') {
        observation.confidenceScore = 5;
      } else if (assessment.level === 'error' && assessment.shouldRetry) {
        observation.confidenceScore = 3;
      } else {
        observation.confidenceScore = 1;
      }

      // 生成反思提示
      observation.reflectionHint = this.generateReflectionHint(observation, errorText);

      return observation;
    } catch (err) {
      // 错误容忍：Observer 内部错误 → console.error + 视为 success
      logger.error('[Observer] observe() 内部错误:', err instanceof Error ? err.message : String(err));
      return {
        toolCall,
        result,
        assessment: {
          level: 'success',
          reason: `Observer 内部错误: ${err instanceof Error ? err.message : String(err)}`,
          shouldRetry: false,
          shouldAdjustStrategy: false,
          maxRetries: 0,
        },
      };
    }
  }

  /**
   * 生成反思提示。
   * 替换 hintTemplate 中的 {toolName}, {error} 变量，截断到 200 字符。
   */
  generateReflectionHint(observation: Observation, errorText?: string): string {
    try {
      const matchedRules = this.ruleEngine.match(observation.toolCall.name, observation.result);

      if (matchedRules.length === 0) {
        return '';
      }

      const topRule = matchedRules[0];
      const template = topRule.action.hintTemplate;

      const hint = template
        .replace(/\{toolName\}/g, observation.toolCall.name)
        .replace(/\{error\}/g, errorText ?? this.extractErrorText(observation.result));

      // 截断到 200 字符
      return hint.length > 200 ? hint.slice(0, 200) : hint;
    } catch (err) {
      logger.error('[Observer] generateReflectionHint() 错误:', err instanceof Error ? err.message : String(err));
      return '';
    }
  }

  /**
   * 判断是否应该重试。
   * 条件：assessment.shouldRetry && retryIndex < assessment.maxRetries
   */
  shouldRetry(observation: Observation, retryIndex: number): boolean {
    return observation.assessment.shouldRetry && retryIndex < observation.assessment.maxRetries;
  }

  /**
   * 从结果文本中提取错误信息。
   * 尝试解析 JSON 中的 error 字段，失败则取前 100 字符。
   */
  private extractErrorText(result: string): string {
    try {
      const parsed = JSON.parse(result);
      if (parsed.error) {
        const errorStr = String(parsed.error);
        return errorStr.length > 100 ? errorStr.slice(0, 100) : errorStr;
      }
    } catch {
      // 非 JSON 格式，取前 100 字符
    }
    // 非 JSON 或无 error 字段
    if (result.length <= 100) return result;
    return result.slice(0, 100);
  }
}
