import { logger } from '../../../../logger.js';
import {
  initializeBuiltinTemplates,
  listTemplates,
  getTemplate,
  validateTemplateVariables,
  createSkillFromTemplate,
  exportTemplate,
  type SkillTemplate,
  type ValidationResult,
} from '../../lifecycle/template-manager.js';
import {
  generateSkillDocs,
  generateAllDocs,
  generateSkillIndex,
  formatDocAsMarkdown,
  formatDocAsHtml,
  formatDocAsJson,
  saveDoc,
  saveAllDocs,
  type DocumentationConfig,
  type SkillDocumentation,
} from '../../docs/index.js';

initializeBuiltinTemplates();

interface GeneratedSkill {
  name: string;
  description: string;
  category: string;
  skillMd: string;
  indexTs: string;
  directoryStructure: string[];
}

interface CreateSkillResult {
  success: boolean;
  skillDir?: string;
  error?: string;
}

interface GenerateDocsResult {
  success: boolean;
  docContent?: string;
  savedPath?: string;
  error?: string;
}

function toKebabCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toPascalCase(name: string): string {
  return name
    .split(/[-_]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function generateSkillTemplate(
  name: string,
  description: string = '自定义技能',
  category: string = 'general',
): GeneratedSkill {
  logger.debug('[skill-creator] generateSkillTemplate for:', name);

  const kebabName = toKebabCase(name);
  const pascalName = toPascalCase(name);

  const skillMd = `---
name: ${kebabName}
description: ${description}
version: 0.1.0
triggers:
  - keyword:${kebabName}
category: ${category}
tags: ${kebabName}, ${category}
metadata:
  crosswms:
    category: ${category}
    executionMode: tool
    source: workspace
    status: active
---

# ${pascalName}

${description}

## 功能

- 功能1
- 功能2

## 使用示例

\`\`\`
使用示例
\`\`\`

## 工具函数

- \`${kebabName}_action(params)\` - 操作描述
`;

  const indexTs = `import { logger } from '../../logger.js';

export function doSomething(params: Record<string, unknown>): Record<string, unknown> {
  logger.debug('[${kebabName}] doSomething called with:', params);
  return {
    success: true,
    message: '${pascalName} executed successfully',
    params,
  };
}

export default {
  name: '${kebabName}',
  description: '${description}',
  tools: [
    {
      name: '${kebabName}_action',
      description: '操作描述',
      handler: (args: Record<string, unknown>) => doSomething(args),
    },
  ],
};
`;

  return {
    name: kebabName,
    description,
    category,
    skillMd,
    indexTs,
    directoryStructure: [
      `${kebabName}/`,
      `${kebabName}/SKILL.md`,
      `${kebabName}/index.ts`,
    ],
  };
}

export function validateSkillMd(content: string): ValidationResult {
  logger.debug('[skill-creator] validateSkillMd called');
  const errors: { variableName: string; message: string }[] = [];

  if (!content.startsWith('---')) {
    errors.push({ variableName: '', message: 'SKILL.md 必须以 YAML frontmatter 开头（---）' });
  } else {
    const fmEnd = content.indexOf('---', 3);
    if (fmEnd === -1) {
      errors.push({ variableName: '', message: 'frontmatter 未正确闭合（缺少结束的 ---）' });
    } else {
      const frontmatter = content.slice(3, fmEnd);
      if (!frontmatter.includes('name:')) {
        errors.push({ variableName: '', message: 'frontmatter 缺少必填字段: name' });
      }
      if (!frontmatter.includes('description:')) {
        errors.push({ variableName: '', message: 'frontmatter 缺少必填字段: description' });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getAvailableTemplates(category?: string): SkillTemplate[] {
  logger.debug('[skill-creator] getAvailableTemplates called, category:', category);
  return listTemplates(category);
}

export function getTemplateDetails(templateId: string): SkillTemplate | undefined {
  logger.debug('[skill-creator] getTemplateDetails called for:', templateId);
  return getTemplate(templateId);
}

export function validateSkillVariables(templateId: string, variables: Record<string, unknown>): ValidationResult {
  logger.debug('[skill-creator] validateSkillVariables called for:', templateId);
  return validateTemplateVariables(templateId, variables);
}

export async function createSkillUsingTemplate(
  templateId: string,
  variables: Record<string, unknown>,
  targetDir: string,
): Promise<CreateSkillResult> {
  logger.debug('[skill-creator] createSkillUsingTemplate called with:', templateId);
  const result = await createSkillFromTemplate(templateId, variables, targetDir);
  return result;
}

export async function exportSkillAsTemplate(skillDir: string): Promise<{ success: boolean; template?: SkillTemplate; error?: string }> {
  logger.debug('[skill-creator] exportSkillAsTemplate called for:', skillDir);
  return exportTemplate(skillDir);
}

export function generateSkillDocumentation(skillDir: string, format: 'markdown' | 'html' | 'json' = 'markdown'): GenerateDocsResult {
  logger.debug('[skill-creator] generateSkillDocumentation for:', skillDir);

  try {
    const doc = generateSkillDocs(skillDir);
    let docContent: string;

    switch (format) {
      case 'html':
        docContent = formatDocAsHtml(doc);
        break;
      case 'json':
        docContent = formatDocAsJson(doc);
        break;
      default:
        docContent = formatDocAsMarkdown(doc);
    }

    return { success: true, docContent };
  } catch (error) {
    logger.error('[skill-creator] 生成技能文档失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
}

export function generateAllSkillsDocumentation(skillsDir: string): SkillDocumentation[] {
  logger.debug('[skill-creator] generateAllSkillsDocumentation for:', skillsDir);
  return generateAllDocs(skillsDir);
}

export function generateSkillsIndex(skillsDir: string): string {
  logger.debug('[skill-creator] generateSkillsIndex for:', skillsDir);
  return generateSkillIndex(skillsDir);
}

export async function saveSkillDocumentation(skillDir: string, outputDir: string, format: 'markdown' | 'html' | 'json' = 'markdown'): Promise<GenerateDocsResult> {
  logger.debug('[skill-creator] saveSkillDocumentation for:', skillDir);

  try {
    const doc = generateSkillDocs(skillDir, { outputDir, format });
    await saveDoc(doc, { outputDir, format });

    const extension = format === 'markdown' ? '.md' : format === 'html' ? '.html' : '.json';
    const savedPath = `${outputDir}/${doc.skillName}${extension}`;

    return { success: true, savedPath };
  } catch (error) {
    logger.error('[skill-creator] 保存技能文档失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
}

export async function saveAllSkillsDocumentation(skillsDir: string, outputDir: string, format: 'markdown' | 'html' | 'json' = 'markdown'): Promise<GenerateDocsResult> {
  logger.debug('[skill-creator] saveAllSkillsDocumentation for:', skillsDir);

  try {
    await saveAllDocs(skillsDir, { outputDir, format });
    return { success: true, savedPath: outputDir };
  } catch (error) {
    logger.error('[skill-creator] 保存所有技能文档失败:', error);
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
}

export default {
  name: 'skill-creator',
  description: '帮助用户创建新技能，支持模板系统和文档生成',
  tools: [
    {
      name: 'skill_creator_generate',
      description: '生成基础技能模板文件',
      handler: (args: { name: string; description?: string; category?: string }) =>
        generateSkillTemplate(args.name, args.description, args.category),
    },
    {
      name: 'skill_creator_validate',
      description: '验证 SKILL.md 格式是否正确',
      handler: (args: { content: string }) => validateSkillMd(args.content),
    },
    {
      name: 'skill_creator_list_templates',
      description: '列出所有可用的技能模板',
      handler: (args: { category?: string }) => getAvailableTemplates(args.category),
    },
    {
      name: 'skill_creator_get_template',
      description: '获取指定模板的详细信息',
      handler: (args: { templateId: string }) => getTemplateDetails(args.templateId),
    },
    {
      name: 'skill_creator_validate_variables',
      description: '验证模板变量是否符合要求',
      handler: (args: { templateId: string; variables: Record<string, unknown> }) =>
        validateSkillVariables(args.templateId, args.variables),
    },
    {
      name: 'skill_creator_create_from_template',
      description: '使用模板创建技能',
      handler: (args: { templateId: string; variables: Record<string, unknown>; targetDir: string }) =>
        createSkillUsingTemplate(args.templateId, args.variables, args.targetDir),
    },
    {
      name: 'skill_creator_export_template',
      description: '将现有技能导出为模板',
      handler: (args: { skillDir: string }) => exportSkillAsTemplate(args.skillDir),
    },
    {
      name: 'skill_creator_generate_docs',
      description: '生成单个技能的文档',
      handler: (args: { skillDir: string; format?: 'markdown' | 'html' | 'json' }) =>
        generateSkillDocumentation(args.skillDir, args.format),
    },
    {
      name: 'skill_creator_generate_all_docs',
      description: '生成所有技能的文档',
      handler: (args: { skillsDir: string }) => generateAllSkillsDocumentation(args.skillsDir),
    },
    {
      name: 'skill_creator_generate_docs_index',
      description: '生成技能索引页面',
      handler: (args: { skillsDir: string }) => generateSkillsIndex(args.skillsDir),
    },
    {
      name: 'skill_creator_save_docs',
      description: '保存单个技能的文档到文件',
      handler: (args: { skillDir: string; outputDir: string; format?: 'markdown' | 'html' | 'json' }) =>
        saveSkillDocumentation(args.skillDir, args.outputDir, args.format),
    },
    {
      name: 'skill_creator_save_all_docs',
      description: '保存所有技能的文档到文件',
      handler: (args: { skillsDir: string; outputDir: string; format?: 'markdown' | 'html' | 'json' }) =>
        saveAllSkillsDocumentation(args.skillsDir, args.outputDir, args.format),
    },
  ],
};
