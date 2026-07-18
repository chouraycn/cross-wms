// 解包 shell wrapper 以便审批策略可以检查内联命令。
// 降级实现：从 openclaw/src/infra/shell-wrapper-resolution.ts 直接移植，
// - normalizeLowercaseStringOrEmpty 使用本地 string-coerce.js 替代 @openclaw/normalization-core/string-coerce
// - 其余依赖（dispatch-wrapper-resolution、exec-wrapper-tokens、shell-inline-command）使用本地模块
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import {
  MAX_DISPATCH_WRAPPER_DEPTH,
  hasDispatchEnvManipulation,
  unwrapKnownDispatchWrapperInvocation,
} from "./dispatch-wrapper-resolution.js";
import { normalizeExecutableToken } from "./exec-wrapper-tokens.js";
import {
  hasFishAttachedCommandOption,
  hasFishInitCommandOption,
  hasPosixInteractiveStartupBeforeInlineCommand,
  hasPosixLoginStartupBeforeInlineCommand,
  POSIX_INLINE_COMMAND_FLAGS,
  resolveInlineCommandMatch,
  resolvePowerShellInlineCommandMatch,
} from "./shell-inline-command.js";

// Shell wrapper 解包解包 dispatch wrapper 和 shell 多路复用器，
// 以便审批策略可以推理实际运行的内联命令。
const POSIX_SHELL_WRAPPER_NAMES = ["ash", "bash", "dash", "fish", "ksh", "sh", "zsh"] as const;
const WINDOWS_CMD_WRAPPER_NAMES = ["cmd"] as const;
const POWERSHELL_WRAPPER_NAMES = ["powershell", "pwsh"] as const;
const SHELL_MULTIPLEXER_WRAPPER_NAMES = ["busybox", "toybox"] as const;

function withWindowsExeAliases(names: readonly string[]): string[] {
  const expanded = new Set<string>();
  for (const name of names) {
    expanded.add(name);
    expanded.add(`${name}.exe`);
  }
  return Array.from(expanded);
}

export const POSIX_SHELL_WRAPPERS = new Set(POSIX_SHELL_WRAPPER_NAMES);
export const POWERSHELL_WRAPPERS = new Set(withWindowsExeAliases(POWERSHELL_WRAPPER_NAMES));

const POSIX_SHELL_WRAPPER_CANONICAL = new Set<string>(POSIX_SHELL_WRAPPER_NAMES);
const WINDOWS_CMD_WRAPPER_CANONICAL = new Set<string>(WINDOWS_CMD_WRAPPER_NAMES);
const POWERSHELL_WRAPPER_CANONICAL = new Set<string>(POWERSHELL_WRAPPER_NAMES);
const SHELL_MULTIPLEXER_WRAPPER_CANONICAL = new Set<string>(SHELL_MULTIPLEXER_WRAPPER_NAMES);
const SHELL_WRAPPER_CANONICAL = new Set<string>([
  ...POSIX_SHELL_WRAPPER_NAMES,
  ...WINDOWS_CMD_WRAPPER_NAMES,
  ...POWERSHELL_WRAPPER_NAMES,
]);
const LOGIN_STARTUP_SHELL_WRAPPER_CANONICAL = new Set<string>(POSIX_SHELL_WRAPPER_NAMES);

type ShellWrapperKind = "posix" | "cmd" | "powershell";

type ShellWrapperSpec = {
  kind: ShellWrapperKind;
  names: ReadonlySet<string>;
};

const SHELL_WRAPPER_SPECS: ReadonlyArray<ShellWrapperSpec> = [
  { kind: "posix", names: POSIX_SHELL_WRAPPER_CANONICAL },
  { kind: "cmd", names: WINDOWS_CMD_WRAPPER_CANONICAL },
  { kind: "powershell", names: POWERSHELL_WRAPPER_CANONICAL },
];

type ShellWrapperCommand = {
  isWrapper: boolean;
  command: string | null;
};

type ShellWrapperCandidate<TState> = {
  argv: string[];
  token0: string;
  state: TState;
};

