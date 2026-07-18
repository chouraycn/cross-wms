// Windows 启动器 argv 规范化：npm/bun 包装器会在 argv 中重复 node.exe。
//
// 降级说明：原 openclaw 版本依赖 `@openclaw/normalization-core/string-coerce` 的
// `normalizeLowercaseStringOrEmpty`，这里改为本地实现以避免引入外部包。

/**
 * 将字符串规范化为小写形式；非字符串或空值返回空字符串。
 * 本地降级实现，替代 `@openclaw/normalization-core/string-coerce` 的同名导出。
 */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase();
}

/**
 * 移除 Windows 上重复的 node 启动器 argv 条目，同时保留正常的 POSIX argv。
 */
export function normalizeWindowsArgv(
  argv: string[],
  options: {
    platform?: NodeJS.Platform;
    execPath?: string;
  } = {},
): string[] {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return argv;
  }
  if (argv.length < 2) {
    return argv;
  }

  const stripControlChars = (value: string): string => {
    let out = "";
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 32 && code !== 127) {
        out += value[i];
      }
    }
    return out;
  };

  const normalizeArg = (value: string): string =>
    stripControlChars(value)
      .replace(/^['"]+|['"]+$/g, "")
      .trim();
  const normalizeCandidate = (value: string): string =>
    normalizeArg(value).replace(/^\\\\\\?\\/, "");
  const basename = (value: string): string => value.split(/[\\/]/).pop() ?? value;

  const execPath = normalizeCandidate(options.execPath ?? process.execPath);
  const execPathLower = normalizeLowercaseStringOrEmpty(execPath);
  const execBase = normalizeLowercaseStringOrEmpty(basename(execPath));
  const isExecPath = (value: string | undefined): boolean => {
    if (!value) {
      return false;
    }
    const normalized = normalizeCandidate(value);
    if (!normalized) {
      return false;
    }
    const lower = normalizeLowercaseStringOrEmpty(normalized);
    const base = basename(lower);
    return (
      lower === execPathLower ||
      base === execBase ||
      lower.endsWith("\\node.exe") ||
      lower.endsWith("/node.exe") ||
      base === "node.exe"
    );
  };

  const argv0IsExecPath = isExecPath(argv[0]);
  const next = [...argv];
  let removedLauncherPrefix = false;
  for (let i = 1; i < next.length; ) {
    if (isExecPath(next[i])) {
      next.splice(i, 1);
      removedLauncherPrefix = true;
      continue;
    }
    break;
  }
  if (next.length < 3 || (!argv0IsExecPath && !removedLauncherPrefix)) {
    return next;
  }
  const cleaned = [...next];
  for (let i = 2; i < cleaned.length; ) {
    const arg = cleaned[i];
    if (!arg || arg.startsWith("-")) {
      break;
    }
    if (isExecPath(arg)) {
      cleaned.splice(i, 1);
      continue;
    }
    break;
  }
  return cleaned;
}
