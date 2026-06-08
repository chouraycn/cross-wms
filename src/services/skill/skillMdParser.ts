/**
 * SKILL.md 标准格式解析器
 *
 * 使用 js-yaml 库解析 YAML frontmatter（`---` 包裹区域），
 * 并从 Markdown body 中提取 instruction block（```markdown/prompt/instruction```）。
 * 支持标准 SKILL.md 字段映射和缺失字段自动推断。
 *
 * @module skillMdParser
 */

import * as yaml from 'js-yaml';

// ===================== 公开类型 =====================

/** SKILL.md 解析结果（扁平化公开接口） */
export interface ParsedSkillMd {
  // ---- 从 YAML frontmatter 解析 ----
  /** 技能名称 */
  name?: string;
  /** 技能描述 */
  description?: string;
  /** 技能版本 */
  version?: string;
  /** 作者 */
  author?: string;
  /** 触发条件/关键词列表 */
  trigger?: string[];
  /** 标签列表 */
  tags?: string[];
  /** 分类 */
  category?: string;
  /** 图标名称 */
  icon?: string;
  /** 依赖的技能 ID 列表 */
  dependencies?: string[];
  /** 权限名称列表 */
  permissions?: string[];

  // ---- 从正文提取 ----
  /** 提取的指令块内容（仅 ```markdown/prompt/instruction``` 块） */
  instructionBlocks?: string[];
  /** 完整正文（不含 frontmatter） */
  content: string;

  // ---- 推断字段 ----
  /** 自动推断的描述（仅当 description 缺失时存在） */
  inferredDescription?: string;
  /** 自动推断的触发词列表（仅当 trigger 缺失时存在） */
  inferredTrigger?: string[];
}

// ===================== 内部类型 =====================

/** YAML frontmatter 原始结构 */
export interface SkillMdFrontmatter {
  name?: string;
  description?: string;
  trigger?: unknown; // 可能是 string 或 string[]
  version?: string;
  author?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  dependencies?: SkillDependency[];
  permissions?: SkillPermission[];
  [key: string]: unknown;
}

/** 技能依赖 */
export interface SkillDependency {
  skillId: string;
  type: 'required' | 'optional' | 'conflicts';
  versionRange?: string;
}

/** 技能权限 */
export interface SkillPermission {
  name: string;
  description?: string;
  required?: boolean;
}

/** 提取的 instruction block */
export interface InstructionBlock {
  type: 'markdown' | 'prompt' | 'instruction';
  content: string;
  startLine: number;
  endLine: number;
}

// ===================== 核心解析函数 =====================

/**
 * 从 SKILL.md 内容中分离 YAML frontmatter 和 Markdown body。
 *
 * 支持标准 `---` 分隔的 frontmatter 格式。
 *
 * @param content - SKILL.md 文件的完整内容
 * @returns frontmatter 文本和 body 文本
 */
export function splitFrontmatterAndBody(
  content: string,
): { frontmatterText: string; body: string } {
  const trimmed = content.trimStart();

  // 匹配 --- 包裹的 YAML frontmatter
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    return {
      frontmatterText: fmMatch[1],
      body: fmMatch[2].trim(),
    };
  }

  // 无 frontmatter：整个内容作为 body
  return {
    frontmatterText: '',
    body: content.trim(),
  };
}

/**
 * 使用 js-yaml 解析 YAML frontmatter 文本。
 *
 * @param frontmatterText - YAML 格式的文本
 * @returns 解析后的 frontmatter 对象
 */
export function parseFrontmatter(
  frontmatterText: string,
): { data: SkillMdFrontmatter; hasError: boolean; errorMessage?: string } {
  if (!frontmatterText.trim()) {
    return { data: {}, hasError: false };
  }

  try {
    const parsed = yaml.load(frontmatterText, {
      schema: yaml.DEFAULT_SCHEMA,
      json: true,
    });

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        data: {},
        hasError: true,
        errorMessage: 'Frontmatter must be a YAML mapping (key: value)',
      };
    }

    return { data: parsed as SkillMdFrontmatter, hasError: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      data: {},
      hasError: true,
      errorMessage: `YAML parse error: ${message}`,
    };
  }
}

/**
 * 从 Markdown body 中提取所有 instruction block。
 *
 * 支持的 code block 类型：
 * - ```markdown — Markdown 格式指令
 * - ```prompt — 提示词模板
 * - ```instruction — 指令说明
 *
 * @param body - Markdown body 内容
 * @returns 提取到的 instruction blocks 列表
 */
