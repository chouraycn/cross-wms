/**
 * Skill Plugin Bridge — Skill 系统与 Plugin SDK 桥接层
 *
 * 将现有的 skill 系统（skillRegistry / skillDiscovery / skillVersionTracker / skillSecurityScanner）
 * 与 P0-1 建立的 Plugin SDK 连接，实现：
 *
 * 1. 插件化 skill 发现 — skill 可通过 definePluginEntry() 声明为 Plugin SDK 工具能力
 * 2. 版本管理对齐 — skill 的 promptVersion 映射到 Plugin SDK 的 configSchema version
 * 3. 安全扫描集成 — skill 注册到 Plugin SDK 时自动触发安全扫描
 *
 * 桥接策略：
 *   - 不替换现有 skill 系统，而是在其之上添加 Plugin SDK 兼容层
 *   - 现有 skillRegistry 继续作为 skill 的权威注册中心
 *   - Plugin SDK 的 UnifiedPluginRegistry 通过本桥接层发现 skill 工具
 *
 * 用法：
 * ```ts
 * import { registerSkillAsPlugin } from './skillPluginBridge';
 *
 * // 将已注册的 skill 包装为 Plugin SDK 定义并注册
 * await registerSkillAsPlugin('my-skill-id');
 * ```
 */

import { logger } from '../logger.js';
import { definePluginEntry, getUnifiedPluginRegistry } from '@cross-wms/plugin-sdk';
import { skillRegistry } from './skillRegistry.js';
import { skillSecurityScanner } from './skillSecurityScanner.js';
import { skillVersionTracker } from './skillVersionTracker.js';
import type { RegisteredSkill } from '../types/skill-runtime.js';
import type { PluginToolCapability, PluginConfigSchema } from '@cross-wms/plugin-sdk';

// ===================== 类型定义 =====================

/** Skill 插件桥接配置 */
export interface SkillPluginBridgeOptions {
  /** 是否在注册前自动执行安全扫描（默认 true） */
  autoSecurityScan?: boolean;
  /** 安全扫描不通过时是否阻止注册（默认 true） */
  blockOnSecurityFail?: boolean;
  /** 是否自动激活（默认 true） */
  autoActivate?: boolean;
}

/** 桥接注册结果 */
export interface SkillPluginBridgeResult {
  success: boolean;
  skillId: string;
  pluginId: string;
  securityScanPassed: boolean;
  activated: boolean;
  error?: string;
}

// ===================== 核心桥接函数 =====================

/**
 * 将已注册的 skill 包装为 Plugin SDK 定义并注册到 UnifiedPluginRegistry
 *
 * @param skillId - skill ID（必须在 skillRegistry 中已注册）
 * @param options - 桥接选项
 * @returns 桥接结果
 */
