/**
 * CLI 懒加载注册器
 * 使用占位符延迟加载真正的命令实现
 */

import type { Command } from "commander";

/** 懒加载命令注册参数 */
export type RegisterLazyCommandParams = {
  program: Command;
  name: string;
  description: string;
  options?: readonly {
    flags: string;
    description: string;
  }[];
  removeNames?: string[];
  register: () => Promise<void> | void;
};

/** 从 Commander action 参数中解析选项值 */
function resolveCommandOptionArgs(command: Command): string[] {
  const out: string[] = [];
  
  // Commander 的 options 属性在运行时存在，但 TypeScript 类型可能不完整
  // 使用类型断言访问
  interface CommanderOption {
    attributeName(): string;
    long?: string;
    short?: string;
  }
  
  const options = (command as unknown as { options: CommanderOption[] }).options || [];
  
  for (const option of options) {
    const name = option.attributeName();
    if (typeof command.getOptionValueSource !== "function") {
      continue;
    }
    if (command.getOptionValueSource(name) === "default") {
      continue;
    }
    const flag = option.long ?? option.short;
    if (!flag) {
      continue;
    }
    const value = command.getOptionValue(name);
    if (Array.isArray(value)) {
      for (const item of value) {
        appendOptionValue(out, flag, item);
      }
      continue;
    }
    appendOptionValue(out, flag, value);
  }
  return out;
}

function appendOptionValue(out: string[], flag: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (value === false) {
    if (flag.startsWith("--no-")) {
      out.push(flag);
    }
    return;
  }
  if (value === true) {
    out.push(flag);
    return;
  }
  const arg = stringifyOptionValue(value);
  if (arg !== undefined) {
    out.push(flag, arg);
  }
}

function stringifyOptionValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

/** 从 Commander action 命令获取位置参数 */
function resolveActionArgs(actionCommand: Command | undefined): string[] {
  if (!actionCommand) {
    return [];
  }
  const args = (actionCommand as Command & { args?: string[] }).args;
  return Array.isArray(args) ? args : [];
}

/** 获取命令路径 */
function getCommandPathFromRoot(command: Command | undefined): string[] {
  const path: string[] = [];
  let current = command;
  while (current?.parent) {
    const name = current.name();
    if (name) {
      path.unshift(name);
    }
    current = current.parent;
  }
  return path;
}

