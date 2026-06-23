/**
 * Skill Debugger — Skill CLI 调试工具
 *
 * 提供三个核心调试命令：
 * 1. listSkills(format) — 列出所有已注册的 Skill
 * 2. runSkill(skillId, paramsJson, sessionId) — 单次手动执行 Skill 调试
 * 3. doctorSkill(skillPath) — 校验 Skill 的 manifest、依赖、Schema 合法性
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { skillRegistry } from './skillRegistry.js';
import { createSkillContext } from './skillContextFactory.js';
import { performSecurityChecks } from './skillSecurityGuard.js';
import { parseSkillMdContent } from '../services/skillMdParser.js';
import type { SkillPermissionConfig } from '../types/skill-runtime.js';

// ===================== 1. listSkills =====================

/** 列表输出格式 */
type ListFormat = 'table' | 'json' | 'csv';

/**
 * 列出所有已注册的 Skill
 *
 * 输出格式：
 * ID          Name          Group        State      Source    ExecCount
 * ─────────────────────────────────────────────────────────────
 * fs_read     文件读取      fs_read      enabled    builtin   0
 * calc        计算器        util         enabled    user      12
 *
 * @param format - 输出格式：table（默认）/ json / csv
 * @returns 格式化后的字符串
 */
export function listSkills(format: ListFormat = 'table'): string {
  const skills = skillRegistry.getAllSkills();

  switch (format) {
    case 'json':
      return formatJson(skills);
    case 'csv':
      return formatCsv(skills);
    case 'table':
    default:
      return formatTable(skills);
  }
}

