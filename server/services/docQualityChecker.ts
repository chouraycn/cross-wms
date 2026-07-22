/**
 * 技能文档质量检查服务
 *
 * 对 SKILL.md 进行文档质量自动化检查，评估：
 * - 结构完整性（frontmatter 必填字段）
 * - 可读性（描述长度、段落结构）
 * - 示例完整性（代码块、使用示例）
 * - 参数说明（参数列表、类型）
 * - 格式规范（markdown 正确性）
 */

import yaml from 'js-yaml';

// ===================== 类型定义 =====================

export interface DocQualityIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  fix?: string;
  lineNumber?: number;
}

export interface DocQualityCheck {
  pass: boolean;
  score: number; // 0-100
  issues: DocQualityIssue[];
  suggestions: string[];
}

export interface DocQualityResult {
  skillId: string;
  skillName: string;
  overallScore: number;
  level: 'excellent' | 'good' | 'fair' | 'poor';
  checks: {
    structure: DocQualityCheck;
    readability: DocQualityCheck;
    examples: DocQualityCheck;
    parameters: DocQualityCheck;
    formatting: DocQualityCheck;
  };
  checkedAt: string;
}

// ===================== 评分常量 =====================

const LEVEL_THRESHOLDS = {
  excellent: 90,
  good: 75,
  fair: 60,
  poor: 0,
};

function calcLevel(score: number): DocQualityResult['level'] {
  if (score >= LEVEL_THRESHOLDS.excellent) return 'excellent';
  if (score >= LEVEL_THRESHOLDS.good) return 'good';
  if (score >= LEVEL_THRESHOLDS.fair) return 'fair';
  return 'poor';
}

// ===================== 解析工具 =====================

interface ParsedSkillMd {
  frontmatter: Record<string, unknown>;
  body: string;
  bodyLines: string[];
}

function parseSkillMd(content: string): ParsedSkillMd {
  const trimmed = content.trimStart();
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  if (trimmed.startsWith('---')) {
    const endIdx = trimmed.indexOf('\n---', 3);
    if (endIdx !== -1) {
      const yamlText = trimmed.slice(3, endIdx).replace(/^\n/, '');
      body = trimmed.slice(endIdx + 4).replace(/^\n/, '');
      try {
        const parsed = yaml.load(yamlText);
        if (parsed && typeof parsed === 'object') {
          frontmatter = parsed as Record<string, unknown>;
        }
      } catch {
        // ignore
      }
    }
  }

  return { frontmatter, body, bodyLines: body.split('\n') };
}

// ===================== 各维度检查器 =====================

function checkStructure(frontmatter: Record<string, unknown>): DocQualityCheck {
  const issues: DocQualityIssue[] = [];
  const suggestions: string[] = [];
  const requiredFields = ['name', 'description', 'version'];
  const recommendedFields = ['author', 'maintainer', 'category', 'tags'];

  for (const field of requiredFields) {
    const val = frontmatter[field];
    if (!val || (typeof val === 'string' && val.trim().length === 0)) {
      issues.push({
        code: `STRUCT_MISSING_${field.toUpperCase()}`,
        message: `缺少必填字段: ${field}`,
        severity: 'error',
        fix: `在 frontmatter 中添加 ${field}: 字段`,
      });
    }
  }

  for (const field of recommendedFields) {
    const val = frontmatter[field];
    if (!val || (typeof val === 'string' && val.trim().length === 0)) {
      suggestions.push(`建议补充字段: ${field}`);
    }
  }

  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  if (!metadata) {
    suggestions.push('建议添加 metadata 区块以声明 OpenClaw 兼容性');
  } else {
    const openclaw = metadata.openclaw as Record<string, unknown> | undefined;
    if (!openclaw) {
      suggestions.push('建议添加 metadata.openclaw 配置');
    } else {
      const inputs = openclaw.inputs as unknown[] | undefined;
      const outputs = openclaw.outputs as unknown[] | undefined;
      if (!inputs) {
        suggestions.push('建议在 metadata.openclaw.inputs 中声明输入参数');
      }
      if (!outputs) {
        suggestions.push('建议在 metadata.openclaw.outputs 中声明输出结果');
      }
    }
  }

  const version = String(frontmatter.version || '');
  if (!/^\d+\.\d+(\.\d+)?$/.test(version)) {
    issues.push({
      code: 'STRUCT_INVALID_VERSION',
      message: `版本号格式不正确: ${version}`,
      severity: 'warning',
      fix: '版本号应遵循语义化版本格式，如 1.0.0',
    });
  }

  const deduction = issues.filter(i => i.severity === 'error').length * 20 +
    issues.filter(i => i.severity === 'warning').length * 10 +
    suggestions.length * 5;
  const score = Math.max(0, 100 - deduction);

  return {
    pass: score >= 75,
    score,
    issues,
    suggestions,
  };
}

