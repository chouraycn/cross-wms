import { logger } from '../../../logger.js';
import fs from 'node:fs';
import path from 'node:path';

export interface DocumentationConfig {
  outputDir: string;
  format: 'markdown' | 'html' | 'json';
  includeExamples?: boolean;
  includeApiReference?: boolean;
}

export interface ParamDoc {
  name: string;
  type: string;
  description: string;
  required?: boolean;
}

export interface ToolDoc {
  name: string;
  description: string;
  parameters: ParamDoc[];
  returnType: string;
}

export interface CommandDoc {
  command: string;
  description: string;
  examples: string[];
}

export interface ExampleDoc {
  title: string;
  input: string;
  output: string;
}

export interface ApiReferenceDoc {
  endpoints: Array<{
    method: string;
    path: string;
    description: string;
    requestBody?: Record<string, any>;
    responseBody?: Record<string, any>;
  }>;
}

export interface SkillDocumentation {
  skillName: string;
  description: string;
  version: string;
  author?: string;
  tools: ToolDoc[];
  commands: CommandDoc[];
  examples: ExampleDoc[];
  apiReference?: ApiReferenceDoc;
}

const DEFAULT_CONFIG: DocumentationConfig = {
  outputDir: './docs',
  format: 'markdown',
  includeExamples: true,
  includeApiReference: false,
};

function parseSkillMd(skillMdPath: string): Partial<SkillDocumentation> {
  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const result: Partial<SkillDocumentation> = {
    tools: [],
    commands: [],
    examples: [],
  };

  if (!content.startsWith('---')) {
    return result;
  }

  const fmEnd = content.indexOf('---', 3);
  if (fmEnd === -1) {
    return result;
  }

  const frontmatter = content.slice(3, fmEnd);
  const lines = frontmatter.split('\n');

  for (const line of lines) {
    if (line.startsWith('name:')) {
      result.skillName = line.slice(5).trim();
    } else if (line.startsWith('description:')) {
      result.description = line.slice(12).trim();
    } else if (line.startsWith('version:')) {
      result.version = line.slice(8).trim();
    } else if (line.startsWith('author:')) {
      result.author = line.slice(7).trim();
    }
  }

  return result;
}

function extractToolsFromIndex(indexTsPath: string): ToolDoc[] {
  const tools: ToolDoc[] = [];
  try {
    const content = fs.readFileSync(indexTsPath, 'utf-8');
    const toolRegex = /tools:\s*\[([\s\S]*?)\]/;
    const match = content.match(toolRegex);

    if (match) {
      const toolsContent = match[1];
      const toolItemRegex = /\{[\s\S]*?name:\s*['"]([^'"]+)['"][\s\S]*?description:\s*['"]([^'"]+)['"][\s\S]*?\}/g;

      let toolMatch;
      while ((toolMatch = toolItemRegex.exec(toolsContent)) !== null) {
        tools.push({
          name: toolMatch[1],
          description: toolMatch[2],
          parameters: [],
          returnType: 'object',
        });
      }
    }
  } catch {
    logger.warn('[docs-generator] 无法从 index.ts 提取工具信息');
  }

  return tools;
}