/** 表格格式输出 */
function formatTable(skills: ReturnType<typeof skillRegistry.getAllSkills>): string {
  if (skills.length === 0) {
    return 'No skills registered.';
  }

  const headers = ['ID', 'Name', 'Group', 'State', 'Source', 'ExecCount'];
  const rows = skills.map((s) => [
    s.definition.id,
    s.definition.name,
    s.definition.group,
    s.state,
    s.definition.source,
    String(s.executionCount),
  ]);

  // 计算每列最大宽度
  const colWidths = headers.map((h, i) => {
    const maxDataWidth = Math.max(...rows.map((r) => r[i].length));
    return Math.max(h.length, maxDataWidth, 10);
  });

  // 构建分隔线
  const separator = colWidths.map((w) => '─'.repeat(w)).join('─');

  // 构建表头行
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join(' ');

  // 构建数据行
  const dataRows = rows.map((row) =>
    row.map((cell, i) => cell.padEnd(colWidths[i])).join(' ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

/** JSON 格式输出 */
function formatJson(skills: ReturnType<typeof skillRegistry.getAllSkills>): string {
  const data = skills.map((s) => ({
    id: s.definition.id,
    name: s.definition.name,
    group: s.definition.group,
    state: s.state,
    source: s.definition.source,
    execCount: s.executionCount,
    lastExecutedAt: s.lastExecutedAt,
    registeredAt: s.registeredAt,
    description: s.definition.description,
    version: s.definition.version,
    author: s.definition.author,
    tags: s.definition.tags,
    userInvocable: s.definition.userInvocable,
    gate: s.definition.gate,
    sandboxScope: s.definition.sandboxScope,
  }));
  return JSON.stringify(data, null, 2);
}

/** CSV 格式输出 */
function formatCsv(skills: ReturnType<typeof skillRegistry.getAllSkills>): string {
  if (skills.length === 0) {
    return 'ID,Name,Group,State,Source,ExecCount';
  }

  const headers = ['ID', 'Name', 'Group', 'State', 'Source', 'ExecCount'];
  const rows = skills.map((s) => [
    s.definition.id,
    s.definition.name,
    s.definition.group,
    s.state,
    s.definition.source,
    String(s.executionCount),
  ]);

  const escapeCsv = (cell: string): string => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ];

  return lines.join('\n');
}

// ===================== 2. runSkill =====================

/**
 * 单次手动执行 Skill 调试
 *
 * @param skillId - Skill ID
 * @param paramsJson - JSON 参数字符串
 * @param sessionId - 会话 ID（可选，不传则自动生成）
 * @returns 执行结果（含 success/output/durationMs）
 */
export async function runSkill(
  skillId: string,
  paramsJson: string,
  sessionId?: string,
): Promise<{ success: boolean; output: string; durationMs: number }> {
  const startTime = Date.now();

  try {
    // 1. 查找 Skill
    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      return {
        success: false,
        output: `Skill '${skillId}' 未注册或不存在`,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. 解析参数
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsJson);
      if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        throw new Error('参数必须是 JSON 对象');
      }
    } catch (e) {
      return {
        success: false,
        output: `参数解析失败: ${e instanceof Error ? e.message : String(e)}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 3. 创建执行上下文
    const workspace = process.cwd();
    const ctx = createSkillContext({
      skillId,
      sessionId: sessionId || `debug-${Date.now()}`,
      workspace,
      sandboxScope: skill.definition.sandboxScope,
    });

    // 4. 执行安全校验（使用宽松配置，允许调试执行）
    const debugPermissionConfig: SkillPermissionConfig = {
      allow: ['*'],
      deny: [],
      elevated: { enabled: 'auto' },
    };

    const securityResult = await performSecurityChecks(
      skill.definition,
      params,
      debugPermissionConfig,
      ctx,
    );

    if (!securityResult.allowed) {
      return {
        success: false,
        output: `安全校验失败: ${securityResult.reason}`,
        durationMs: Date.now() - startTime,
      };
    }

    // 5. 执行 Skill
    const result = await skillRegistry.executeSkill(skillId, params, ctx);

    // 6. 格式化输出
    let output: string;
    if (result.success) {
      output = typeof result.data === 'object'
        ? JSON.stringify(result.data, null, 2)
        : String(result.data ?? '');
    } else {
      output = `执行失败: ${result.error ?? '未知错误'}`;
    }

    const durationMs = result.metadata?.durationMs ?? (Date.now() - startTime);

    return {
      success: result.success,
      output,
      durationMs,
    };
  } catch (e) {
    return {
      success: false,
      output: `调试执行异常: ${e instanceof Error ? e.message : String(e)}`,
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 3. doctorSkill =====================

/** Doctor 校验结果 */
export interface DoctorResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    manifest?: boolean;
    schema?: boolean;
    dependencies?: boolean;
    permissions?: boolean;
    sandbox?: boolean;
  };
}

/**
 * 校验 Skill 的 manifest、依赖、Schema 合法性
 *
 * @param skillPath - Skill 目录路径或 ID
 * @returns 校验结果
 */
export async function doctorSkill(skillPath: string): Promise<DoctorResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: DoctorResult['details'] = {};

  // 判断输入是 ID 还是路径
  let dirPath: string;
  let isId = false;

  if (path.isAbsolute(skillPath) || skillPath.includes('/') || skillPath.includes('\\')) {
    // 是路径
    dirPath = path.resolve(skillPath);
  } else {
    // 是 ID，尝试从注册表查找
    isId = true;
    const skill = skillRegistry.getSkill(skillPath);
    if (skill?.definition.sourcePath) {
      dirPath = skill.definition.sourcePath;
    } else {
      errors.push(`Skill ID '${skillPath}' 未注册或没有 sourcePath`);
      return { valid: false, errors, warnings, details };
    }
  }

  // 检查目录是否存在
  if (!fs.existsSync(dirPath)) {
    errors.push(`Skill 目录不存在: ${dirPath}`);
    return { valid: false, errors, warnings, details };
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    errors.push(`路径不是目录: ${dirPath}`);
    return { valid: false, errors, warnings, details };
  }

  const skillMdPath = path.join(dirPath, 'SKILL.md');

  // ===================== manifest 校验 =====================
  if (!fs.existsSync(skillMdPath)) {
    errors.push(`SKILL.md 不存在: ${skillMdPath}`);
    details.manifest = false;
    return { valid: false, errors, warnings, details };
  }

  let content: string;
  try {
    content = fs.readFileSync(skillMdPath, 'utf-8');
  } catch (e) {
    errors.push(`读取 SKILL.md 失败: ${e instanceof Error ? e.message : String(e)}`);
    details.manifest = false;
    return { valid: false, errors, warnings, details };
  }

  const parsed = parseSkillMdContent(content);
  if (parsed.hasError) {
    errors.push(`SKILL.md 解析失败: ${parsed.errorMessage}`);
    details.manifest = false;
    return { valid: false, errors, warnings, details };
  }

  const fm = parsed.frontmatter;
  details.manifest = true;

  // 检查必填字段
  if (!fm.name) {
    warnings.push('frontmatter 缺少 name 字段');
  }
  if (!fm.description && !parsed.body.trim()) {
    warnings.push('frontmatter 缺少 description 字段且 body 为空');
  }

  // 检查目录名与 ID 一致性（如果是路径输入）
  if (!isId) {
    const dirName = path.basename(dirPath);
    const SKILL_ID_PATTERN = /^[a-z][a-z0-9_]*$/;
    if (!SKILL_ID_PATTERN.test(dirName)) {
      warnings.push(`目录名 '${dirName}' 不符合 Skill ID 命名规范（小写字母+下划线+数字）`);
    }
  }

  // ===================== schema 校验 =====================
  const parameters = (fm as Record<string, unknown>).parameters;
  if (parameters && typeof parameters === 'object') {
    const schema = parameters as Record<string, unknown>;
    if (schema.type !== 'object') {
      warnings.push('parameters schema 的 type 应为 object');
    }
    if (!schema.properties || typeof schema.properties !== 'object') {
      warnings.push('parameters schema 缺少 properties 字段');
    }
    details.schema = true;
  } else {
    warnings.push('frontmatter 缺少 parameters 字段，将使用默认空 schema');
    details.schema = false;
  }

  // ===================== dependencies 校验 =====================
  const requires = (fm as Record<string, unknown>).requires;
  if (requires && typeof requires === 'object') {
    const req = requires as { os?: string[]; env?: string[]; skills?: string[] };

    // 检查 OS 兼容性
    if (req.os && Array.isArray(req.os)) {
      const currentOs = os.platform();
      if (!req.os.includes(currentOs)) {
        warnings.push(`当前操作系统 '${currentOs}' 不在支持列表中: [${req.os.join(', ')}]`);
      }
    }

    // 检查环境变量
    if (req.env && Array.isArray(req.env)) {
      for (const envVar of req.env) {
        if (!process.env[envVar]) {
          warnings.push(`环境变量 '${envVar}' 未设置`);
        }
      }
    }

    // 检查依赖的 Skill
    if (req.skills && Array.isArray(req.skills)) {
      for (const depSkillId of req.skills) {
        if (!skillRegistry.getSkill(depSkillId)) {
          warnings.push(`依赖的 Skill '${depSkillId}' 未注册`);
        }
      }
    }

    details.dependencies = true;
  } else {
    details.dependencies = true; // 无依赖声明视为通过
  }

  // ===================== permissions 校验 =====================
  const gate = (fm as Record<string, unknown>).gate as string | undefined;
  const userInvocable = (fm as Record<string, unknown>).userInvocable as boolean | undefined;
  const sandboxScope = (fm as Record<string, unknown>).sandboxScope as string | undefined;

  if (gate && !['auto', 'manual', 'ask'].includes(gate)) {
    errors.push(`无效的 gate 值: '${gate}'，应为 auto / manual / ask 之一`);
    details.permissions = false;
  } else {
    details.permissions = true;
  }

  if (userInvocable !== undefined && typeof userInvocable !== 'boolean') {
    warnings.push('userInvocable 应为布尔值');
  }

  // ===================== sandbox 校验 =====================
  if (sandboxScope && !['workspace', 'user', 'system', 'none'].includes(sandboxScope)) {
    errors.push(`无效的 sandboxScope 值: '${sandboxScope}'，应为 workspace / user / system / none 之一`);
    details.sandbox = false;
  } else {
    details.sandbox = true;
  }

  // ===================== 原生代码入口校验 =====================
  const hasNativeEntry =
    fs.existsSync(path.join(dirPath, 'index.ts')) ||
    fs.existsSync(path.join(dirPath, 'index.js'));

  if (hasNativeEntry) {
    const entryPath = fs.existsSync(path.join(dirPath, 'index.js'))
      ? path.join(dirPath, 'index.js')
      : path.join(dirPath, 'index.ts');

    try {
      const entryContent = fs.readFileSync(entryPath, 'utf-8');
      if (!entryContent.includes('export async function execute')) {
        warnings.push(`原生代码入口 ${path.basename(entryPath)} 可能缺少 'export async function execute'`);
      }
    } catch {
      warnings.push(`无法读取原生代码入口: ${entryPath}`);
    }
  }

  // ===================== 汇总 =====================
  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    details,
  };
}