function checkReadability(body: string, frontmatter: Record<string, unknown>): DocQualityCheck {
  const issues: DocQualityIssue[] = [];
  const suggestions: string[] = [];

  const desc = String(frontmatter.description || '');
  if (desc.length < 20) {
    issues.push({
      code: 'READ_DESC_TOO_SHORT',
      message: `描述过短（${desc.length} 字符，建议 >= 20）`,
      severity: 'error',
      fix: '扩展描述内容，详细说明技能的功能和用途',
    });
  } else if (desc.length > 300) {
    suggestions.push(`描述较长（${desc.length} 字符），建议精简到 300 字符以内`);
  }

  const paragraphs = body.split(/\n{2,}/).filter(p => p.trim().length > 0);
  if (paragraphs.length < 2) {
    issues.push({
      code: 'READ_TOO_FEW_PARAGRAPHS',
      message: `正文段落过少（${paragraphs.length} 段，建议至少 2 段）`,
      severity: 'warning',
      fix: '将内容分成多个段落，提高可读性',
    });
  }

  const h1Count = (body.match(/^#\s+/gm) || []).length;
  const h2Count = (body.match(/^##\s+/gm) || []).length;

  if (h1Count === 0 && h2Count === 0) {
    issues.push({
      code: 'READ_NO_HEADINGS',
      message: '缺少标题结构',
      severity: 'error',
      fix: '使用 ## 或 ### 添加章节标题，如 "## 使用方法"',
    });
  }
  if (h1Count > 1) {
    suggestions.push('建议只使用一个一级标题 (#)');
  }

  const bodyText = body.replace(/```[\s\S]*?```/g, '').replace(/[#*`\[\]\(\)]/g, '');
  const avgSentenceLen = bodyText.length / Math.max(1, bodyText.split(/[。\.\n]/).length);
  if (avgSentenceLen > 100) {
    suggestions.push(`句子平均长度较长（${Math.round(avgSentenceLen)} 字符），建议适当分段`);
  }

  const longLines = body.split('\n').filter(line => line.length > 120).length;
  if (longLines > 3) {
    issues.push({
      code: 'READ_TOO_LONG_LINES',
      message: `存在 ${longLines} 行超过 120 字符`,
      severity: 'warning',
      fix: '每行保持在 120 字符以内，提升可读性',
    });
  }

  const deduction = issues.filter(i => i.severity === 'error').length * 15 +
    issues.filter(i => i.severity === 'warning').length * 7 +
    suggestions.length * 3;
  const score = Math.max(0, 100 - deduction);

  return {
    pass: score >= 75,
    score,
    issues,
    suggestions,
  };
}

function checkExamples(body: string): DocQualityCheck {
  const issues: DocQualityIssue[] = [];
  const suggestions: string[] = [];

  const codeBlocks = body.match(/```[\s\S]*?```/g) || [];
  if (codeBlocks.length === 0) {
    issues.push({
      code: 'EXAMPLES_NO_CODE_BLOCKS',
      message: '缺少代码示例块',
      severity: 'error',
      fix: '添加代码块展示技能的使用示例',
    });
  } else if (codeBlocks.length < 2) {
    suggestions.push(`建议提供至少 2 个代码示例（当前 ${codeBlocks.length} 个）`);
  }

  const hasUsageSection = /#{1,3}\s*(使用|用法|示例|Usage|Example|Quick Start)/i.test(body);
  if (!hasUsageSection) {
    issues.push({
      code: 'EXAMPLES_NO_USAGE_SECTION',
      message: '缺少使用示例章节',
      severity: 'error',
      fix: '添加 "## 使用示例" 或 "## Usage" 章节',
    });
  }

  const codeBlockHeaders = body.match(/```(\w*)/g) || [];
  const unnamedBlocks = codeBlockHeaders.filter(h => h === '```').length;
  if (unnamedBlocks > 0) {
    suggestions.push(`有 ${unnamedBlocks} 个代码块未指定语言，建议标注（如 \`\`\`bash）`);
  }

  const hasOutputSection = /#{1,3}\s*(输出|结果|Output|Result)/i.test(body);
  if (!hasOutputSection && codeBlocks.length > 0) {
    suggestions.push('建议添加输出结果示例，帮助用户理解预期结果');
  }

  const shortCodeBlocks = codeBlocks.filter(b => b.length < 50).length;
  if (shortCodeBlocks > 0) {
    issues.push({
      code: 'EXAMPLES_SHORT_CODE',
      message: `存在 ${shortCodeBlocks} 个过短的代码块`,
      severity: 'warning',
      fix: '提供完整的示例代码，包含必要的上下文',
    });
  }

  const deduction = issues.filter(i => i.severity === 'error').length * 20 +
    issues.filter(i => i.severity === 'warning').length * 10 +
    suggestions.length * 5;
  const score = Math.max(0, 100 - deduction);

  return {
    pass: score >= 75,
    score,
    issues,
    suggestions,
  };
}

function checkParameters(body: string, frontmatter: Record<string, unknown>): DocQualityCheck {
  const issues: DocQualityIssue[] = [];
  const suggestions: string[] = [];

  const hasParamTable = /\|\s*参数\s*\||\|\s*名称\s*\||\|\s*变量\s*\|/i.test(body);
  const hasParamList = /[-*]\s+`\w+`\s*[:：]/.test(body);
  const hasParamSection = /#{1,3}\s*(参数|配置|变量|Parameters|Config|Variables)/i.test(body);

  if (!hasParamSection) {
    suggestions.push('建议添加 "参数说明" 或 "配置" 章节');
  }
  if (!hasParamTable && !hasParamList) {
    issues.push({
      code: 'PARAMS_NO_DOC',
      message: '未检测到参数说明表格或列表',
      severity: 'error',
      fix: '使用表格或列表形式说明参数名称、类型、默认值和说明',
    });
  }

  const metadata = frontmatter.metadata as Record<string, unknown> | undefined;
  const openclaw = metadata?.openclaw as Record<string, unknown> | undefined;
  const inputs = openclaw?.inputs as unknown[] | undefined;
  if (!inputs || inputs.length === 0) {
    suggestions.push('建议在 metadata.openclaw.inputs 中声明输入参数');
  } else {
    const inputsWithNoDesc = inputs.filter((i: any) => !i.description || String(i.description).trim() === '');
    if (inputsWithNoDesc.length > 0) {
      issues.push({
        code: 'PARAMS_MISSING_DESC',
        message: `${inputsWithNoDesc.length} 个参数缺少描述`,
        severity: 'warning',
        fix: '为每个参数添加 description 字段说明用途',
      });
    }

    const inputsWithNoType = inputs.filter((i: any) => !i.type);
    if (inputsWithNoType.length > 0) {
      issues.push({
        code: 'PARAMS_MISSING_TYPE',
        message: `${inputsWithNoType.length} 个参数缺少类型声明`,
        severity: 'warning',
        fix: '为每个参数添加 type 字段（如 string, number, boolean）',
      });
    }
  }

  const hasRequiredMark = /\|\s*必填\s*\||\|\s*required\s*\||\*\s+\[必选\]/i.test(body);
  if (!hasRequiredMark && inputs && inputs.length > 0) {
    suggestions.push('建议标注参数是否为必填项');
  }

  const deduction = issues.filter(i => i.severity === 'error').length * 20 +
    issues.filter(i => i.severity === 'warning').length * 10 +
    suggestions.length * 5;
  const score = Math.max(0, 100 - deduction);

  return {
    pass: score >= 75,
    score,
    issues,
    suggestions,
  };
}

function checkFormatting(body: string): DocQualityCheck {
  const issues: DocQualityIssue[] = [];
  const suggestions: string[] = [];

  const codeFenceOpen = (body.match(/```/g) || []).length;
  if (codeFenceOpen % 2 !== 0) {
    issues.push({
      code: 'FORMAT_UNCLOSED_CODE',
      message: `存在未闭合的代码块（${codeFenceOpen} 个 \`\`\`，应为偶数）`,
      severity: 'error',
      fix: '检查并补齐缺失的代码块闭合标记',
    });
  }

  const emptyLinks = (body.match(/\[([^\]]*)\]\(\s*\)/g) || []).length;
  if (emptyLinks > 0) {
    issues.push({
      code: 'FORMAT_EMPTY_LINKS',
      message: `发现 ${emptyLinks} 个空链接`,
      severity: 'warning',
      fix: '为链接添加有效的 URL 地址',
    });
  }

  const bareUrls = (body.match(/(?<![\[(])https?:\/\/[^\s)]+/g) || []).length;
  if (bareUrls > 0) {
    suggestions.push(`发现 ${bareUrls} 个裸链接，建议使用 [文本](链接) 格式`);
  }

  const excessiveBlankLines = (body.match(/\n{4,}/g) || []).length;
  if (excessiveBlankLines > 0) {
    suggestions.push(`存在 ${excessiveBlankLines} 处过多连续空行`);
  }

  const brokenLinks = (body.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).filter(link => {
    const url = link.match(/\(([^)]+)\)/)?.[1];
    return url && (url.startsWith('http') && !url.includes('//') || url.includes(' '));
  });
  if (brokenLinks.length > 0) {
    issues.push({
      code: 'FORMAT_BROKEN_LINKS',
      message: `发现 ${brokenLinks.length} 个可能无效的链接`,
      severity: 'warning',
      fix: '检查链接格式是否正确，URL 不应包含空格',
    });
  }

  const trailingSpaces = body.split('\n').filter(line => line.match(/[ \t]+$/)).length;
  if (trailingSpaces > 5) {
    suggestions.push(`存在 ${trailingSpaces} 行末尾有多余空格`);
  }

  const mixedHeaders = body.match(/^#{1,6}\s+.*\n#{3,6}\s+.*\n#{1,2}\s+/gm);
  if (mixedHeaders) {
    suggestions.push('标题层级可能不规范，建议遵循从高到低的顺序');
  }

  const deduction = issues.filter(i => i.severity === 'error').length * 15 +
    issues.filter(i => i.severity === 'warning').length * 7 +
    suggestions.length * 3;
  const score = Math.max(0, 100 - deduction);

  return {
    pass: score >= 75,
    score,
    issues,
    suggestions,
  };
}

// ===================== 主入口 =====================

export function auditDocQuality(skillId: string, skillName: string, content: string): DocQualityResult {
  const parsed = parseSkillMd(content);

  const structure = checkStructure(parsed.frontmatter);
  const readability = checkReadability(parsed.body, parsed.frontmatter);
  const examples = checkExamples(parsed.body);
  const parameters = checkParameters(parsed.body, parsed.frontmatter);
  const formatting = checkFormatting(parsed.body);

  const overallScore = Math.round(
    (structure.score + readability.score + examples.score + parameters.score + formatting.score) / 5
  );

  return {
    skillId,
    skillName,
    overallScore,
    level: calcLevel(overallScore),
    checks: {
      structure,
      readability,
      examples,
      parameters,
      formatting,
    },
    checkedAt: new Date().toISOString(),
  };
}

/** 批量检查 */
export function batchAuditDocQuality(
  items: Array<{ skillId: string; skillName: string; content: string }>
): DocQualityResult[] {
  return items.map(item => auditDocQuality(item.skillId, item.skillName, item.content));
}
