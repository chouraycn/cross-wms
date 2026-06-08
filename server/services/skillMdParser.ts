/**
 * SKILL.md 解析器 — 后端版本（ESM）
 *
 * 使用 js-yaml 库解析 YAML frontmatter，供 server/routes/skills.ts 使用。
 * 与前端版本（src/services/skill/skillMdParser.ts）功能对齐，使用 ESM 模块格式。
 */

import yaml from 'js-yaml';

// ===================== 类型定义 =====================

/** 技能依赖 */
interface SkillDependency {
  skillId: string;
  type: 'required' | 'optional' | 'conflicts';
  versionRange?: string;
}

/** 技能权限 */
interface SkillPermission {
  name: string;
  description?: string;
  required?: boolean;
}

/** SKILL.md 标准 frontmatter 字段 */
interface SkillMdFrontmatter {
  name?: string;
  description?: string;
  trigger?: string;
  version?: string;
  author?: string;
  category?: string;
  icon?: string;
  tags?: string[];
  dependencies?: SkillDependency[];
  permissions?: SkillPermission[];
  [key: string]: unknown;
}

/** 完整的 SKILL.md 解析结果 */
interface ParsedSkillMd {
  frontmatter: SkillMdFrontmatter;
  body: string;
  promptTemplate: string;
  hasError: boolean;
  errorMessage?: string;
}

// ===================== 解析函数 =====================

/**
 * 解析 SKILL.md 内容（后端版本）
 */
function parseSkillMdContent(content: string): ParsedSkillMd {
  // Step 1: 分离 frontmatter 和 body
  const { frontmatterText, body } = splitFrontmatterAndBody(content);

  // Step 2: 解析 YAML
  const { data: rawFrontmatter, hasError, errorMessage } = parseFrontmatter(frontmatterText);

  if (hasError) {
    return {
      frontmatter: rawFrontmatter,
      body,
      promptTemplate: body,
      hasError: true,
      errorMessage,
    };
  }

  // Step 3: 推断缺失字段
  const frontmatter = inferMissingFields(rawFrontmatter, body);

  // Step 4: 提取 promptTemplate（取 body 全文或 instruction block）
  const promptTemplate = extractPromptTemplate(body);

  return {
    frontmatter,
    body,
    promptTemplate,
    hasError: false,
  };
}

/**
 * 分离 frontmatter 和 body
 */
function splitFrontmatterAndBody(content: string): { frontmatterText: string; body: string } {
  const trimmed = content.trimStart();
  const fmMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (fmMatch) {
    return {
      frontmatterText: fmMatch[1],
      body: fmMatch[2].trim(),
    };
  }
  return { frontmatterText: '', body: content.trim() };
}

/**
 * 使用 js-yaml 解析 YAML frontmatter
 */
function parseFrontmatter(frontmatterText: string): {
  data: SkillMdFrontmatter;
  hasError: boolean;
  errorMessage?: string;
} {
  if (!frontmatterText.trim()) {
    return { data: {}, hasError: false };
  }

  try {
    const parsed = yaml.load(frontmatterText, { schema: yaml.DEFAULT_SCHEMA, json: true });
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
 * 从 body 中推断缺失的 frontmatter 字段
 */
function inferMissingFields(fm: SkillMdFrontmatter, body: string): SkillMdFrontmatter {
  const inferred = { ...fm };

  // 推断 description
  if (!inferred.description || inferred.description.trim() === '') {
    const lines = body.split('\n');
    const paraLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('#')) {
        if (paraLines.length > 0) break;
        continue;
      }
      if (trimmed.startsWith('```')) continue;
      paraLines.push(trimmed);
    }
    if (paraLines.length > 0) {
      const desc = paraLines.join(' ').replace(/[#*\n]/g, ' ').trim();
      inferred.description = desc.length > 200 ? desc.slice(0, 200) + '...' : desc;
    }
  }

  // 推断 trigger
  if (!inferred.trigger || inferred.trigger.trim() === '') {
    const triggerPatterns = [
      /(?:触发词|触发关键词|trigger)\s*[:：]\s*(.+)/i,
    ];
    for (const pattern of triggerPatterns) {
      const tm = body.match(pattern);
      if (tm && tm[1]) {
        inferred.trigger = tm[1].trim();
        break;
      }
    }
  }

  return inferred;
}

/**
 * 从 body 中提取 promptTemplate
 * 优先提取 ```prompt / ```instruction / ```markdown 代码块
 */
function extractPromptTemplate(body: string): string {
  const regex = /```(markdown|prompt|instruction)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let promptBlock: string | null = null;
  let instructionBlock: string | null = null;
  let markdownBlock: string | null = null;

  while ((match = regex.exec(body)) !== null) {
    const type = match[1];
    const content = match[2].trim();
    if (type === 'prompt' && !promptBlock) promptBlock = content;
    if (type === 'instruction' && !instructionBlock) instructionBlock = content;
    if (type === 'markdown' && !markdownBlock) markdownBlock = content;
  }

  return promptBlock || instructionBlock || markdownBlock || body;
}

export {
  parseSkillMdContent,
  splitFrontmatterAndBody,
  parseFrontmatter,
  inferMissingFields,
  extractPromptTemplate,
};
