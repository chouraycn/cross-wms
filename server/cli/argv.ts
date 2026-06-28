/**
 * CLI argv 工具函数
 * 用于根选项、help/version 检测和命令路径解析
 */

const HELP_FLAGS = new Set(["-h", "--help"]);
const VERSION_FLAGS = new Set(["-V", "--version"]);
const FLAG_TERMINATOR = "--";

/** 根选项参数 */
export type RootOption = {
  flags: string;
  description: string;
};

/** 根选项列表 */
export const ROOT_OPTIONS: readonly RootOption[] = [
  { flags: "--no-color", description: "禁用颜色输出" },
  { flags: "--log-level <level>", description: "设置日志级别 (debug|info|warn|error)" },
  { flags: "--json", description: "JSON 输出格式" },
  { flags: "--quiet", description: "静默模式" },
  { flags: "--verbose", description: "详细输出" },
];

/**
 * 检测 argv 是否包含 help 或 version 标志
 */
export function hasHelpOrVersion(argv: string[]): boolean {
  return argv.some((arg) => HELP_FLAGS.has(arg) || VERSION_FLAGS.has(arg));
}

/**
 * 检测是否是对 help 或 version 的调用
 */
export function isHelpOrVersionInvocation(argv: string[]): boolean {
  const args = argv.slice(2);
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || arg === FLAG_TERMINATOR) {
      break;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    positionals.push(arg);
    if (HELP_FLAGS.has(arg) || VERSION_FLAGS.has(arg)) {
      return true;
    }
  }

  return false;
}

/**
 * 获取主命令名称
 */
export function getPrimaryCommand(argv: string[]): string | null {
  const path = getCommandPath(argv, 1);
  return path.length > 0 ? path[0] : null;
}

/**
 * 获取命令路径
 */
export function getCommandPath(argv: string[], depth = 2): string[] {
  const args = argv.slice(2);
  const path: string[] = [];

  for (const arg of args) {
    if (!arg) {
      continue;
    }
    if (arg === FLAG_TERMINATOR) {
      break;
    }
    if (arg.startsWith("-")) {
      // 跳过选项
      continue;
    }
    path.push(arg);
    if (path.length >= depth) {
      break;
    }
  }

  return path;
}

/**
 * 获取标志值
 */
export function getFlagValue(argv: string[], name: string): string | null | undefined {
  const args = argv.slice(2);
  let value: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === FLAG_TERMINATOR) {
      break;
    }
    if (arg === name) {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        return null;
      }
      value = next;
      i += 1;
      continue;
    }
    if (arg.startsWith(`${name}=`)) {
      const assigned = arg.slice(name.length + 1);
      if (!assigned) {
        return null;
      }
      value = assigned;
    }
  }

  return value;
}

/**
 * 检测是否有特定标志
 */
export function hasFlag(argv: string[], name: string): boolean {
  const args = argv.slice(2);
  for (const arg of args) {
    if (arg === FLAG_TERMINATOR) {
      break;
    }
    if (arg === name) {
      return true;
    }
  }
  return false;
}

/** 标准化根 no-color 参数 */
export function normalizeRootNoColorArgv(argv: string[]): string[] {
  const prefix = argv.slice(0, 2);
  const args = argv.slice(2);
  const movedNoColorArgs: string[] = [];
  const nextArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === FLAG_TERMINATOR) {
      nextArgs.push(...args.slice(i));
      break;
    }
    if (arg === "--no-color") {
      movedNoColorArgs.push(arg);
      continue;
    }
    nextArgs.push(arg);
  }

  if (movedNoColorArgs.length === 0) {
    return argv;
  }
  return [...prefix, ...movedNoColorArgs, ...nextArgs];
}

/** 标准化根 log-level 参数 */
export function normalizeRootLogLevelArgv(argv: string[]): string[] {
  const prefix = argv.slice(0, 2);
  const args = argv.slice(2);
  const movedLogLevelArgs: string[] = [];
  const nextArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === FLAG_TERMINATOR) {
      nextArgs.push(...args.slice(i));
      break;
    }
    if (arg.startsWith("--log-level=")) {
      movedLogLevelArgs.push(arg);
      continue;
    }
    if (arg === "--log-level") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        movedLogLevelArgs.push(arg, next);
        i += 1;
      } else {
        movedLogLevelArgs.push(arg);
      }
      continue;
    }
    nextArgs.push(arg);
  }

  if (movedLogLevelArgs.length === 0) {
    return argv;
  }
  return [...prefix, ...movedLogLevelArgs, ...nextArgs];
}

/** 标准化 help 命令参数 */
export function normalizeHelpCommandArgv(argv: string[]): string[] {
  const args = argv.slice(2);
  if (args.length < 2 || args[0] !== "help") {
    return argv;
  }
  return argv;
}

/** 解析根选项结果 */
export type ParseRootOptionsResult = {
  noColor: boolean;
  logLevel: string | null;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  remainingArgs: string[];
};

/**
 * 解析根选项
 */
export function parseRootOptions(argv: string[]): ParseRootOptionsResult {
  const args = argv.slice(2);
  const result: ParseRootOptionsResult = {
    noColor: false,
    logLevel: null,
    json: false,
    quiet: false,
    verbose: false,
    remainingArgs: [],
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }
    if (arg === FLAG_TERMINATOR) {
      result.remainingArgs.push(...args.slice(i));
      break;
    }
    if (arg === "--no-color") {
      result.noColor = true;
      continue;
    }
    if (arg.startsWith("--log-level=")) {
      result.logLevel = arg.slice("--log-level=".length);
      continue;
    }
    if (arg === "--log-level") {
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        result.logLevel = next;
        i += 1;
      }
      continue;
    }
    if (arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--quiet") {
      result.quiet = true;
      continue;
    }
    if (arg === "--verbose") {
      result.verbose = true;
      continue;
    }
    result.remainingArgs.push(arg);
  }

  return result;
}

/**
 * 构建解析用的 argv
 */
export function buildParseArgv(params: {
  programName?: string;
  rawArgs?: string[];
  fallbackArgv?: string[];
}): string[] {
  const baseArgv =
    params.rawArgs && params.rawArgs.length > 0
      ? params.rawArgs
      : params.fallbackArgv && params.fallbackArgv.length > 0
        ? params.fallbackArgv
        : process.argv;

  const programName = params.programName ?? "";
  const normalizedArgv =
    programName && baseArgv[0] === programName
      ? baseArgv.slice(1)
      : baseArgv[0]?.endsWith("cross-wms") || baseArgv[0]?.endsWith("crosswms")
        ? baseArgv.slice(1)
        : baseArgv;

  if (normalizedArgv.length >= 2) {
    return normalizedArgv;
  }
  return ["node", programName || "cross-wms", ...normalizedArgv];
}