export async function registerSkillAsPlugin(
  skillId: string,
  options: SkillPluginBridgeOptions = {},
): Promise<SkillPluginBridgeResult> {
  const {
    autoSecurityScan = true,
    blockOnSecurityFail = true,
    autoActivate = true,
  } = options;

  const pluginId = `skill-${skillId}`;

  // 1. 从 skillRegistry 获取 skill
  const skill = skillRegistry.get(skillId);
  if (!skill) {
    return {
      success: false,
      skillId,
      pluginId,
      securityScanPassed: false,
      activated: false,
      error: `Skill not found in registry: ${skillId}`,
    };
  }

  // 2. 安全扫描（如果启用）
  let securityScanPassed = true;
  if (autoSecurityScan) {
    try {
      const scanResult = skillSecurityScanner.scanSkill(skill.definition);
      securityScanPassed = scanResult.passed;

      if (!scanResult.passed) {
        const highRisks = scanResult.findings.filter(
          (f) => f.level === 'high' || f.level === 'critical',
        );
        logger.warn(
          `[SkillPluginBridge] Security scan failed for ${skillId}: ${highRisks.length} high/critical findings`,
        );

        if (blockOnSecurityFail) {
          return {
            success: false,
            skillId,
            pluginId,
            securityScanPassed: false,
            activated: false,
            error: `Security scan blocked registration: ${highRisks.map((f) => f.description).join('; ')}`,
          };
        }
      }
    } catch (err) {
      logger.error(`[SkillPluginBridge] Security scan error for ${skillId}:`, err);
      securityScanPassed = false;
      if (blockOnSecurityFail) {
        return {
          success: false,
          skillId,
          pluginId,
          securityScanPassed: false,
          activated: false,
          error: `Security scan error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  // 3. 获取版本信息
  const versionInfo = skillVersionTracker.getVersionInfo(skillId);

  // 4. 构建 Plugin SDK 定义
  const configSchema = buildSkillConfigSchema(skill);

  const definition = definePluginEntry({
    id: pluginId,
    name: skill.definition.name,
    description: skill.definition.description ?? `Skill: ${skill.definition.name}`,
    configSchema,
    register: (api) => {
      // 将 skill 注册为 Plugin SDK 工具能力
      const toolCap: PluginToolCapability = {
        kind: 'tool',
        name: skill.definition.id,
        description: skill.definition.description ?? `Execute skill: ${skill.definition.name}`,
        parameters: skill.definition.parameters ?? {
          type: 'object',
          properties: {
            input: {
              type: 'string',
              description: 'Input text for the skill',
            },
          },
          required: ['input'],
        },
        timeoutMs: 60000,
        handler: async (args) => {
          return executeSkillViaPlugin(skill, args);
        },
      };

      api.registerTool(toolCap);
    },
  });

  // 5. 注册到 UnifiedPluginRegistry
  const registry = getUnifiedPluginRegistry();
  const registered = await registry.registerDefinition(definition, {
    skillId,
    version: versionInfo?.currentVersion ?? skill.definition.version,
  });

  if (!registered) {
    return {
      success: false,
      skillId,
      pluginId,
      securityScanPassed,
      activated: false,
      error: 'Failed to register in UnifiedPluginRegistry',
    };
  }

  // 6. 激活（如果启用）
  let activated = false;
  if (autoActivate) {
    activated = await registry.activate(pluginId);
  }

  logger.info(
    `[SkillPluginBridge] Skill ${skillId} bridged as plugin ${pluginId} (scan=${securityScanPassed}, activated=${activated})`,
  );

  return {
    success: true,
    skillId,
    pluginId,
    securityScanPassed,
    activated,
  };
}

/**
 * 批量将所有已注册的 skill 注册为 Plugin SDK 插件
 */
export async function registerAllSkillsAsPlugins(
  options: SkillPluginBridgeOptions = {},
): Promise<SkillPluginBridgeResult[]> {
  const allSkills = skillRegistry.getAllSkills();
  const results: SkillPluginBridgeResult[] = [];

  for (const skill of allSkills) {
    const result = await registerSkillAsPlugin(skill.definition.id, options);
    results.push(result);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  logger.info(
    `[SkillPluginBridge] Batch registration: ${succeeded} succeeded, ${failed} failed out of ${results.length} total`,
  );

  return results;
}

/**
 * 注销 skill 的 Plugin SDK 注册
 */
export async function unregisterSkillPlugin(skillId: string): Promise<boolean> {
  const pluginId = `skill-${skillId}`;
  const registry = getUnifiedPluginRegistry();
  return registry.unregisterDefinition(pluginId);
}

// ===================== 内部实现 =====================

/**
 * 从 skill 定义构建 Plugin SDK 配置 Schema
 */
function buildSkillConfigSchema(_skill: RegisteredSkill): PluginConfigSchema {
  // Skill 系统目前没有标准的 configSchema 字段，
  // 这里提供一个基础 schema，后续可通过 skill.definition 扩展
  return {
    fields: [
      {
        key: 'enabled',
        type: 'boolean',
        label: 'Enabled',
        description: 'Whether this skill is enabled',
        default: true,
      },
    ],
  };
}

/**
 * 通过 Plugin SDK 执行 skill
 *
 * 这里是桥接层的关键：当 Plugin SDK 的工具被调用时，
 * 实际执行委托给 skill 系统的执行器。
 */
async function executeSkillViaPlugin(
  skill: RegisteredSkill,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    // 不传递 ctx，让 skillRegistry 自动创建执行上下文
    const result = await skillRegistry.executeSkill(skill.definition.id, args);

    if (typeof result === 'string') {
      return result;
    }

    return JSON.stringify(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[SkillPluginBridge] Execute skill ${skill.definition.name} failed:`, err);
    return JSON.stringify({ error: msg });
  }
}