export function extractInstructionBlocks(body: string): InstructionBlock[] {
  const blocks: InstructionBlock[] = [];

  // 匹配 ```markdown / ```prompt / ```instruction 代码块
  const regex = /```(markdown|prompt|instruction)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(body)) !== null) {
    const blockType = match[1] as 'markdown' | 'prompt' | 'instruction';
    const blockContent = match[2].trim();

    // 计算行号（0-based）
    const beforeMatch = body.slice(0, match.index);
    const startLine = beforeMatch.split('\n').length - 1;
    const endLine = startLine + match[0].split('\n').length - 1;

    blocks.push({
      type: blockType,
      content: blockContent,
      startLine,
      endLine,
    });
  }

  return blocks;
}

/**
 * 将 trigger 字段统一规范化为 string[]。
 *
 * @param raw - 原始 trigger 值（string、string[] 或其他）
 * @returns 规范化后的字符串数组，空数组表示无 trigger
 */
function normalizeTrigger(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map(String).filter((s) => s.trim().length > 0);
  if (typeof raw === 'string') {
    // 按常见分隔符拆分：/、,、;、顿号、中文逗号
    const parts = raw.split(/[/,;、，]/).map((s) => s.trim()).filter(Boolean);
    return parts.length > 0 ? parts : [raw.trim()].filter(Boolean);
  }
  return [];
}

/**
 * 从 body 文本中推断缺失的 description。
 *
 * 规则：取第一个非空、非标题、非代码块指示符的段落，截断至 200 字符。
 *
 * @param body - Markdown body 内容
 * @returns 推断的描述，若无有效内容则返回 undefined
 */
export function inferDescription(body: string): string | undefined {
  const lines = body.split('\n');
  const paragraphLines: string[] = [];
  let inParagraph = false;
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 跟踪代码块状态
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inParagraph) break;
      continue;
    }
    // 跳过代码块内的所有行
    if (inCodeBlock) continue;

    // 跳过空行
    if (trimmed === '') {
      if (inParagraph) break;
      continue;
    }
    // 跳过标题行
    if (trimmed.startsWith('#')) {
      if (inParagraph) break;
      continue;
    }

    inParagraph = true;
    paragraphLines.push(trimmed);
  }

  if (paragraphLines.length === 0) return undefined;

  const desc = paragraphLines.join(' ').replace(/[#*\n]/g, ' ').trim();
  if (desc.length === 0) return undefined;

  return desc.length > 200 ? desc.slice(0, 200) + '...' : desc;
}

/**
 * 从 body 文本中推断缺失的 trigger。
 *
 * 规则：
 * 1. 查找"触发词："、"触发："、"trigger:" 等显式声明的文本 → 按分隔符拆分
 * 2. 如果 frontmatter 有 name，提取 name 中的中文关键词
 *
 * @param body - Markdown body 内容
 * @param name - 技能名称（可选，用于关键词提取）
 * @param filePath - 文件路径（可选，用于从文件名提取）
 * @returns 推断的触发词列表
 */
export function inferTrigger(
  body: string,
  name?: string,
  filePath?: string,
): string[] | undefined {
  // 方法1：查找"触发词："或"trigger:"等显式声明
  const triggerPatterns = [
    /(?:触发词|触发关键词|触发|Trigger)\s*[:：]\s*(.+)/i,
    /当用户(?:提到|说|输入)\s*[""「「]([^""」」]+)[""」」]/,
  ];

  for (const pattern of triggerPatterns) {
    const tm = body.match(pattern);
    if (tm && tm[1]) {
      const value = tm[1].trim();
      if (value.length > 0) {
        return normalizeTrigger(value);
      }
    }
  }

  // 方法2：从 name 中提取中文关键词（不含英文和数字）
  const source = name || (filePath ? extractNameFromPath(filePath) : '');
  if (source) {
    const chineseKeywords = source.match(/[\u4e00-\u9fff]{2,4}/g);
    if (chineseKeywords && chineseKeywords.length > 0) {
      return chineseKeywords;
    }
  }

  return undefined;
}

/**
 * 从文件路径中提取技能名称。
 *
 * @param filePath - 文件路径
 * @returns 提取的名称
 */
function extractNameFromPath(filePath: string): string {
  // 获取文件名（去掉扩展名）
  const fileName = filePath.replace(/^.*[/\\]/, '').replace(/\.[^.]*$/, '');
  // 如果是 SKILL.md，取目录名
  if (fileName.toLowerCase() === 'skill') {
    const parts = filePath.replace(/[/\\]$/, '').split(/[/\\]/);
    return parts[parts.length - 2] || fileName;
  }
  return fileName;
}

/**
 * 从 SkillPermission 数组提取权限名称列表。
 *
 * @param permissions - 权限对象数组
 * @returns 权限名称列表
 */
function extractPermissionNames(permissions: SkillPermission[] | undefined): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .filter((p): p is SkillPermission =>
      typeof p === 'object' && p !== null && typeof p.name === 'string' && p.name.length > 0,
    )
    .map((p) => p.name);
}

/**
 * 从 SkillDependency 数组提取依赖 ID 列表。
 *
 * @param dependencies - 依赖对象数组
 * @returns 依赖 ID 列表
 */
function extractDependencyIds(dependencies: SkillDependency[] | undefined): string[] {
  if (!Array.isArray(dependencies)) return [];
  return dependencies
    .filter((d): d is SkillDependency =>
      typeof d === 'object' && d !== null && typeof d.skillId === 'string' && d.skillId.length > 0,
    )
    .map((d) => d.skillId);
}

/**
 * 解析 SKILL.md 的完整入口函数。
 *
 * 流程：
 * 1. 分离 frontmatter 和 body
 * 2. 使用 js-yaml 解析 frontmatter
 * 3. 提取 instruction blocks
 * 4. 自动推断缺失字段（description、trigger）
 * 5. 组装返回 ParsedSkillMd
 *
 * @param content - SKILL.md 文件的完整内容
 * @param filePath - 可选文件路径，用于错误提示和名称推断
 * @returns 完整的解析结果
 */
export function parseSkillMd(content: string, filePath?: string): ParsedSkillMd {
  // Step 1: 分离 frontmatter 和 body
  const { frontmatterText, body } = splitFrontmatterAndBody(content);

  // Step 2: 解析 YAML frontmatter
  const { data: fm } = parseFrontmatter(frontmatterText);

  // Step 3: 提取 instruction blocks
  const instructions = extractInstructionBlocks(body);

  // Step 4: 自动推断缺失字段
  let inferredDescription: string | undefined;
  if (!fm.description || fm.description.trim() === '') {
    inferredDescription = inferDescription(body);
  }

  let inferredTrigger: string[] | undefined;
  const normalizedTrigger = normalizeTrigger(fm.trigger);
  if (normalizedTrigger.length === 0) {
    inferredTrigger = inferTrigger(body, fm.name, filePath);
  }

  // Step 5: 组装 ParsedSkillMd
  return {
    // Frontmatter 字段
    name: fm.name,
    description: fm.description,
    version: fm.version,
    author: fm.author,
    trigger: normalizedTrigger.length > 0 ? normalizedTrigger : undefined,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : undefined,
    category: fm.category,
    icon: fm.icon,
    dependencies: extractDependencyIds(fm.dependencies),
    permissions: extractPermissionNames(fm.permissions),

    // 提取的指令块
    instructionBlocks: instructions.length > 0
      ? instructions.map((b) => b.content)
      : undefined,

    // 正文
    content: body,

    // 推断字段
    inferredDescription,
    inferredTrigger,
  };
}

/**
 * 将 ParsedSkillMd 结果映射为前端 Skill 接口所需的字段。
 *
 * @param parsed - 解析结果
 * @param dirName - 目录名称（用于生成 skillId）
 * @returns 映射后的 Skill 字段对象
 */
export function mapParsedToSkillFields(
  parsed: ParsedSkillMd,
  dirName: string,
): {
  id: string;
  name: string;
  desc: string;
  trigger: string;
  version: string;
  author: string;
  category: string;
  icon: string;
  tags: string[];
  promptTemplate: string;
  dependencies: SkillDependency[];
  permissions: SkillPermission[];
} {
  const effectiveDescription = parsed.description || parsed.inferredDescription || '';
  const effectiveTrigger = parsed.trigger || parsed.inferredTrigger || [];

  return {
    id: `user-${dirName}`,
    name: parsed.name || dirName,
    desc: effectiveDescription,
    trigger: effectiveTrigger.join(' / '),
    version: parsed.version || '1.0',
    author: parsed.author || '',
    category: parsed.category || 'tool',
    icon: parsed.icon || 'Extension',
    tags: parsed.tags || [],
    promptTemplate: getPromptTemplate(parsed),
    dependencies: [],
    permissions: [],
  };
}

/**
 * 从 ParsedSkillMd 中提取 promptTemplate。
 *
 * 优先级：prompt > instruction > markdown > 第一个 instructionBlock > content
 *
 * @param parsed - 解析结果
 * @returns prompt 模板字符串
 */
function getPromptTemplate(parsed: ParsedSkillMd): string {
  if (!parsed.instructionBlocks || parsed.instructionBlocks.length === 0) {
    return parsed.content;
  }
  return parsed.instructionBlocks[0];
}
