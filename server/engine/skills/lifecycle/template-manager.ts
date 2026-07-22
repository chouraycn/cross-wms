import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";

export interface TemplateFile {
  path: string;
  content: string;
  template?: boolean;
}

export interface TemplateVariable {
  name: string;
  type: "string" | "number" | "boolean" | "select";
  label: string;
  description: string;
  required: boolean;
  default?: unknown;
  options?: string[];
}

export interface SkillTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  files: TemplateFile[];
  variables: TemplateVariable[];
}

export interface TemplateInstance {
  templateId: string;
  variables: Record<string, unknown>;
  createdAt: number;
}

export interface ValidationError {
  variableName: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const templates: Map<string, SkillTemplate> = new Map();

function renderTemplate(content: string, variables: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return `{{${key}}}`;
    }
    return String(value);
  });
}

export function registerTemplate(template: SkillTemplate): void {
  logger.debug("[TemplateManager] Registering template:", template.id);
  templates.set(template.id, template);
}

export function getTemplate(id: string): SkillTemplate | undefined {
  return templates.get(id);
}

export function listTemplates(category?: string): SkillTemplate[] {
  const allTemplates = Array.from(templates.values());
  if (category) {
    return allTemplates.filter((t) => t.category === category);
  }
  return allTemplates;
}

export function clearTemplates(): void {
  templates.clear();
}

export function validateTemplateVariables(
  templateId: string,
  variables: Record<string, unknown>,
): ValidationResult {
  const template = getTemplate(templateId);
  if (!template) {
    return {
      valid: false,
      errors: [{ variableName: "", message: `Template '${templateId}' not found` }],
    };
  }

  const errors: ValidationError[] = [];

  for (const variable of template.variables) {
    const value = variables[variable.name];

    if (variable.required && (value === undefined || value === null)) {
      errors.push({
        variableName: variable.name,
        message: `Required variable '${variable.label}' is missing`,
      });
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    switch (variable.type) {
      case "string":
        if (typeof value !== "string") {
          errors.push({
            variableName: variable.name,
            message: `Variable '${variable.label}' must be a string`,
          });
        }
        break;

      case "number":
        if (typeof value !== "number" || isNaN(value)) {
          errors.push({
            variableName: variable.name,
            message: `Variable '${variable.label}' must be a number`,
          });
        }
        break;

      case "boolean":
        if (typeof value !== "boolean") {
          errors.push({
            variableName: variable.name,
            message: `Variable '${variable.label}' must be a boolean`,
          });
        }
        break;

      case "select":
        if (!variable.options || !variable.options.includes(String(value))) {
          errors.push({
            variableName: variable.name,
            message: `Variable '${variable.label}' must be one of: ${variable.options?.join(", ")}`,
          });
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function createSkillFromTemplate(
  templateId: string,
  variables: Record<string, unknown>,
  targetDir: string,
): Promise<{ success: boolean; skillDir?: string; error?: string }> {
  const validation = validateTemplateVariables(templateId, variables);
  if (!validation.valid) {
    const errorMsg = validation.errors.map((e) => e.message).join("; ");
    return { success: false, error: errorMsg };
  }

  const template = getTemplate(templateId);
  if (!template) {
    return { success: false, error: `Template '${templateId}' not found` };
  }

  try {
    logger.debug("[TemplateManager] Creating skill from template:", templateId);

    const resolvedVariables: Record<string, unknown> = { ...variables };
    for (const variable of template.variables) {
      if (resolvedVariables[variable.name] === undefined && variable.default !== undefined) {
        resolvedVariables[variable.name] = variable.default;
      }
    }

    const normalizedTargetDir = path.resolve(targetDir);

    await fs.mkdir(normalizedTargetDir, { recursive: true });

    for (const file of template.files) {
      const targetFilePath = path.join(normalizedTargetDir, file.path);
      const targetFileDir = path.dirname(targetFilePath);

      await fs.mkdir(targetFileDir, { recursive: true });

      const content = file.template ? renderTemplate(file.content, resolvedVariables) : file.content;
      await fs.writeFile(targetFilePath, content, "utf-8");

      logger.debug("[TemplateManager] Wrote file:", targetFilePath);
    }

    logger.info("[TemplateManager] Skill created from template:", templateId);

    return { success: true, skillDir: normalizedTargetDir };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[TemplateManager] Failed to create skill from template:", err);
    return { success: false, error: errorMessage };
  }
}

async function collectFiles(dir: string, baseDir: string): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nestedFiles = await collectFiles(fullPath, baseDir);
      files.push(...nestedFiles);
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath);
      const content = await fs.readFile(fullPath, "utf-8");
      const isTemplate = /\{\{\w+\}\}/.test(content);

      files.push({
        path: relativePath,
        content,
        template: isTemplate,
      });
    }
  }

  return files;
}

export async function exportTemplate(skillDir: string): Promise<{ success: boolean; template?: SkillTemplate; error?: string }> {
  try {
    logger.debug("[TemplateManager] Exporting template from skill dir:", skillDir);

    const normalizedDir = path.resolve(skillDir);

    const files = await collectFiles(normalizedDir, normalizedDir);

    const skillMdFile = files.find((f) => f.path.toLowerCase() === "skill.md");
    let name = path.basename(normalizedDir);
    let description = "";
    let category = "general";
    const tags: string[] = [];

    if (skillMdFile) {
      const fmMatch = skillMdFile.content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fmContent = fmMatch[1];
        const nameMatch = fmContent.match(/name:\s*(.+)/);
        const descMatch = fmContent.match(/description:\s*(.+)/);
        const catMatch = fmContent.match(/category:\s*(.+)/);
        const tagsMatch = fmContent.match(/tags:\s*(.+)/);

        if (nameMatch) name = nameMatch[1].trim();
        if (descMatch) description = descMatch[1].trim();
        if (catMatch) category = catMatch[1].trim();
        if (tagsMatch) tags.push(...tagsMatch[1].split(",").map((t) => t.trim()));
      }
    }

    const variables: TemplateVariable[] = [];
    const variableNames = new Set<string>();

    for (const file of files) {
      if (!file.template) continue;

      const matches = file.content.match(/\{\{(\w+)\}\}/g);
      if (matches) {
        for (const match of matches) {
          const varName = match.slice(2, -2);
          variableNames.add(varName);
        }
      }
    }

    for (const varName of variableNames) {
      variables.push({
        name: varName,
        type: "string",
        label: varName.charAt(0).toUpperCase() + varName.slice(1),
        description: `Value for ${varName}`,
        required: false,
      });
    }

    const template: SkillTemplate = {
      id: `exported-${name}-${Date.now()}`,
      name,
      description,
      category,
      tags: tags.length > 0 ? tags : [name],
      files,
      variables,
    };

    logger.info("[TemplateManager] Template exported successfully:", template.id);

    return { success: true, template };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error("[TemplateManager] Failed to export template:", err);
    return { success: false, error: errorMessage };
  }
}