function resolveShellWrapperCandidate<TState>(params: {
  argv: string[];
  depth: number;
  state: TState;
  onDispatchUnwrap?: (state: TState, wrappedArgv: string[]) => TState;
}): ShellWrapperCandidate<TState> | null {
  if (!isWithinDispatchClassificationDepth(params.depth)) {
    return null;
  }

  const token0 = params.argv[0]?.trim();
  if (!token0) {
    return null;
  }

  const dispatchUnwrap = unwrapKnownDispatchWrapperInvocation(params.argv);
// @ts-ignore: stub type mismatch (openclaw port)
  if (dispatchUnwrap.kind === "blocked") {
    return null;
  }
// @ts-ignore: stub type mismatch (openclaw port)
  if (dispatchUnwrap.kind === "unwrapped") {
    return resolveShellWrapperCandidate({
      ...params,
// @ts-ignore: stub type mismatch (openclaw port)
      argv: dispatchUnwrap.argv,
      depth: params.depth + 1,
      state: params.onDispatchUnwrap?.(params.state, params.argv) ?? params.state,
    });
  }

  const shellMultiplexerUnwrap = unwrapKnownShellMultiplexerInvocation(params.argv);
  if (shellMultiplexerUnwrap.kind === "blocked") {
    return null;
  }
  if (shellMultiplexerUnwrap.kind === "unwrapped") {
    return resolveShellWrapperCandidate({
      ...params,
      argv: shellMultiplexerUnwrap.argv,
      depth: params.depth + 1,
    });
  }

  return { argv: params.argv, token0, state: params.state };
}

function resolveShellWrapperSpecAndArgvInternal(
  argv: string[],
  depth: number,
): { argv: string[]; wrapper: ShellWrapperSpec; payload: string } | null {
  const candidate = resolveShellWrapperCandidate({ argv, depth, state: null });
  if (!candidate) {
    return null;
  }

  const wrapper = findShellWrapperSpec(normalizeExecutableToken(candidate.token0));
  if (!wrapper) {
    return null;
  }

  const payload = extractShellWrapperPayload(candidate.argv, wrapper);
  if (!payload) {
    return null;
  }

  return { argv: candidate.argv, wrapper, payload };
}

function isWithinDispatchClassificationDepth(depth: number): boolean {
// @ts-ignore: stub type mismatch (openclaw port)
  return depth <= MAX_DISPATCH_WRAPPER_DEPTH;
}

/** 当可执行文件 token 命名了受支持的 shell wrapper 时返回 true。 */
export function isShellWrapperExecutable(token: string): boolean {
  return SHELL_WRAPPER_CANONICAL.has(normalizeExecutableToken(token));
}

function isShellWrapperInvocationInternal(argv: string[], depth: number): boolean {
  const candidate = resolveShellWrapperCandidate({ argv, depth, state: null });
  return candidate ? isShellWrapperExecutable(candidate.token0) : false;
}

/** 当 argv 解析为 shell wrapper 调用时返回 true。 */
export function isShellWrapperInvocation(argv: string[]): boolean {
  return isShellWrapperInvocationInternal(argv, 0);
}

