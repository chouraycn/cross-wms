/**
 * Slash Command System
 * Slash 命令系统 - 注册、解析、执行 Slash 命令
 */

export type CommandScope = "chat" | "session" | "global" | "admin";

export interface CommandArgDefinition {
  name: string;
  description: string;
  type: "string" | "number" | "boolean" | "enum";
  required?: boolean;
  defaultValue?: unknown;
  choices?: Array<{ value: string; label: string }>;
}

export interface ChatCommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  category:
    | "model"
    | "session"
    | "utility"
    | "debug"
    | "agent"
    | "thinking"
    | "doctor"
    | "status"
    | "onboard"
    | "configure";
  scope: CommandScope | CommandScope[];
  args?: CommandArgDefinition[];
  enabledByDefault?: boolean;
  hidden?: boolean;
  icon?: string;
  examples?: string[];
}

export interface CommandArgs {
  [key: string]: unknown;
}

export interface CommandExecutionContext {
  sessionKey: string;
  userId?: string;
  message: string;
  args: CommandArgs;
  rawArgs: string;
  timestamp: number;
}

export interface CommandExecutionResult {
  ok: boolean;
  message?: string;
  data?: unknown;
  error?: string;
  actions?: Array<{
    type: "navigate" | "open_modal" | "show_toast" | "set_model" | "clear_session";
    payload?: unknown;
  }>;
}

export type CommandHandler = (
  context: CommandExecutionContext,
) => Promise<CommandExecutionResult> | CommandExecutionResult;

interface RegisteredCommand extends ChatCommandDefinition {
  handler: CommandHandler;
}

class CommandRegistry {
  private readonly commands = new Map<string, RegisteredCommand>();
  private readonly aliases = new Map<string, string>();

  register(definition: ChatCommandDefinition, handler: CommandHandler): void {
    const cmd: RegisteredCommand = {
      ...definition,
      enabledByDefault: definition.enabledByDefault ?? true,
      handler,
    };
    this.commands.set(definition.name.toLowerCase(), cmd);

    if (definition.aliases) {
      for (const alias of definition.aliases) {
        this.aliases.set(alias.toLowerCase(), definition.name.toLowerCase());
      }
    }
  }

  unregister(name: string): boolean {
    const lowerName = name.toLowerCase();
    const cmd = this.commands.get(lowerName);
    if (!cmd) return false;

    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        this.aliases.delete(alias.toLowerCase());
      }
    }
    return this.commands.delete(lowerName);
  }

  get(name: string): RegisteredCommand | undefined {
    const lowerName = name.toLowerCase().replace(/^\//, "");
    const canonical = this.aliases.get(lowerName) ?? lowerName;
    return this.commands.get(canonical);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  list(options?: {
    category?: string;
    scope?: CommandScope;
    includeHidden?: boolean;
  }): RegisteredCommand[] {
    let result = Array.from(this.commands.values());

    if (options?.category) {
      result = result.filter((c) => c.category === options.category);
    }

    if (options?.scope) {
      result = result.filter((c) => {
        if (Array.isArray(c.scope)) {
          return c.scope.includes(options.scope!);
        }
        return c.scope === options.scope;
      });
    }

    if (!options?.includeHidden) {
      result = result.filter((c) => !c.hidden);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  listCategories(): string[] {
    const categories = new Set<string>();
    for (const cmd of this.commands.values()) {
      categories.add(cmd.category);
    }
    return Array.from(categories).sort();
  }

  async execute(
    commandText: string,
    context: Omit<CommandExecutionContext, "args" | "rawArgs">,
  ): Promise<CommandExecutionResult> {
    const parsed = this.parseCommand(commandText);
    if (!parsed) {
      return {
        ok: false,
        error: "Invalid command format",
      };
    }

    const cmd = this.get(parsed.name);
    if (!cmd) {
      return {
        ok: false,
        error: `Unknown command: /${parsed.name}`,
      };
    }

    const args = this.parseArgs(parsed.argsText, cmd);

    const execContext: CommandExecutionContext = {
      ...context,
      args,
      rawArgs: parsed.argsText,
    };

    try {
      return await cmd.handler(execContext);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseCommand(text: string): { name: string; argsText: string } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) {
      return null;
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const name = parts[0];
    const argsText = parts.slice(1).join(" ");

    if (!name) {
      return null;
    }

    return { name, argsText };
  }

  private parseArgs(argsText: string, cmd: RegisteredCommand): CommandArgs {
    const result: CommandArgs = {};
    const argDefs = cmd.args ?? [];

    if (argsText.trim() === "") {
      for (const arg of argDefs) {
        if (arg.defaultValue !== undefined) {
          result[arg.name] = arg.defaultValue;
        }
      }
      return result;
    }

    // 简单的空格分割解析
    const tokens = this.tokenizeArgs(argsText);
    let tokenIndex = 0;

    for (const arg of argDefs) {
      if (tokenIndex >= tokens.length) {
        if (arg.required && arg.defaultValue === undefined) {
          throw new Error(`Missing required argument: ${arg.name}`);
        }
        if (arg.defaultValue !== undefined) {
          result[arg.name] = arg.defaultValue;
        }
        continue;
      }

      const token = tokens[tokenIndex++];
      result[arg.name] = this.coerceArg(token, arg);
    }

    return result;
  }

  private tokenizeArgs(text: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (inQuotes) {
        if (char === quoteChar) {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"' || char === "'") {
        inQuotes = true;
        quoteChar = char;
      } else if (char === " " || char === "\t") {
        if (current.length > 0) {
          tokens.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      tokens.push(current);
    }

    return tokens;
  }

  private coerceArg(value: string, def: CommandArgDefinition): unknown {
    switch (def.type) {
      case "number":
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new Error(`Invalid number for ${def.name}: ${value}`);
        }
        return num;
      case "boolean":
        const lower = value.toLowerCase();
        if (lower === "true" || lower === "1" || lower === "yes" || lower === "on") {
          return true;
        }
        if (lower === "false" || lower === "0" || lower === "no" || lower === "off") {
          return false;
        }
        throw new Error(`Invalid boolean for ${def.name}: ${value}`);
      case "enum":
        if (def.choices && !def.choices.some((c) => c.value === value)) {
          throw new Error(
            `Invalid value for ${def.name}: ${value}. Valid values: ${def.choices.map((c) => c.value).join(", ")}`,
          );
        }
        return value;
      case "string":
      default:
        return value;
    }
  }

  clear(): void {
    this.commands.clear();
    this.aliases.clear();
  }

  size(): number {
    return this.commands.size;
  }
}

const COMMAND_REGISTRY_INSTANCE = new CommandRegistry();

export function getCommandRegistry(): CommandRegistry {
  return COMMAND_REGISTRY_INSTANCE;
}

export function registerCommand(
  definition: ChatCommandDefinition,
  handler: CommandHandler,
): void {
  COMMAND_REGISTRY_INSTANCE.register(definition, handler);
}

export function unregisterCommand(name: string): boolean {
  return COMMAND_REGISTRY_INSTANCE.unregister(name);
}

export function executeCommand(
  commandText: string,
  context: Omit<CommandExecutionContext, "args" | "rawArgs">,
): Promise<CommandExecutionResult> {
  return COMMAND_REGISTRY_INSTANCE.execute(commandText, context);
}

export function listCommands(
  options?: Parameters<CommandRegistry["list"]>[0],
): RegisteredCommand[] {
  return COMMAND_REGISTRY_INSTANCE.list(options);
}

export function resetCommandRegistryForTests(): void {
  COMMAND_REGISTRY_INSTANCE.clear();
}

export type { RegisteredCommand };
