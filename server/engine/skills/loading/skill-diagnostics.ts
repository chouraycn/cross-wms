/**
 * 技能加载期诊断系统
 *
 * 参考 OpenClaw 的 loading/session.ts：
 * - LoadSkillsResult 包含 diagnostics 数组
 * - ResourceDiagnostic 记录加载失败/警告
 * - validateName / validateDescription 校验器
 */

import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger("skill-diagnostics");

// ============================================================================
// 类型定义
// ============================================================================

/** 诊断级别 */
export type DiagnosticLevel = "error" | "warning" | "info";

/** 资源诊断信息 */
export interface ResourceDiagnostic {
  /** 诊断 ID */
  id: string;
  /** 诊断级别 */
  level: DiagnosticLevel;
  /** 资源名称（技能名或文件路径） */
  resource: string;
  /** 错误消息 */
  message: string;
  /** 错误详情 */
  detail?: string;
  /** 源位置（行号、列号） */
  location?: {
    line?: number;
    column?: number;
    filePath?: string;
  };
  /** 建议的修复操作 */
  suggestion?: string;
  /** 错误代码 */
  code?: string;
}

/** 技能加载结果（含诊断信息） */
export interface LoadSkillsResult<T = unknown> {
  /** 成功加载的技能列表 */
  skills: T[];
  /** 诊断信息列表 */
  diagnostics: ResourceDiagnostic[];
  /** 是否有错误 */
  hasErrors: boolean;
  /** 是否有警告 */
  hasWarnings: boolean;
}

// ============================================================================
// 技能验证器
// ============================================================================

/** 技能名称验证规则 */
const SKILL_NAME_MAX_LENGTH = 64;
const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const SKILL_DESCRIPTION_MAX_LENGTH = 1024;
const SKILL_SUMMARY_MAX_LENGTH = 256;

/** 验证技能名称 */
export function validateSkillName(name: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push("Skill name is required");
    return { valid: false, errors };
  }

  if (name.length > SKILL_NAME_MAX_LENGTH) {
    errors.push(`Skill name exceeds ${SKILL_NAME_MAX_LENGTH} characters`);
  }

  if (!SKILL_NAME_PATTERN.test(name)) {
    errors.push(
      `Skill name must match pattern: lowercase alphanumeric with hyphens (pattern: ${SKILL_NAME_PATTERN})`
    );
  }

  // 检查连续连字符
  if (name.includes("--")) {
    errors.push("Skill name must not contain consecutive hyphens");
  }

  // 检查以连字符开头或结尾
  if (name.startsWith("-") || name.endsWith("-")) {
    errors.push("Skill name must not start or end with a hyphen");
  }

  return { valid: errors.length === 0, errors };
}

/** 验证技能描述 */
export function validateSkillDescription(description: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!description || description.trim().length === 0) {
    errors.push("Skill description is required");
    return { valid: false, errors };
  }

  if (description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    errors.push(`Skill description exceeds ${SKILL_DESCRIPTION_MAX_LENGTH} characters`);
  }

  // 检查纯空白字符
  if (description.trim().length !== description.length && description.startsWith(" ")) {
    errors.push("Skill description should not start with whitespace");
  }

  return { valid: errors.length === 0, errors };
}

/** 验证技能摘要 */
export function validateSkillSummary(summary: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (summary && summary.length > SKILL_SUMMARY_MAX_LENGTH) {
    errors.push(`Skill summary exceeds ${SKILL_SUMMARY_MAX_LENGTH} characters`);
  }

  return { valid: errors.length === 0, errors };
}

/** 验证技能版本 */
export function validateSkillVersion(version: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!version) {
    errors.push("Skill version is required");
    return { valid: false, errors };
  }

  // 语义化版本检查
  const semverPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  if (!semverPattern.test(version)) {
    errors.push(`Skill version "${version}" is not a valid semantic version (e.g., 1.0.0)`);
  }

  return { valid: errors.length === 0, errors };
}

