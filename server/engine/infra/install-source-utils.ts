// 移植自 openclaw/src/infra/install-source-utils.ts（降级实现）
// 安装源工具函数。
import fs from "node:fs";
import path from "node:path";

export type InstallSourceKind = "directory" | "tarball" | "npm-spec" | "unknown";

export type InstallSource = {
  kind: InstallSourceKind;
  raw: string;
  resolvedPath?: string;
};

/** 解析安装源类型 */
export function resolveInstallSourceKind(raw: string): InstallSourceKind {
  if (!raw || typeof raw !== "string") return "unknown";
  if (raw.endsWith(".tgz") || raw.endsWith(".tar.gz")) return "tarball";
  if (raw.startsWith("./") || raw.startsWith("../") || raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) {
    try {
      if (fs.statSync(raw).isDirectory()) return "directory";
    } catch {
      // 忽略
    }
    return "unknown";
  }
  return "npm-spec";
}

/** 解析安装源 */
export function resolveInstallSource(raw: string): InstallSource {
  const kind = resolveInstallSourceKind(raw);
  const source: InstallSource = { kind, raw };
  if (kind === "directory" || kind === "tarball") {
    source.resolvedPath = path.resolve(raw);
  }
  return source;
}

/** 验证安装源 */
export function validateInstallSource(raw: string): { ok: boolean; reason?: string; kind?: InstallSourceKind } {
  const source = resolveInstallSource(raw);
  if (source.kind === "unknown") {
    return { ok: false, reason: "unrecognized install source", kind: source.kind };
  }
  if (source.kind === "directory") {
    try {
      if (!fs.statSync(source.resolvedPath ?? raw).isDirectory()) {
        return { ok: false, reason: "source is not a directory", kind: source.kind };
      }
    } catch {
      return { ok: false, reason: "source directory does not exist", kind: source.kind };
    }
  }
  if (source.kind === "tarball") {
    try {
      if (!fs.statSync(source.resolvedPath ?? raw).isFile()) {
        return { ok: false, reason: "tarball is not a file", kind: source.kind };
      }
    } catch {
      return { ok: false, reason: "tarball does not exist", kind: source.kind };
    }
  }
  return { ok: true, kind: source.kind };
}

/** 检查是否为本地源 */
export function isLocalInstallSource(raw: string): boolean {
  const kind = resolveInstallSourceKind(raw);
  return kind === "directory" || kind === "tarball";
}