function normalizeRawCommand(rawCommand?: string | null): string | null {
  const trimmed = rawCommand?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function findShellWrapperSpec(baseExecutable: string): ShellWrapperSpec | null {
  for (const spec of SHELL_WRAPPER_SPECS) {
    if (spec.names.has(baseExecutable)) {
      return spec;
    }
  }
  return null;
}

type ShellMultiplexerUnwrapResult =
  | { kind: "not-wrapper" }
  | { kind: "blocked"; wrapper: string }
  | { kind: "unwrapped"; wrapper: string; argv: string[] };

/** 解包 busybox/toybox shell applet 或对模糊 applet 关闭失败。 */
export function unwrapKnownShellMultiplexerInvocation(
  argv: string[],
): ShellMultiplexerUnwrapResult {
  const token0 = argv[0]?.trim();
  if (!token0) {
    return { kind: "not-wrapper" };
  }
  const wrapper = normalizeExecutableToken(token0);
  if (!SHELL_MULTIPLEXER_WRAPPER_CANONICAL.has(wrapper)) {
    return { kind: "not-wrapper" };
  }

  let appletIndex = 1;
  if (argv[appletIndex]?.trim() === "--") {
    appletIndex += 1;
  }
  const applet = argv[appletIndex]?.trim();
  if (!applet || !isShellWrapperExecutable(applet)) {
    return { kind: "blocked", wrapper };
  }

  const unwrapped = argv.slice(appletIndex);
  if (unwrapped.length === 0) {
    return { kind: "blocked", wrapper };
  }
  return { kind: "unwrapped", wrapper, argv: unwrapped };
}

function extractPosixShellInlineCommand(argv: string[]): string | null {
  return extractInlineCommandByFlags(argv, POSIX_INLINE_COMMAND_FLAGS, { allowCombinedC: true });
}

function extractCmdInlineCommand(argv: string[]): string | null {
  const idx = argv.findIndex((item) => {
    const token = normalizeLowercaseStringOrEmpty(item);
    return token === "/c" || token === "/k" || token === "-c" || token === "-k";
  });
  if (idx === -1) {
    return null;
  }
  const tail = argv.slice(idx + 1);
  if (tail.length === 0) {
    return null;
  }
  const cmd = tail.join(" ").trim();
  return cmd.length > 0 ? cmd : null;
}

function extractPowerShellInlineCommand(argv: string[]): string | null {
  return resolvePowerShellInlineCommandMatch(argv).command;
}

function extractInlineCommandByFlags(
  argv: string[],
  flags: ReadonlySet<string>,
  options: { allowCombinedC?: boolean } = {},
): string | null {
  return resolveInlineCommandMatch(argv, flags, options).command;
}

function extractShellWrapperPayload(argv: string[], spec: ShellWrapperSpec): string | null {
  switch (spec.kind) {
    case "posix":
      return extractPosixShellInlineCommand(argv);
    case "cmd":
      return extractCmdInlineCommand(argv);
    case "powershell":
      return extractPowerShellInlineCommand(argv);
  }
  throw new Error("Unsupported shell wrapper kind");
}

function isLegacyLoginInlineForm(argv: string[]): boolean {
  return argv[1]?.trim() === "-lc";
}

function isLegacyShLoginInlineForm(argv: string[], baseExecutable: string): boolean {
  return baseExecutable === "sh" && isLegacyLoginInlineForm(argv);
}

function formatShellWrapperArgv(argv: string[]): string {
  return argv
    .map((arg) => {
      if (arg.length === 0) {
        return '""';
      }
      return /\s|"/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
    })
    .join(" ");
}

function startupWrapperRequiresFullArgv(params: {
  argv: string[];
  spec: ShellWrapperSpec;
  baseExecutable: string;
  includeLegacyLoginInlineForm: boolean;
}): boolean {
  if (params.spec.kind !== "posix") {
    return false;
  }
  if (params.baseExecutable === "fish" && hasFishInitCommandOption(params.argv)) {
    return true;
  }
  if (
    LOGIN_STARTUP_SHELL_WRAPPER_CANONICAL.has(params.baseExecutable) &&
    hasPosixLoginStartupBeforeInlineCommand(params.argv, POSIX_INLINE_COMMAND_FLAGS)
  ) {
    return (
      params.includeLegacyLoginInlineForm ||
      !isLegacyShLoginInlineForm(params.argv, params.baseExecutable)
    );
  }
  return hasPosixInteractiveStartupBeforeInlineCommand(params.argv, POSIX_INLINE_COMMAND_FLAGS);
}

function hasEnvManipulationBeforeShellWrapperInternal(
  argv: string[],
  depth: number,
  envManipulationSeen: boolean,
): boolean {
  const candidate = resolveShellWrapperCandidate({
    argv,
    depth,
    state: envManipulationSeen,
// @ts-ignore: stub type mismatch (openclaw port)
    onDispatchUnwrap: (state, wrappedArgv) => state || hasDispatchEnvManipulation(wrappedArgv),
  });
  if (!candidate) {
    return false;
  }

  const wrapper = findShellWrapperSpec(normalizeExecutableToken(candidate.token0));
  if (!wrapper) {
    return false;
  }
  const payload = extractShellWrapperPayload(candidate.argv, wrapper);
  if (!payload) {
    return false;
  }
  return candidate.state;
}

/** 当 dispatch wrapper 在 shell wrapper 之前设置 env 时返回 true。 */
export function hasEnvManipulationBeforeShellWrapper(argv: string[]): boolean {
  return hasEnvManipulationBeforeShellWrapperInternal(argv, 0, false);
}

function extractShellWrapperCommandInternal(
  argv: string[],
  rawCommand: string | null,
  depth: number,
): ShellWrapperCommand {
  const candidate = resolveShellWrapperCandidate({ argv, depth, state: null });
  if (!candidate) {
    return { isWrapper: false, command: null };
  }

  const baseExecutable = normalizeExecutableToken(candidate.token0);
  const wrapper = findShellWrapperSpec(baseExecutable);
  if (!wrapper) {
    return { isWrapper: false, command: null };
  }
  const payload = extractShellWrapperPayload(candidate.argv, wrapper);
  if (!payload) {
    return { isWrapper: false, command: null };
  }
  if (
    wrapper.kind === "posix" &&
    baseExecutable === "fish" &&
    hasFishAttachedCommandOption(candidate.argv)
  ) {
    return { isWrapper: true, command: null };
  }
  const rawMatchesPayload = rawCommand === payload;
  const rawMatchesCanonicalArgv = rawCommand === formatShellWrapperArgv(candidate.argv);
  const allowLegacyShLoginPayloadBinding =
    isLegacyShLoginInlineForm(candidate.argv, baseExecutable) &&
    (rawMatchesPayload || rawMatchesCanonicalArgv);
  if (
    startupWrapperRequiresFullArgv({
      argv: candidate.argv,
      spec: wrapper,
      baseExecutable,
      includeLegacyLoginInlineForm: !allowLegacyShLoginPayloadBinding,
    })
  ) {
    return { isWrapper: true, command: null };
  }

  const resolved = resolveShellWrapperSpecAndArgvInternal(candidate.argv, depth);
  if (!resolved) {
    return { isWrapper: false, command: null };
  }

  return {
    isWrapper: true,
    command: rawMatchesCanonicalArgv ? resolved.payload : (rawCommand ?? resolved.payload),
  };
}

/** 解析应该为 shell 执行传输的 argv 段。 */
export function resolveShellWrapperTransportArgv(argv: string[]): string[] | null {
  return resolveShellWrapperSpecAndArgvInternal(argv, 0)?.argv ?? null;
}

/** 从 shell wrapper argv 中提取原始内联命令 payload。 */
export function extractShellWrapperInlineCommand(argv: string[]): string | null {
  return resolveShellWrapperSpecAndArgvInternal(argv, 0)?.payload ?? null;
}

/** 仅当可以安全绑定到原始命令文本时提取命令 payload。 */
export function extractBindableShellWrapperInlineCommand(
  argv: string[],
  rawCommand?: string | null,
): string | null {
  return extractShellWrapperCommandInternal(argv, normalizeRawCommand(rawCommand), 0).command;
}

/** 分类 shell wrapper argv 并在安全时返回审批显示命令。 */
export function extractShellWrapperCommand(
  argv: string[],
  rawCommand?: string | null,
): ShellWrapperCommand {
  return extractShellWrapperCommandInternal(argv, normalizeRawCommand(rawCommand), 0);
}

/** 当 shell wrapper 启动行为阻止命令重新绑定时返回 true。 */
export function isBlockedShellWrapperCommand(argv: string[], rawCommand?: string | null): boolean {
  const extracted = extractShellWrapperCommandInternal(argv, normalizeRawCommand(rawCommand), 0);
  return extracted.isWrapper && extracted.command === null;
}