/** 验证技能 slug */
export function validateSkillSlug(slug: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!slug) {
    errors.push("Skill slug is required");
    return { valid: false, errors };
  }

  // slug 格式: owner/skill-name 或 skill-name
  const slugPattern = /^(@?[a-z0-9][a-z0-9-]*[a-z0-9]\/)?[a-z0-9][a-z0-9-]*[a-z0-9]$/;
  if (!slugPattern.test(slug)) {
    errors.push(`Skill slug "${slug}" has invalid format (expected: owner/skill-name or skill-name)`);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// 诊断收集器
// ============================================================================

/** 诊断收集器 */
export class DiagnosticCollector {
  private diagnostics: ResourceDiagnostic[] = [];

  /** 添加诊断 */
  add(diagnostic: Omit<ResourceDiagnostic, "id">): void {
    const id = `diag-${this.diagnostics.length + 1}`;
    this.diagnostics.push({ ...diagnostic, id });
  }

  /** 添加错误 */
  addError(resource: string, message: string, options?: Partial<Omit<ResourceDiagnostic, "id" | "level" | "resource" | "message">>): void {
    this.add({ level: "error", resource, message, ...options });
  }

  /** 添加警告 */
  addWarning(resource: string, message: string, options?: Partial<Omit<ResourceDiagnostic, "id" | "level" | "resource" | "message">>): void {
    this.add({ level: "warning", resource, message, ...options });
  }

  /** 添加信息 */
  addInfo(resource: string, message: string, options?: Partial<Omit<ResourceDiagnostic, "id" | "level" | "resource" | "message">>): void {
    this.add({ level: "info", resource, message, ...options });
  }

  /** 获取所有诊断 */
  getAll(): ResourceDiagnostic[] {
    return [...this.diagnostics];
  }

  /** 获取错误 */
  getErrors(): ResourceDiagnostic[] {
    return this.diagnostics.filter((d) => d.level === "error");
  }

  /** 获取警告 */
  getWarnings(): ResourceDiagnostic[] {
    return this.diagnostics.filter((d) => d.level === "warning");
  }

  /** 是否有错误 */
  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.level === "error");
  }

  /** 是否有警告 */
  hasWarnings(): boolean {
    return this.diagnostics.some((d) => d.level === "warning");
  }

  /** 清空诊断 */
  clear(): void {
    this.diagnostics = [];
  }

  /** 获取诊断数量 */
  count(): number {
    return this.diagnostics.length;
  }

  /** 格式化为字符串报告 */
  formatReport(): string {
    const lines: string[] = [];

    for (const diag of this.diagnostics) {
      const levelStr = diag.level.toUpperCase().padEnd(7);
      const location = diag.location
        ? ` [${diag.location.filePath}:${diag.location.line || "?"}:${diag.location.column || "?"}]`
        : "";
      const suggestion = diag.suggestion ? `\n  → ${diag.suggestion}` : "";
      lines.push(`[${levelStr}] ${diag.resource}${location}: ${diag.message}${suggestion}`);
    }

    return lines.join("\n");
  }

  /** 验证技能并收集诊断 */
  validateSkill(skill: {
    name?: string;
    description?: string;
    summary?: string;
    version?: string;
    slug?: string;
  }): boolean {
    let allValid = true;

    if (skill.name !== undefined) {
      const result = validateSkillName(skill.name);
      if (!result.valid) {
        for (const error of result.errors) {
          this.addError(skill.name || "unknown", error);
        }
        allValid = false;
      }
    }

    if (skill.description !== undefined) {
      const result = validateSkillDescription(skill.description);
      if (!result.valid) {
        for (const error of result.errors) {
          this.addError(skill.name || "unknown", error);
        }
        allValid = false;
      }
    }

    if (skill.summary !== undefined) {
      const result = validateSkillSummary(skill.summary);
      if (!result.valid) {
        for (const error of result.errors) {
          this.addWarning(skill.name || "unknown", error);
        }
      }
    }

    if (skill.version !== undefined) {
      const result = validateSkillVersion(skill.version);
      if (!result.valid) {
        for (const error of result.errors) {
          this.addError(skill.name || "unknown", error);
        }
        allValid = false;
      }
    }

    if (skill.slug !== undefined) {
      const result = validateSkillSlug(skill.slug);
      if (!result.valid) {
        for (const error of result.errors) {
          this.addError(skill.name || "unknown", error);
        }
        allValid = false;
      }
    }

    return allValid;
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 创建加载结果 */
export function createLoadResult<T>(skills: T[], collector: DiagnosticCollector): LoadSkillsResult<T> {
  return {
    skills,
    diagnostics: collector.getAll(),
    hasErrors: collector.hasErrors(),
    hasWarnings: collector.hasWarnings(),
  };
}

/** 安全加载技能（将错误转为诊断而非抛出异常） */
export async function loadSkillSafely<T>(
  loader: () => Promise<T>,
  resourceName: string
): Promise<{ skill?: T; diagnostics: ResourceDiagnostic[] }> {
  const collector = new DiagnosticCollector();

  try {
    const skill = await loader();
    return { skill, diagnostics: collector.getAll() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    collector.addError(resourceName, `Failed to load: ${message}`);
    logger.warn(`[Diagnostics] Failed to load ${resourceName}: ${message}`);
    return { skill: undefined, diagnostics: collector.getAll() };
  }
}