export function getBuiltinTemplates(): SkillTemplate[] {
  const builtins: SkillTemplate[] = [
    {
      id: "basic",
      name: "基础技能",
      description: "创建一个基础的技能模板，包含 SKILL.md 和 index.ts",
      category: "general",
      tags: ["basic", "skill", "general"],
      variables: [
        {
          name: "skillName",
          type: "string",
          label: "技能名称",
          description: "技能的名称（使用 kebab-case）",
          required: true,
        },
        {
          name: "skillDescription",
          type: "string",
          label: "技能描述",
          description: "技能的功能描述",
          required: true,
        },
        {
          name: "skillCategory",
          type: "select",
          label: "技能分类",
          description: "技能所属分类",
          required: false,
          default: "general",
          options: ["general", "tools", "api", "data", "ai"],
        },
      ],
      files: [
        {
          path: "SKILL.md",
          content: `---
name: {{skillName}}
description: {{skillDescription}}
version: 0.1.0
triggers:
  - keyword:{{skillName}}
category: {{skillCategory}}
tags: {{skillName}}, {{skillCategory}}
metadata:
  crosswms:
    category: {{skillCategory}}
    executionMode: tool
    source: workspace
    status: active
---

# {{skillName}}

{{skillDescription}}

## 功能

- 功能1
- 功能2

## 使用示例

\`\`\`
使用示例
\`\`\`

## 工具函数

- \`{{skillName}}_action(params)\` - 操作描述
`,
          template: true,
        },
        {
          path: "index.ts",
          content: `import { logger } from '../../logger.js';

export function doSomething(params: Record<string, unknown>): Record<string, unknown> {
  logger.debug('[{{skillName}}] doSomething called with:', params);
  return {
    success: true,
    message: '{{skillName}} executed successfully',
    params,
  };
}

export default {
  name: '{{skillName}}',
  description: '{{skillDescription}}',
  tools: [
    {
      name: '{{skillName}}_action',
      description: '操作描述',
      handler: (args: Record<string, unknown>) => doSomething(args),
    },
  ],
};
`,
          template: true,
        },
      ],
    },
    {
      id: "mcp-server",
      name: "MCP 服务器",
      description: "创建一个 MCP (Model Context Protocol) 服务器技能模板",
      category: "api",
      tags: ["mcp", "server", "api", "protocol"],
      variables: [
        {
          name: "skillName",
          type: "string",
          label: "技能名称",
          description: "技能的名称（使用 kebab-case）",
          required: true,
        },
        {
          name: "skillDescription",
          type: "string",
          label: "技能描述",
          description: "技能的功能描述",
          required: true,
        },
        {
          name: "mcpServerName",
          type: "string",
          label: "MCP 服务器名称",
          description: "MCP 服务器的标识名称",
          required: true,
        },
      ],
      files: [
        {
          path: "SKILL.md",
          content: `---
name: {{skillName}}
description: {{skillDescription}}
version: 0.1.0
triggers:
  - keyword:{{skillName}}
category: api
tags: {{skillName}}, mcp, server
metadata:
  crosswms:
    category: api
    executionMode: mcp
    source: workspace
    status: active
---

# {{skillName}}

{{skillDescription}}

## MCP 服务器配置

- 服务器名称: {{mcpServerName}}

## 工具函数

- \`{{skillName}}_query(params)\` - 执行 MCP 查询
`,
          template: true,
        },
        {
          path: "index.ts",
          content: `import { logger } from '../../logger.js';

export async function executeQuery(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  logger.debug('[{{skillName}}] executeQuery called with:', params);
  return {
    success: true,
    server: '{{mcpServerName}}',
    data: params,
  };
}

export default {
  name: '{{skillName}}',
  description: '{{skillDescription}}',
  mcpServer: '{{mcpServerName}}',
  tools: [
    {
      name: '{{skillName}}_query',
      description: '执行 MCP 查询',
      handler: (args: Record<string, unknown>) => executeQuery(args),
    },
  ],
};
`,
          template: true,
        },
        {
          path: "mcp.json",
          content: `{
  "name": "{{mcpServerName}}",
  "version": "0.1.0",
  "description": "{{skillDescription}}",
  "protocolVersion": "2024-11-05"
}
`,
          template: true,
        },
      ],
    },
    {
      id: "cli-tool",
      name: "CLI 工具",
      description: "创建一个命令行工具技能模板",
      category: "tools",
      tags: ["cli", "tool", "command", "terminal"],
      variables: [
        {
          name: "skillName",
          type: "string",
          label: "技能名称",
          description: "技能的名称（使用 kebab-case）",
          required: true,
        },
        {
          name: "skillDescription",
          type: "string",
          label: "技能描述",
          description: "技能的功能描述",
          required: true,
        },
        {
          name: "cliCommand",
          type: "string",
          label: "CLI 命令",
          description: "命令行工具的命令名称",
          required: true,
        },
      ],
      files: [
        {
          path: "SKILL.md",
          content: `---
name: {{skillName}}
description: {{skillDescription}}
version: 0.1.0
triggers:
  - keyword:{{skillName}}
category: tools
tags: {{skillName}}, cli, tool
metadata:
  crosswms:
    category: tools
    executionMode: cli
    source: workspace
    status: active
---

# {{skillName}}

{{skillDescription}}

## CLI 命令

- 命令: \`{{cliCommand}}\`

## 使用示例

\`\`\`bash
{{cliCommand}} --help
{{cliCommand}} --option value
\`\`\`
`,
          template: true,
        },
        {
          path: "index.ts",
          content: `import { logger } from '../../logger.js';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function runCommand(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  logger.debug('[{{skillName}}] runCommand called with:', args);

  const command = '{{cliCommand}}';
  const params = Object.entries(args)
    .map(([key, value]) => \`--\${key} \${value}\`)
    .join(' ');

  const fullCommand = \`\${command} \${params}\`.trim();

  try {
    const { stdout, stderr } = await execAsync(fullCommand);
    return {
      success: true,
      command: fullCommand,
      output: stdout.trim(),
      error: stderr.trim() || null,
    };
  } catch (err) {
    logger.error('[{{skillName}}] Command execution failed:', err);
    return {
      success: false,
      command: fullCommand,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default {
  name: '{{skillName}}',
  description: '{{skillDescription}}',
  tools: [
    {
      name: '{{skillName}}_run',
      description: '运行 CLI 命令',
      handler: (args: Record<string, unknown>) => runCommand(args),
    },
  ],
};
`,
          template: true,
        },
      ],
    },
    {
      id: "web-api",
      name: "Web API",
      description: "创建一个 Web API 技能模板",
      category: "api",
      tags: ["web", "api", "http", "rest"],
      variables: [
        {
          name: "skillName",
          type: "string",
          label: "技能名称",
          description: "技能的名称（使用 kebab-case）",
          required: true,
        },
        {
          name: "skillDescription",
          type: "string",
          label: "技能描述",
          description: "技能的功能描述",
          required: true,
        },
        {
          name: "apiBaseUrl",
          type: "string",
          label: "API 基础地址",
          description: "Web API 的基础 URL",
          required: true,
        },
      ],
      files: [
        {
          path: "SKILL.md",
          content: `---
name: {{skillName}}
description: {{skillDescription}}
version: 0.1.0
triggers:
  - keyword:{{skillName}}
category: api
tags: {{skillName}}, web, api
metadata:
  crosswms:
    category: api
    executionMode: api
    source: workspace
    status: active
---

# {{skillName}}

{{skillDescription}}

## API 配置

- 基础地址: {{apiBaseUrl}}

## 接口列表

- \`GET /endpoint\` - 获取数据
- \`POST /endpoint\` - 创建数据

## 使用示例

\`\`\`bash
curl {{apiBaseUrl}}/endpoint
\`\`\`
`,
          template: true,
        },
        {
          path: "index.ts",
          content: `import { logger } from '../../logger.js';

export async function fetchData(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  logger.debug('[{{skillName}}] fetchData called with:', params);

  const url = new URL('{{apiBaseUrl}}');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    return {
      success: true,
      status: response.status,
      url: url.toString(),
      data,
    };
  } catch (err) {
    logger.error('[{{skillName}}] API request failed:', err);
    return {
      success: false,
      url: url.toString(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export default {
  name: '{{skillName}}',
  description: '{{skillDescription}}',
  apiBaseUrl: '{{apiBaseUrl}}',
  tools: [
    {
      name: '{{skillName}}_fetch',
      description: '调用 Web API',
      handler: (args: Record<string, unknown>) => fetchData(args),
    },
  ],
};
`,
          template: true,
        },
        {
          path: "api-config.json",
          content: `{
  "baseUrl": "{{apiBaseUrl}}",
  "timeout": 30000,
  "headers": {}
}
`,
          template: true,
        },
      ],
    },
    {
      id: "data-processor",
      name: "数据处理器",
      description: "创建一个数据处理技能模板",
      category: "data",
      tags: ["data", "processor", "transform", "etl"],
      variables: [
        {
          name: "skillName",
          type: "string",
          label: "技能名称",
          description: "技能的名称（使用 kebab-case）",
          required: true,
        },
        {
          name: "skillDescription",
          type: "string",
          label: "技能描述",
          description: "技能的功能描述",
          required: true,
        },
        {
          name: "dataFormat",
          type: "select",
          label: "数据格式",
          description: "处理的数据格式",
          required: false,
          default: "json",
          options: ["json", "csv", "xml", "yaml"],
        },
      ],
      files: [
        {
          path: "SKILL.md",
          content: `---
name: {{skillName}}
description: {{skillDescription}}
version: 0.1.0
triggers:
  - keyword:{{skillName}}
category: data
tags: {{skillName}}, data, processor
metadata:
  crosswms:
    category: data
    executionMode: tool
    source: workspace
    status: active
---

# {{skillName}}

{{skillDescription}}

## 数据格式

- 格式: {{dataFormat}}

## 功能

- 数据转换
- 数据清洗
- 数据聚合

## 使用示例

\`\`\`
输入数据示例
\`\`\`
`,
          template: true,
        },
        {
          path: "index.ts",
          content: `import { logger } from '../../logger.js';

export function processData(input: Record<string, unknown>): Record<string, unknown> {
  logger.debug('[{{skillName}}] processData called with:', input);

  const processed: Record<string, unknown> = {
    original: input,
    processedAt: Date.now(),
    format: '{{dataFormat}}',
  };

  return {
    success: true,
    result: processed,
  };
}

export function transformData(input: Record<string, unknown>[]): Record<string, unknown>[] {
  logger.debug('[{{skillName}}] transformData called with:', input.length, 'items');

  return input.map((item, index) => ({
    ...item,
    _transformed: true,
    _index: index,
  }));
}

export default {
  name: '{{skillName}}',
  description: '{{skillDescription}}',
  tools: [
    {
      name: '{{skillName}}_process',
      description: '处理数据',
      handler: (args: Record<string, unknown>) => processData(args),
    },
    {
      name: '{{skillName}}_transform',
      description: '转换数据',
      handler: (args: { data: Record<string, unknown>[] }) => transformData(args.data),
    },
  ],
};
`,
          template: true,
        },
      ],
    },
  ];

  return builtins;
}

export function initializeBuiltinTemplates(): void {
  const builtins = getBuiltinTemplates();
  for (const template of builtins) {
    registerTemplate(template);
  }
  logger.info("[TemplateManager] Initialized", builtins.length, "builtin templates");
}