function extractExamplesFromMd(skillMdPath: string): ExampleDoc[] {
  const examples: ExampleDoc[] = [];
  try {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const exampleSections = content.split(/##\s*示例|###\s*示例|##\s*使用示例|###\s*使用示例/);

    if (exampleSections.length > 1) {
      const examplesContent = exampleSections.slice(1).join('');
      const codeBlocks = examplesContent.match(/```[\s\S]*?```/g) || [];

      codeBlocks.forEach((block, index) => {
        const cleaned = block.replace(/```/g, '').trim();
        if (cleaned) {
          examples.push({
            title: `示例 ${index + 1}`,
            input: cleaned,
            output: '',
          });
        }
      });
    }
  } catch {
    logger.warn('[docs-generator] 无法从 SKILL.md 提取示例');
  }

  return examples;
}

export function generateApiReference(skillDir: string): ApiReferenceDoc | undefined {
  logger.debug('[docs-generator] generateApiReference for:', skillDir);

  const apiFiles = fs.readdirSync(skillDir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => f.name);

  if (apiFiles.length === 0) {
    return undefined;
  }

  const endpoints: ApiReferenceDoc['endpoints'] = [];

  for (const fileName of apiFiles) {
    const filePath = path.join(skillDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');

    const exportRegex = /export\s+(?:async\s+)?function\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      endpoints.push({
        method: 'POST',
        path: `/api/skills/${path.basename(skillDir)}/${match[1]}`,
        description: '',
      });
    }
  }

  return { endpoints };
}

export function generateSkillDocs(skillDir: string, config?: Partial<DocumentationConfig>): SkillDocumentation {
  logger.debug('[docs-generator] generateSkillDocs for:', skillDir);

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const indexTsPath = path.join(skillDir, 'index.ts');

  const baseDoc = parseSkillMd(skillMdPath);
  const tools = extractToolsFromIndex(indexTsPath);
  const examples = mergedConfig.includeExamples ? extractExamplesFromMd(skillMdPath) : [];
  const apiReference = mergedConfig.includeApiReference ? generateApiReference(skillDir) : undefined;

  return {
    skillName: baseDoc.skillName || path.basename(skillDir),
    description: baseDoc.description || '',
    version: baseDoc.version || '1.0.0',
    author: baseDoc.author,
    tools,
    commands: [],
    examples,
    apiReference,
  };
}

export function generateAllDocs(skillsDir: string, config?: Partial<DocumentationConfig>): SkillDocumentation[] {
  logger.debug('[docs-generator] generateAllDocs for:', skillsDir);

  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const docs: SkillDocumentation[] = [];

  if (!fs.existsSync(skillsDir)) {
    logger.warn('[docs-generator] 技能目录不存在:', skillsDir);
    return docs;
  }

  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(skillsDir, d.name));

  for (const skillDir of skillDirs) {
    if (fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
      docs.push(generateSkillDocs(skillDir, mergedConfig));
    }
  }

  return docs;
}

export function formatDocAsMarkdown(doc: SkillDocumentation): string {
  let md = `# ${doc.skillName}\n\n`;

  if (doc.description) {
    md += `${doc.description}\n\n`;
  }

  md += `**版本**: ${doc.version}\n`;
  if (doc.author) {
    md += `**作者**: ${doc.author}\n`;
  }
  md += '\n';

  if (doc.tools.length > 0) {
    md += '## 工具函数\n\n';
    for (const tool of doc.tools) {
      md += `### ${tool.name}\n\n`;
      md += `${tool.description}\n\n`;

      if (tool.parameters.length > 0) {
        md += '**参数**:\n\n';
        md += '| 参数名 | 类型 | 必填 | 描述 |\n';
        md += '| ------ | ---- | ---- | ---- |\n';
        for (const param of tool.parameters) {
          md += `| ${param.name} | ${param.type} | ${param.required ? '是' : '否'} | ${param.description} |\n`;
        }
        md += '\n';
      }

      md += `**返回类型**: \`${tool.returnType}\`\n\n`;
    }
  }

  if (doc.commands.length > 0) {
    md += '## 命令\n\n';
    for (const cmd of doc.commands) {
      md += `### \`${cmd.command}\`\n\n`;
      md += `${cmd.description}\n\n`;

      if (cmd.examples.length > 0) {
        md += '**示例**:\n\n';
        for (const example of cmd.examples) {
          md += `\`\`\`\n${example}\n\`\`\`\n\n`;
        }
      }
    }
  }

  if (doc.examples.length > 0) {
    md += '## 使用示例\n\n';
    for (const example of doc.examples) {
      md += `### ${example.title}\n\n`;
      md += '**输入**:\n\n';
      md += `\`\`\`\n${example.input}\n\`\`\`\n\n`;

      if (example.output) {
        md += '**输出**:\n\n';
        md += `\`\`\`\n${example.output}\n\`\`\`\n\n`;
      }
    }
  }

  if (doc.apiReference && doc.apiReference.endpoints.length > 0) {
    md += '## API 参考\n\n';
    md += '| 方法 | 路径 | 描述 |\n';
    md += '| ---- | ---- | ---- |\n';
    for (const endpoint of doc.apiReference.endpoints) {
      md += `| ${endpoint.method} | ${endpoint.path} | ${endpoint.description || '-'} |\n`;
    }
    md += '\n';
  }

  return md.trim();
}

export function formatDocAsJson(doc: SkillDocumentation): string {
  return JSON.stringify(doc, null, 2);
}

export function formatDocAsHtml(doc: SkillDocumentation, template?: string): string {
  const htmlContent = `
<div class="skill-doc">
  <h1>${doc.skillName}</h1>
  ${doc.description ? `<p>${doc.description}</p>` : ''}
  <div class="metadata">
    <span>版本: ${doc.version}</span>
    ${doc.author ? `<span>作者: ${doc.author}</span>` : ''}
  </div>

  ${doc.tools.length > 0 ? `
  <section>
    <h2>工具函数</h2>
    ${doc.tools.map(tool => `
    <div class="tool">
      <h3>${tool.name}</h3>
      <p>${tool.description}</p>
      ${tool.parameters.length > 0 ? `
      <table>
        <thead>
          <tr><th>参数名</th><th>类型</th><th>必填</th><th>描述</th></tr>
        </thead>
        <tbody>
          ${tool.parameters.map(p => `<tr><td>${p.name}</td><td>${p.type}</td><td>${p.required ? '是' : '否'}</td><td>${p.description}</td></tr>`).join('')}
        </tbody>
      </table>
      ` : ''}
      <p>返回类型: <code>${tool.returnType}</code></p>
    </div>
    `).join('')}
  </section>
  ` : ''}

  ${doc.examples.length > 0 ? `
  <section>
    <h2>使用示例</h2>
    ${doc.examples.map(ex => `
    <div class="example">
      <h3>${ex.title}</h3>
      <pre>${ex.input}</pre>
      ${ex.output ? `<pre>${ex.output}</pre>` : ''}
    </div>
    `).join('')}
  </section>
  ` : ''}

  ${doc.apiReference?.endpoints.length ? `
  <section>
    <h2>API 参考</h2>
    <table>
      <thead>
        <tr><th>方法</th><th>路径</th><th>描述</th></tr>
      </thead>
      <tbody>
        ${doc.apiReference.endpoints.map(e => `<tr><td>${e.method}</td><td>${e.path}</td><td>${e.description || '-'}</td></tr>`).join('')}
      </tbody>
    </table>
  </section>
  ` : ''}
</div>
`;

  if (template) {
    return template.replace('{{content}}', htmlContent);
  }

  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${doc.skillName} - 技能文档</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a2e; }
    h2 { color: #16213e; border-bottom: 2px solid #e94560; padding-bottom: 5px; }
    h3 { color: #0f3460; }
    .metadata { margin: 10px 0; color: #666; }
    .metadata span { margin-right: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    pre { background-color: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .tool, .example { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; }
  </style>
</head>
<body>
${htmlContent}
</body>
</html>
`;
}

export function generateSkillIndex(skillsDir: string): string {
  logger.debug('[docs-generator] generateSkillIndex for:', skillsDir);

  const docs = generateAllDocs(skillsDir);
  let indexMd = `# 技能索引\n\n`;
  indexMd += `共 ${docs.length} 个技能\n\n`;
  indexMd += `| 技能名称 | 描述 | 版本 |\n`;
  indexMd += `| -------- | ---- | ---- |\n`;

  for (const doc of docs) {
    indexMd += `| ${doc.skillName} | ${doc.description || '-'} | ${doc.version} |\n`;
  }

  return indexMd.trim();
}

export async function saveDoc(doc: SkillDocumentation, config: DocumentationConfig): Promise<void> {
  logger.debug('[docs-generator] saveDoc for:', doc.skillName);

  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  let content: string;
  let extension: string;

  switch (config.format) {
    case 'markdown':
      content = formatDocAsMarkdown(doc);
      extension = '.md';
      break;
    case 'html':
      content = formatDocAsHtml(doc);
      extension = '.html';
      break;
    case 'json':
      content = formatDocAsJson(doc);
      extension = '.json';
      break;
    default:
      content = formatDocAsMarkdown(doc);
      extension = '.md';
  }

  const filePath = path.join(config.outputDir, `${doc.skillName}${extension}`);
  fs.writeFileSync(filePath, content, 'utf-8');
  logger.info('[docs-generator] 文档已保存:', filePath);
}

export async function saveAllDocs(skillsDir: string, config?: Partial<DocumentationConfig>): Promise<void> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const docs = generateAllDocs(skillsDir, mergedConfig);

  for (const doc of docs) {
    await saveDoc(doc, mergedConfig);
  }

  const indexContent = generateSkillIndex(skillsDir);
  const indexPath = path.join(mergedConfig.outputDir, 'index.md');
  fs.writeFileSync(indexPath, indexContent, 'utf-8');
  logger.info('[docs-generator] 索引文档已保存:', indexPath);
}
