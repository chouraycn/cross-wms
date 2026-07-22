import { getLogger } from "../../logging/logger.js";

const logger = getLogger();

export type CommandParameter = {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: unknown;
  enum?: string[];
};

export type CommandOutputSpec = {
  type: "text" | "json" | "markdown" | "file";
  description: string;
};

export type SkillCommandSpec = {
  command: string;
  description: string;
  category: string;
  icon?: string;
  examples: string[];
  parameters: CommandParameter[];
  output?: CommandOutputSpec;
  permissions?: string[];
};

export type SkillCommandDispatchSpec = {
  skillName: string;
  commands: SkillCommandSpec[];
  dispatch: "chat" | "mcp" | "tool";
};

export type CommandCategory = {
  id: string;
  name: string;
  description: string;
  icon?: string;
};

export type SearchCommandsOptions = {
  category?: string;
  skillName?: string;
  limit?: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const BUILTIN_CATEGORIES: CommandCategory[] = [
  {
    id: "query",
    name: "查询类",
    description: "查询、搜索、列表等只读操作",
    icon: "🔍",
  },
  {
    id: "action",
    name: "操作类",
    description: "创建、更新、删除等写入操作",
    icon: "⚡",
  },
  {
    id: "utility",
    name: "工具类",
    description: "转换、格式化、验证等辅助工具",
    icon: "🛠️",
  },
  {
    id: "admin",
    name: "管理类",
    description: "配置、权限、系统管理",
    icon: "⚙️",
  },
];

const commandRegistry = new Map<string, SkillCommandDispatchSpec>();
const customCategories = new Map<string, CommandCategory>();

function getRegistryKey(skillName: string): string {
  return skillName.toLowerCase();
}

export function registerCommandSpec(spec: SkillCommandDispatchSpec): void {
  const key = getRegistryKey(spec.skillName);

  for (const cmd of spec.commands) {
    const categoryId = cmd.category;
    if (!isValidCategory(categoryId)) {
      logger.warn(`Command '${cmd.command}' has unknown category '${categoryId}'`);
    }
  }

  commandRegistry.set(key, spec);
  logger.debug(`Registered command specs for skill: ${spec.skillName} (${spec.commands.length} commands)`);
}

export function unregisterCommandSpec(skillName: string): boolean {
  const key = getRegistryKey(skillName);
  const existed = commandRegistry.delete(key);
  if (existed) {
    logger.debug(`Unregistered command specs for skill: ${skillName}`);
  }
  return existed;
}

export function getCommandSpec(skillName: string, command: string): SkillCommandSpec | undefined {
  const key = getRegistryKey(skillName);
  const spec = commandRegistry.get(key);
  if (!spec) return undefined;

  return spec.commands.find((cmd) => cmd.command.toLowerCase() === command.toLowerCase());
}

export function getSkillCommands(skillName: string): SkillCommandSpec[] {
  const key = getRegistryKey(skillName);
  const spec = commandRegistry.get(key);
  return spec ? [...spec.commands] : [];
}

export function getAllCommandSpecs(): SkillCommandDispatchSpec[] {
  return [...commandRegistry.values()];
}

export function listCommandCategories(): CommandCategory[] {
  const custom = [...customCategories.values()];
  return [...BUILTIN_CATEGORIES, ...custom];
}

export function addCommandCategory(category: CommandCategory): void {
  if (BUILTIN_CATEGORIES.some((c) => c.id === category.id)) {
    logger.warn(`Cannot override builtin category: ${category.id}`);
    return;
  }
  customCategories.set(category.id, category);
  logger.debug(`Added custom command category: ${category.id}`);
}

function isValidCategory(categoryId: string): boolean {
  if (BUILTIN_CATEGORIES.some((c) => c.id === categoryId)) return true;
  return customCategories.has(categoryId);
}

export function searchCommands(query: string, options?: SearchCommandsOptions): SkillCommandSpec[] {
  const normalizedQuery = query.toLowerCase().trim();
  const results: SkillCommandSpec[] = [];

  for (const spec of commandRegistry.values()) {
    if (options?.skillName && spec.skillName.toLowerCase() !== options.skillName.toLowerCase()) {
      continue;
    }

    for (const cmd of spec.commands) {
      if (options?.category && cmd.category !== options.category) {
        continue;
      }

      if (!normalizedQuery) {
        results.push(cmd);
        continue;
      }

      const matched =
        cmd.command.toLowerCase().includes(normalizedQuery) ||
        cmd.description.toLowerCase().includes(normalizedQuery) ||
        cmd.examples.some((ex) => ex.toLowerCase().includes(normalizedQuery));

      if (matched) {
        results.push(cmd);
      }
    }
  }

  if (options?.limit && options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}

export function validateCommandParams(
  skillName: string,
  command: string,
  params: Record<string, unknown>,
): ValidationResult {
  const spec = getCommandSpec(skillName, command);
  const errors: string[] = [];

  if (!spec) {
    return {
      valid: false,
      errors: [`Command '${command}' not found for skill '${skillName}'`],
    };
  }

  for (const param of spec.parameters) {
    const value = params[param.name];

    if (param.required && (value === undefined || value === null)) {
      errors.push(`Missing required parameter: '${param.name}'`);
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const typeError = validateParamType(param, value);
    if (typeError) {
      errors.push(typeError);
      continue;
    }

    if (param.enum && param.type === "string" && typeof value === "string") {
      if (!param.enum.includes(value)) {
        errors.push(
          `Parameter '${param.name}' must be one of: ${param.enum.join(", ")}, got '${value}'`,
        );
      }
    }
  }

  const validParamNames = new Set(spec.parameters.map((p) => p.name));
  for (const key of Object.keys(params)) {
    if (!validParamNames.has(key)) {
      errors.push(`Unknown parameter: '${key}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateParamType(param: CommandParameter, value: unknown): string | null {
  switch (param.type) {
    case "string":
      if (typeof value !== "string") {
        return `Parameter '${param.name}' must be a string`;
      }
      break;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) {
        return `Parameter '${param.name}' must be a number`;
      }
      break;
    case "boolean":
      if (typeof value !== "boolean") {
        return `Parameter '${param.name}' must be a boolean`;
      }
      break;
    case "array":
      if (!Array.isArray(value)) {
        return `Parameter '${param.name}' must be an array`;
      }
      break;
    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return `Parameter '${param.name}' must be an object`;
      }
      break;
  }
  return null;
}

export function formatCommandHelp(skillName: string, command: string): string {
  const spec = getCommandSpec(skillName, command);
  if (!spec) {
    return `Command '${command}' not found for skill '${skillName}'`;
  }

  const lines: string[] = [];

  lines.push(`# ${spec.command}`);
  lines.push("");
  lines.push(spec.description);
  lines.push("");

  if (spec.category) {
    const category = listCommandCategories().find((c) => c.id === spec.category);
    const categoryLabel = category ? `${category.icon} ${category.name}` : spec.category;
    lines.push(`**分类:** ${categoryLabel}`);
    lines.push("");
  }

  if (spec.parameters.length > 0) {
    lines.push("## 参数");
    lines.push("");
    for (const param of spec.parameters) {
      const reqMark = param.required ? " (必需)" : "";
      const defaultStr = param.default !== undefined ? ` [默认: ${String(param.default)}]` : "";
      lines.push(`- **${param.name}** (\`${param.type}\`)${reqMark}${defaultStr}: ${param.description}`);
      if (param.enum && param.enum.length > 0) {
        lines.push(`  - 可选值: ${param.enum.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (spec.examples.length > 0) {
    lines.push("## 示例");
    lines.push("");
    for (const example of spec.examples) {
      lines.push(`\`\`\`\n${example}\n\`\`\``);
      lines.push("");
    }
  }

  if (spec.output) {
    lines.push("## 输出");
    lines.push("");
    lines.push(`- **类型:** \`${spec.output.type}\``);
    lines.push(`- **描述:** ${spec.output.description}`);
    lines.push("");
  }

  if (spec.permissions && spec.permissions.length > 0) {
    lines.push("## 所需权限");
    lines.push("");
    for (const perm of spec.permissions) {
      lines.push(`- \`${perm}\``);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

export function clearCommandRegistry(): void {
  commandRegistry.clear();
  customCategories.clear();
  logger.debug("Command registry cleared");
}
