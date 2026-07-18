export type CommandArgDefinition = {
  name: string;
  description?: string;
  required?: boolean;
  captureRemaining?: boolean;
  choices?: string[] | ((ctx: unknown) => string[]);
};

export type CommandArgValues = Record<string, string | undefined>;

export type CommandArgs = {
  raw: string;
  values?: CommandArgValues;
};

export type ChatCommandDefinition = {
  key: string;
  name: string;
  description: string;
  aliases?: string[];
  scope?: 'text' | 'global' | 'session';
  acceptsArgs?: boolean;
  args?: CommandArgDefinition[];
  argsParsing?: 'positional' | 'none';
  formatArgs?: (values: CommandArgValues) => string | undefined;
  handler?: (ctx: unknown, args?: CommandArgs) => Promise<unknown> | unknown;
};

export type CommandDetection = {
  commandName: string;
  argsText: string;
  hasSlashPrefix: boolean;
};

const commands: Map<string, ChatCommandDefinition> = new Map();
const aliasMap: Map<string, string> = new Map();

export function registerCommand(def: ChatCommandDefinition): void {
  commands.set(def.key, def);
  aliasMap.set(def.name.toLowerCase(), def.key);
  if (def.aliases) {
    for (const alias of def.aliases) {
      aliasMap.set(alias.toLowerCase(), def.key);
    }
  }
}

export function unregisterCommand(key: string): void {
  const def = commands.get(key);
  if (!def) return;
  commands.delete(key);
  aliasMap.delete(def.name.toLowerCase());
  if (def.aliases) {
    for (const alias of def.aliases) {
      aliasMap.delete(alias.toLowerCase());
    }
  }
}

export function getCommand(key: string): ChatCommandDefinition | undefined {
  return commands.get(key);
}

export function getCommandByName(name: string): ChatCommandDefinition | undefined {
  const key = aliasMap.get(name.toLowerCase());
  return key ? commands.get(key) : undefined;
}

export function listCommands(): ChatCommandDefinition[] {
  return Array.from(commands.values());
}

export function clearCommands(): void {
  commands.clear();
  aliasMap.clear();
}

export function isCommandMessage(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith('/');
}

export function detectCommand(raw: string): CommandDetection | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/')) return null;

  const withoutSlash = trimmed.slice(1);
  const firstSpace = withoutSlash.search(/\s/);
  let commandName: string;
  let argsText: string;

  if (firstSpace === -1) {
    commandName = withoutSlash;
    argsText = '';
  } else {
    commandName = withoutSlash.slice(0, firstSpace);
    argsText = withoutSlash.slice(firstSpace + 1).trim();
  }

  if (!commandName) return null;

  return {
    commandName: commandName.toLowerCase(),
    argsText,
    hasSlashPrefix: true,
  };
}

export function parseCommandArgs(
  command: ChatCommandDefinition,
  raw?: string,
): CommandArgs | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  if (!command.args || command.argsParsing === 'none') {
    return { raw: trimmed };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const values: CommandArgValues = {};
  let index = 0;

  for (const def of command.args) {
    if (index >= tokens.length) break;
    if (def.captureRemaining) {
      values[def.name] = tokens.slice(index).join(' ');
      break;
    }
    values[def.name] = tokens[index];
    index += 1;
  }

  return { raw: trimmed, values };
}

export function serializeCommandArgs(
  command: ChatCommandDefinition,
  args?: CommandArgs,
): string | undefined {
  if (!args) return undefined;
  const raw = args.raw?.trim();
  if (raw) return raw;
  if (!args.values || !command.args) return undefined;
  if (command.formatArgs) return command.formatArgs(args.values);

  const parts: string[] = [];
  for (const def of command.args) {
    const value = args.values[def.name];
    if (value == null) continue;
    const rendered = typeof value === 'string' ? value.trim() : String(value);
    if (!rendered) continue;
    parts.push(rendered);
    if (def.captureRemaining) break;
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export function buildCommandText(commandName: string, args?: string): string {
  const trimmedArgs = args?.trim();
  return trimmedArgs ? `/${commandName} ${trimmedArgs}` : `/${commandName}`;
}

export function buildCommandTextFromArgs(
  command: ChatCommandDefinition,
  args?: CommandArgs,
): string {
  return buildCommandText(command.name, serializeCommandArgs(command, args));
}
