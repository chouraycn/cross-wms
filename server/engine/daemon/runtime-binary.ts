/**
 * 运行时二进制文件检测。
 */

const NODE_VERSIONED_PATTERN = /^node(?:-\d+|\d+)(?:\.\d+)*(?:\.exe)?$/;

function normalizeRuntimeBasename(execPath: string): string {
  const trimmed = execPath.trim().replace(/^["']|["']$/g, "");
  const lastSlash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  const basename = lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
  return basename.toLowerCase();
}

export function isNodeRuntime(execPath: string): boolean {
  const base = normalizeRuntimeBasename(execPath);
  return (
    base === "node" ||
    base === "node.exe" ||
    base === "nodejs" ||
    base === "nodejs.exe" ||
    NODE_VERSIONED_PATTERN.test(base)
  );
}

export function isBunRuntime(execPath: string): boolean {
  const base = normalizeRuntimeBasename(execPath);
  return base === "bun" || base === "bun.exe";
}

export function isTsxRuntime(execPath: string): boolean {
  const base = normalizeRuntimeBasename(execPath);
  return base === "tsx" || base === "tsx.exe";
}

export function getRuntimeType(execPath: string): "node" | "bun" | "tsx" | "unknown" {
  if (isNodeRuntime(execPath)) return "node";
  if (isBunRuntime(execPath)) return "bun";
  if (isTsxRuntime(execPath)) return "tsx";
  return "unknown";
}
