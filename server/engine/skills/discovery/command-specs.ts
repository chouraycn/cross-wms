// Skill command spec helpers expose skill-provided commands to model/tool surfaces.
import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "@cdf-know/normalization-core/string-coerce";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { getLogger } from "../../logging/logger.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { loadEnabledClaudeBundleCommands } from "../../plugins/bundle-commands.js";
import { resolveSkillTelemetrySource } from "../loading/source.js";
import {
  filterWorkspaceSkillEntriesWithOptions,
  loadVisibleWorkspaceSkillEntries,
} from "../loading/workspace.js";
import type { SkillEligibilityContext, SkillCommandSpec, SkillEntry } from "../types.js";
import { resolveEffectiveAgentSkillFilter } from "./agent-filter.js";
import { filterUserInvocableSkillEntries } from "./skill-index.js";

// 重新导出 openclaw 的命令规格类型，保持 barrel 文件
// （discovery/index.ts、skills/index.ts）中
// `export type { SkillCommandSpec, SkillCommandDispatchSpec } from "./command-specs.js"` 可用。
// 以 openclaw 版为准：SkillCommandSpec / SkillCommandDispatchSpec 均来自 ../types.js。
export type { SkillCommandSpec, SkillCommandDispatchSpec } from "../types.js";

const skillsLogger = createSubsystemLogger("skills");
const skillCommandDebugOnce = new Set<string>();
const SKILL_COMMAND_MAX_LENGTH = 32;
const SKILL_COMMAND_FALLBACK = "skill";
const SKILL_COMMAND_DESCRIPTION_MAX_LENGTH = 100;

// De-duplicate noisy skill command diagnostics across large workspace scans.
function debugSkillCommandOnce(
  messageKey: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  if (skillCommandDebugOnce.has(messageKey)) {
    return;
  }
  skillCommandDebugOnce.add(messageKey);
  skillsLogger.debug(message, meta);
}

function traceSkillCommandOnce(
  messageKey: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  if (skillCommandDebugOnce.has(messageKey)) {
    return;
  }
  skillCommandDebugOnce.add(messageKey);
  skillsLogger.trace(message, meta);
}

function sanitizeSkillCommandName(raw: string): string {
  const normalized = normalizeLowercaseStringOrEmpty(raw)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const trimmed = normalized.slice(0, SKILL_COMMAND_MAX_LENGTH);
  return trimmed || SKILL_COMMAND_FALLBACK;
}

function resolveUniqueSkillCommandName(base: string, used: Set<string>): string {
  const normalizedBase = normalizeLowercaseStringOrEmpty(base);
  if (!used.has(normalizedBase)) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const suffix = `_${index}`;
    const maxBaseLength = Math.max(1, SKILL_COMMAND_MAX_LENGTH - suffix.length);
    const trimmedBase = base.slice(0, maxBaseLength);
    const candidate = `${trimmedBase}${suffix}`;
    const candidateKey = normalizeLowercaseStringOrEmpty(candidate);
    if (!used.has(candidateKey)) {
      return candidate;
    }
  }
  return `${base.slice(0, Math.max(1, SKILL_COMMAND_MAX_LENGTH - 2))}_x`;
}

