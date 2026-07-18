// 解析 gateway 进程命令行用于进程发现。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import { normalizeStringEntries } from "./string-normalization.js";

function normalizeProcArg(arg: string): string {
  return normalizeLowercaseStringOrEmpty(arg.replaceAll("\\", "/"));
}

/** 将 /proc/self/cmdline 风格的字符串按 NUL 分隔为 argv 数组，并去除空白项 */
export function parseProcCmdline(raw: string): string[] {
  return normalizeStringEntries(raw.split("\0"));
}

/** 判断给定 argv 是否为 openclaw gateway 进程 */
export function isGatewayArgv(
  args: string[],
  opts?: { allowGatewayBinary?: boolean },
): boolean {
  const normalized = args.map(normalizeProcArg);
  if (!normalized.includes("gateway")) {
    return false;
  }

  const entryCandidates = [
    "dist/index.js",
    "dist/entry.js",
    "openclaw.mjs",
    "scripts/run-node.mjs",
    "src/entry.ts",
    "src/index.ts",
  ];
  if (normalized.some((arg) => entryCandidates.some((entry) => arg.endsWith(entry)))) {
    return true;
  }

  const exe = (normalized[0] ?? "").replace(/\.(bat|cmd|exe)$/i, "");
  return (
    exe.endsWith("/openclaw") ||
    exe === "openclaw" ||
    (opts?.allowGatewayBinary === true && exe.endsWith("/openclaw-gateway"))
  );
}