/** 找到根命令 */
function findRootCommand(cmd: Command): Command {
  let current: Command = cmd;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

/**
 * 从 action args 重新解析程序
 */
async function reparseProgramFromActionArgs(
  program: Command,
  actionArgs: unknown[],
): Promise<void> {
  const actionArgsArray = actionArgs as unknown[];
  const actionCommand = actionArgsArray[actionArgsArray.length - 1] as Command | undefined;
  const rootProgram = findRootCommand(actionCommand ?? program);
  const rawArgs = (rootProgram as Command & { rawArgs?: string[] }).rawArgs;

  const actionArgsList = resolveActionArgs(actionCommand);
  const parentOptionArgs =
    actionCommand?.parent === program ? resolveCommandOptionArgs(program) : [];
  const commandPath = getCommandPathFromRoot(actionCommand);

  let fallbackArgv: string[];
  if (commandPath.length === 0) {
    fallbackArgv = [...parentOptionArgs, ...actionArgsList];
  } else {
    fallbackArgv = [
      ...commandPath.slice(0, -1),
      ...parentOptionArgs,
      commandPath[commandPath.length - 1],
      ...actionArgsList,
    ];
  }

  const programName = rootProgram.name();
  let parseArgv: string[];

  if (rawArgs && rawArgs.length > 0) {
    parseArgv = rawArgs;
  } else if (programName) {
    parseArgv = [programName, ...fallbackArgv];
  } else {
    parseArgv = fallbackArgv;
  }

  await rootProgram.parseAsync(parseArgv);
}

/** 移除命令树的命令 */
function removeCommandByName(program: Command, name: string): boolean {
  const commands = program.commands as Command[];
  const index = commands.findIndex(
    (cmd) => cmd.name() === name || cmd.aliases().includes(name),
  );
  if (index < 0) {
    return false;
  }
  commands.splice(index, 1);
  return true;
}

/**
 * 注册懒加载命令
 * 创建一个占位符命令，在触发时加载真正的命令实现
 */
export function registerLazyCommand({
  program,
  name,
  description,
  options,
  removeNames,
  register,
}: RegisterLazyCommandParams): void {
  const placeholder = program.command(name).description(description);
  for (const option of options ?? []) {
    placeholder.option(option.flags, option.description);
  }
  placeholder.allowUnknownOption(true);
  placeholder.allowExcessArguments(true);
  placeholder.action(async (...actionArgs) => {
    const actionArgsArray = actionArgs as (Command & { args?: string[] })[];
    const actionCommand = actionArgsArray[actionArgsArray.length - 1];
    if (actionCommand) {
      // Commander 分离占位符的选项值和位置参数，恢复原始顺序
      actionCommand.args = [
        ...resolveCommandOptionArgs(actionCommand),
        ...(actionCommand.args ?? []),
      ];
    }
    const removeSet = new Set<string>(removeNames ?? [name]);
    removeSet.forEach((commandName) => {
      removeCommandByName(program, commandName);
    });
    await register();
    await reparseProgramFromActionArgs(program, actionArgs);
  });
}

/** 命令组占位符 */
export type CommandGroupPlaceholder = {
  name: string;
  description: string;
  options?: readonly CommandGroupPlaceholderOption[];
};

/** 命令组占位符选项 */
export type CommandGroupPlaceholderOption = {
  flags: string;
  description: string;
};

/** 懒加载命令组条目 */
export type CommandGroupEntry = {
  placeholders: readonly CommandGroupPlaceholder[];
  names?: readonly string[];
  register: (program: Command) => Promise<void> | void;
};

/** 获取命令组拥有的所有命令名称 */
export function getCommandGroupNames(entry: CommandGroupEntry): readonly string[] {
  return entry.names ?? entry.placeholders.map((p) => p.name);
}

/** 查找拥有特定命令名的命令组 */
export function findCommandGroupEntry(
  entries: readonly CommandGroupEntry[],
  name: string,
): CommandGroupEntry | undefined {
  return entries.find((entry) => getCommandGroupNames(entry).includes(name));
}

/** 移除命令组拥有的所有占位符/已加载命令 */
function removeCommandGroupNames(program: Command, entry: CommandGroupEntry): void {
  const namesSet = new Set<string>(getCommandGroupNames(entry));
  namesSet.forEach((name) => {
    removeCommandByName(program, name);
  });
}

/**
 * 按名称急切注册一个懒加载命令组
 */
export async function registerCommandGroupByName(
  program: Command,
  entries: readonly CommandGroupEntry[],
  name: string,
): Promise<boolean> {
  const entry = findCommandGroupEntry(entries, name);
  if (!entry) {
    return false;
  }
  removeCommandGroupNames(program, entry);
  await entry.register(program);
  return true;
}

/** 注册懒加载命令组 */
function registerLazyCommandGroup(
  program: Command,
  entry: CommandGroupEntry,
  placeholder: CommandGroupPlaceholder,
): void {
  registerLazyCommand({
    program,
    name: placeholder.name,
    description: placeholder.description,
    options: placeholder.options,
    removeNames: Array.from(new Set(getCommandGroupNames(entry))),
    register: async () => {
      await entry.register(program);
    },
  });
}

/**
 * 注册命令组
 * @param program Commander 程序实例
 * @param entries 命令组条目列表
 * @param params 注册参数
 * @param params.eager 是否急切加载所有命令组
 * @param params.primary 只注册主命令的占位符
 * @param params.registerPrimaryOnly 是否只注册主命令
 */
export function registerCommandGroups(
  program: Command,
  entries: readonly CommandGroupEntry[],
  params: {
    eager: boolean;
    primary: string | null;
    registerPrimaryOnly: boolean;
  },
): void {
  if (params.eager) {
    for (const entry of entries) {
      void entry.register(program);
    }
    return;
  }

  if (params.primary && params.registerPrimaryOnly) {
    const entry = findCommandGroupEntry(entries, params.primary);
    if (entry) {
      const placeholder = entry.placeholders.find((p) => p.name === params.primary);
      if (placeholder) {
        registerLazyCommandGroup(program, entry, placeholder);
      }
    }
    return;
  }

  for (const entry of entries) {
    for (const placeholder of entry.placeholders) {
      registerLazyCommandGroup(program, entry, placeholder);
    }
  }
}