/** Builds user-invocable slash command specs for visible workspace skills. */
export function buildWorkspaceSkillCommandSpecs(
  workspaceDir: string,
  opts?: {
    config?: OpenClawConfig;
    managedSkillsDir?: string;
    bundledSkillsDir?: string;
    entries?: SkillEntry[];
    agentId?: string;
    skillFilter?: string[];
    eligibility?: SkillEligibilityContext;
    reservedNames?: Set<string>;
  },
): SkillCommandSpec[] {
  const effectiveSkillFilter =
    opts?.skillFilter ?? resolveEffectiveAgentSkillFilter(opts?.config, opts?.agentId);
  const eligible = opts?.entries
    ? filterWorkspaceSkillEntriesWithOptions(opts.entries, {
        config: opts?.config,
        skillFilter: effectiveSkillFilter,
        eligibility: opts?.eligibility,
      })
    : loadVisibleWorkspaceSkillEntries(workspaceDir, {
        config: opts?.config,
        managedSkillsDir: opts?.managedSkillsDir,
        bundledSkillsDir: opts?.bundledSkillsDir,
        skillFilter: effectiveSkillFilter,
        eligibility: opts?.eligibility,
      });
  const userInvocable = filterUserInvocableSkillEntries(eligible);
  const used = new Set<string>();
  for (const reserved of opts?.reservedNames ?? []) {
    used.add(normalizeLowercaseStringOrEmpty(reserved));
  }

  const specs: SkillCommandSpec[] = [];
  for (const entry of userInvocable) {
    const rawName = entry.skill.name;
    const base = sanitizeSkillCommandName(rawName);
    if (base !== rawName) {
      traceSkillCommandOnce(
        `sanitize:${rawName}:${base}`,
        `Sanitized skill command name "${rawName}" to "/${base}".`,
        { rawName, sanitized: `/${base}` },
      );
    }
    const unique = resolveUniqueSkillCommandName(base, used);
    if (unique !== base) {
      traceSkillCommandOnce(
        `dedupe:${rawName}:${unique}`,
        `De-duplicated skill command name for "${rawName}" to "/${unique}".`,
        { rawName, deduped: `/${unique}` },
      );
    }
    used.add(normalizeLowercaseStringOrEmpty(unique));
    const rawDescription = entry.skill.description?.trim() || rawName;
    const description =
      rawDescription.length > SKILL_COMMAND_DESCRIPTION_MAX_LENGTH
        ? rawDescription.slice(0, SKILL_COMMAND_DESCRIPTION_MAX_LENGTH - 1) + "…"
        : rawDescription;
    const dispatch = (() => {
      const kindRaw = normalizeLowercaseStringOrEmpty(
        entry.frontmatter?.["command-dispatch"] ?? entry.frontmatter?.["command_dispatch"] ?? "",
      );
      if (!kindRaw || kindRaw !== "tool") {
        return undefined;
      }

      const toolName = (
        entry.frontmatter?.["command-tool"] ??
        entry.frontmatter?.["command_tool"] ??
        ""
      ).trim();
      if (!toolName) {
        debugSkillCommandOnce(
          `dispatch:missingTool:${rawName}`,
          `Skill command "/${unique}" requested tool dispatch but did not provide command-tool. Ignoring dispatch.`,
          { skillName: rawName, command: unique },
        );
        return undefined;
      }

      const argModeRaw = normalizeOptionalLowercaseString(
        entry.frontmatter?.["command-arg-mode"] ?? entry.frontmatter?.["command_arg_mode"] ?? "",
      );
      const argMode = !argModeRaw || argModeRaw === "raw" ? "raw" : null;
      if (!argMode) {
        debugSkillCommandOnce(
          `dispatch:badArgMode:${rawName}:${argModeRaw}`,
          `Skill command "/${unique}" requested tool dispatch but has unknown command-arg-mode. Falling back to raw.`,
          { skillName: rawName, command: unique, argMode: argModeRaw },
        );
      }

      return { kind: "tool", toolName, argMode: "raw" } as const;
    })();

    specs.push({
      name: unique,
      skillName: rawName,
      description,
      skillSource: resolveSkillTelemetrySource(entry.skill),
      ...(dispatch ? { dispatch } : {}),
    });
  }

  const bundleCommands = loadEnabledClaudeBundleCommands({
    workspaceDir,
    cfg: opts?.config,
  });
  for (const entry of bundleCommands) {
    const base = sanitizeSkillCommandName(entry.rawName);
    if (base !== entry.rawName) {
      debugSkillCommandOnce(
        `bundle-sanitize:${entry.rawName}:${base}`,
        `Sanitized bundle command name "${entry.rawName}" to "/${base}".`,
        { rawName: entry.rawName, sanitized: `/${base}` },
      );
    }
    const unique = resolveUniqueSkillCommandName(base, used);
    if (unique !== base) {
      debugSkillCommandOnce(
        `bundle-dedupe:${entry.rawName}:${unique}`,
        `De-duplicated bundle command name for "${entry.rawName}" to "/${unique}".`,
        { rawName: entry.rawName, deduped: `/${unique}` },
      );
    }
    used.add(normalizeLowercaseStringOrEmpty(unique));
    const description =
      entry.description.length > SKILL_COMMAND_DESCRIPTION_MAX_LENGTH
        ? entry.description.slice(0, SKILL_COMMAND_DESCRIPTION_MAX_LENGTH - 1) + "…"
        : entry.description;
    specs.push({
      name: unique,
      skillName: entry.rawName,
      description,
      promptTemplate: entry.promptTemplate,
      sourceFilePath: entry.sourceFilePath,
    });
  }
  return specs;
}

