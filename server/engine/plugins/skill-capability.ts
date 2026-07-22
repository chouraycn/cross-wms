/**
 * Skill 能力提供者 — 技能注册与执行能力
 *
 * 插件可注册自定义技能供 agent 调用。
 * 与 server/engine/skills/ 互补：
 * - skills/ 模块是宿主侧的技能系统（加载/校验/索引）
 * - 本文件提供插件 SDK 层的技能注册与调用接口，让插件可以暴露技能
 */

import type { CapabilityProvider } from './capability-provider.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { PluginCapabilityError } from './plugin-errors.js';

/** 技能元数据 */
export interface SkillMetadata {
  /** 技能 ID */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description?: string;
  /** 分类 */
  category?: string;
  /** 标签 */
  tags?: string[];
  /** 图标 */
  icon?: string;
  /** 触发词 */
  triggers?: string[];
  /** 输入参数 schema */
  inputSchema?: Record<string, unknown>;
  /** 输出 schema */
  outputSchema?: Record<string, unknown>;
  /** 是否需要确认 */
  requiresConfirmation?: boolean;
  /** 风险等级 */
  riskLevel?: 'low' | 'medium' | 'high';
}

/** 技能调用选项 */
export interface SkillInvokeOptions {
  /** 技能 ID */
  skillId: string;
  /** 输入参数 */
  input: Record<string, unknown>;
  /** 会话 ID */
  sessionId?: string;
  /** 用户 ID */
  userId?: string;
  /** 是否为试运行 */
  dryRun?: boolean;
  /** 超时（毫秒） */
  timeoutMs?: number;
}

/** 技能调用结果 */
export interface SkillInvokeResult {
  /** 是否成功 */
  ok: boolean;
  /** 输出数据 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
  /** 执行的步骤 */
  steps?: Array<{ name: string; status: 'success' | 'failed' | 'skipped'; detail?: string }>;
  /** 耗时（毫秒） */
  durationMs?: number;
  /** 产生的副作用说明 */
  sideEffects?: string[];
}

/** 技能能力提供者接口 */
export type SkillCapabilityProvider = CapabilityProvider<SkillInvokeOptions, SkillInvokeResult> & {
  /** 列出已注册的技能 */
  listSkills?(): SkillMetadata[];
  /** 获取技能元数据 */
  getSkill?(skillId: string): SkillMetadata | undefined;
  /** 校验技能输入 */
  validateInput?(skillId: string, input: Record<string, unknown>): { valid: boolean; errors?: string[] };
};

// ===================== 注册与调用 =====================

/** 注册 Skill 能力提供者 */
export function registerSkillProvider(
  pluginId: string,
  provider: SkillCapabilityProvider,
  metadata?: Record<string, unknown>,
): void {
  capabilityProviderRegistry.register(pluginId, provider, metadata);
}

/** 注销 Skill 能力提供者 */
export function unregisterSkillProvider(providerId: string): boolean {
  return capabilityProviderRegistry.unregister('skill', providerId);
}

/** 调用技能 */
export async function invokeSkill(
  providerId: string,
  options: SkillInvokeOptions,
): Promise<SkillInvokeResult> {
  const entry = capabilityProviderRegistry.find<SkillInvokeOptions, SkillInvokeResult>('skill', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到技能提供者: ${providerId}`, `skill:${providerId}`);
  }

  const startTime = Date.now();
  try {
    const result = await entry.provider.invoke(options);
    return {
      ...result,
      durationMs: result.durationMs ?? Date.now() - startTime,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

/** 列出技能提供者的所有技能 */
export function listSkills(providerId: string): SkillMetadata[] {
  const entry = capabilityProviderRegistry.find<SkillInvokeOptions, SkillInvokeResult>('skill', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到技能提供者: ${providerId}`, `skill:${providerId}`);
  }
  const provider = entry.provider as SkillCapabilityProvider;
  return provider.listSkills?.() ?? [];
}

/** 获取技能元数据 */
export function getSkillMetadata(providerId: string, skillId: string): SkillMetadata | undefined {
  const entry = capabilityProviderRegistry.find<SkillInvokeOptions, SkillInvokeResult>('skill', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到技能提供者: ${providerId}`, `skill:${providerId}`);
  }
  const provider = entry.provider as SkillCapabilityProvider;
  return provider.getSkill?.(skillId);
}

/** 校验技能输入 */
export function validateSkillInput(
  providerId: string,
  skillId: string,
  input: Record<string, unknown>,
): { valid: boolean; errors?: string[] } {
  const entry = capabilityProviderRegistry.find<SkillInvokeOptions, SkillInvokeResult>('skill', providerId);
  if (!entry) {
    throw new PluginCapabilityError(`未找到技能提供者: ${providerId}`, `skill:${providerId}`);
  }
  const provider = entry.provider as SkillCapabilityProvider;
  if (!provider.validateInput) {
    return { valid: true };
  }
  return provider.validateInput(skillId, input);
}

/** 列出所有 Skill 提供者 */
export function listSkillProviders() {
  return capabilityProviderRegistry.list('skill');
}

/** 列出所有提供者的全部技能 */
export function listAllSkills(): Array<{ providerId: string; pluginId: string; skills: SkillMetadata[] }> {
  const entries = capabilityProviderRegistry.list('skill');
  const result: Array<{ providerId: string; pluginId: string; skills: SkillMetadata[] }> = [];
  for (const entry of entries) {
    const provider = entry.provider as SkillCapabilityProvider;
    result.push({
      providerId: provider.id,
      pluginId: entry.pluginId,
      skills: provider.listSkills?.() ?? [],
    });
  }
  return result;
}

/** 创建 Skill 能力提供者 */
export function createSkillProvider(
  id: string,
  invokeFn: (options: SkillInvokeOptions) => Promise<SkillInvokeResult>,
  options: {
    displayName?: string;
    description?: string;
    listSkills?: () => SkillMetadata[];
    getSkill?: (skillId: string) => SkillMetadata | undefined;
    validateInput?: (skillId: string, input: Record<string, unknown>) => { valid: boolean; errors?: string[] };
    healthCheck?: () => Promise<{ ok: boolean; error?: string }>;
  } = {},
): SkillCapabilityProvider {
  const provider: SkillCapabilityProvider = {
    kind: 'skill',
    id,
    ...(options.displayName !== undefined ? { displayName: options.displayName } : {}),
    ...(options.description !== undefined ? { description: options.description } : {}),
    invoke: invokeFn,
    ...(options.listSkills ? { listSkills: options.listSkills } : {}),
    ...(options.getSkill ? { getSkill: options.getSkill } : {}),
    ...(options.validateInput ? { validateInput: options.validateInput } : {}),
    ...(options.healthCheck ? { healthCheck: options.healthCheck } : {}),
  };
  return provider;
}
