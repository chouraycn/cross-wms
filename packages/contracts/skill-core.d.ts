/**
 * @cdf-know/skill-core STABLE API 契约声明
 *
 * 本文件定义了 @cdf-know/skill-core 包中所有 STABLE 等级公共 API 的
 * 类型契约。任何 STABLE API 的移除或签名变更均视为破坏性变更。
 *
 * 仅供契约检查脚本使用，不应被其他包直接导入。
 */

// ── 核心类型 ──

export type SkillType = string;
export type SkillTriggerType = string;
export type SkillStatus = string;
export type SkillScope = string;

export interface SkillTrigger {
  type: SkillTriggerType;
  pattern?: string;
  priority?: number;
}

export interface DetectedIntent {
  trigger: SkillTrigger;
  confidence: number;
  params?: Record<string, unknown>;
}

export interface SkillDefinition {
  id: string;
  name: string;
  type: SkillType;
  triggers: SkillTrigger[];
  handler: SkillHandler;
  scope?: SkillScope;
  description?: string;
  permissions?: SkillPermission[];
  configSchema?: SkillConfigSchema;
}

export interface SkillContext {
  skillId: string;
  intent: DetectedIntent;
  params: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export type SkillHandler = (context: SkillContext) => SkillResult | Promise<SkillResult>;

export interface SkillLifecycle {
  onLoad?: () => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onUnload?: () => void;
}

export interface RegisteredSkill {
  definition: SkillDefinition;
  status: SkillStatus;
  lifecycle?: SkillLifecycle;
}

export interface SkillExecutionRecord {
  skillId: string;
  timestamp: number;
  result: SkillResult;
  duration?: number;
}

export interface SkillPermission {
  resource: string;
  action: string;
}

export interface SkillConfigSchema {
  type?: string;
  properties?: Record<string, unknown>;
}

// ── 事件类型 ──

export interface SkillRegistryEvents {
  [key: string]: unknown;
}

// ── 核心类 ──

export declare class SkillRegistry {
  registerSkill(definition: SkillDefinition, lifecycle?: SkillLifecycle): void;
  unregisterSkill(skillId: string): void;
  enableSkill(skillId: string): void;
  disableSkill(skillId: string): void;
  getSkill(skillId: string): RegisteredSkill | undefined;
  listSkills(): RegisteredSkill[];
  hasSkill(skillId: string): boolean;
  executeSkill(skillId: string, context: SkillContext): Promise<SkillResult>;
  matchTriggers(intent: string, options?: unknown): DetectedIntent[];
  matchEventTriggers(event: unknown): DetectedIntent[];
  getScheduleTriggers(): unknown[];
  getExecutionHistory(skillId?: string): SkillExecutionRecord[];
  getSkillStats(): Record<string, unknown>;
  size(): number;
  clear(): void;
}

// ── 单例 ──

export declare const skillRegistry: SkillRegistry;