// ============================================================================
// WMS 命令注册表（server 专属实现）
// 以下为 server 端的 WMS 命令规格注册表，用于注册/查询/校验技能命令。
// 注意：WMS 命令规格类型（WmsCommandSpec / WmsCommandDispatchSpec）与 openclaw 的
// SkillCommandSpec / SkillCommandDispatchSpec 形状不同，这里使用独立类型名以避免冲突。
// ============================================================================

const wmsLogger = getLogger();

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

/** WMS 命令规格（注册表中存储的命令形状，与 openclaw 的 SkillCommandSpec 不同）。 */
export type WmsCommandSpec = {
  command: string;
  description: string;
  category: string;
  icon?: string;
  examples: string[];
  parameters: CommandParameter[];
  output?: CommandOutputSpec;
  permissions?: string[];
};

/** WMS 命令调度规格（包含技能名、命令列表与调度方式）。 */
export type WmsCommandDispatchSpec = {
  skillName: string;
  commands: WmsCommandSpec[];
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

const commandRegistry = new Map<string, WmsCommandDispatchSpec>();
const customCategories = new Map<string, CommandCategory>();

function getRegistryKey(skillName: string): string {
  return skillName.toLowerCase();
}

export function registerCommandSpec(spec: WmsCommandDispatchSpec): void {
  const key = getRegistryKey(spec.skillName);

  for (const cmd of spec.commands) {
    const categoryId = cmd.category;
    if (!isValidCategory(categoryId)) {
      wmsLogger.warn(`Command '${cmd.command}' has unknown category '${categoryId}'`);
    }
  }

  commandRegistry.set(key, spec);
  wmsLogger.debug(`Registered command specs for skill: ${spec.skillName} (${spec.commands.length} commands)`);
}

export function unregisterCommandSpec(skillName: string): boolean {
  const key = getRegistryKey(skillName);
  const existed = commandRegistry.delete(key);
  if (existed) {
    wmsLogger.debug(`Unregistered command specs for skill: ${skillName}`);
  }
  return existed;
}

export function getCommandSpec(skillName: string, command: string): WmsCommandSpec | undefined {
  const key = getRegistryKey(skillName);
  const spec = commandRegistry.get(key);
  if (!spec) return undefined;

  return spec.commands.find((cmd) => cmd.command.toLowerCase() === command.toLowerCase());
}

export function getSkillCommands(skillName: string): WmsCommandSpec[] {
  const key = getRegistryKey(skillName);
  const spec = commandRegistry.get(key);
  return spec ? [...spec.commands] : [];
}

export function getAllCommandSpecs(): WmsCommandDispatchSpec[] {
  return [...commandRegistry.values()];
}

export function listCommandCategories(): CommandCategory[] {
  const custom = [...customCategories.values()];
  return [...BUILTIN_CATEGORIES, ...custom];
}

export function addCommandCategory(category: CommandCategory): void {
  if (BUILTIN_CATEGORIES.some((c) => c.id === category.id)) {
    wmsLogger.warn(`Cannot override builtin category: ${category.id}`);
    return;
  }
  customCategories.set(category.id, category);
  wmsLogger.debug(`Added custom command category: ${category.id}`);
}

function isValidCategory(categoryId: string): boolean {
  if (BUILTIN_CATEGORIES.some((c) => c.id === categoryId)) return true;
  return customCategories.has(categoryId);
}

export function searchCommands(query: string, options?: SearchCommandsOptions): WmsCommandSpec[] {
  const normalizedQuery = query.toLowerCase().trim();
  const results: WmsCommandSpec[] = [];

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
  wmsLogger.debug("Command registry cleared");
}
