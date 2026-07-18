// 检测项目目录所使用的包管理器。
// 移植自 openclaw/src/infra/detect-package-manager.ts。
// 降级实现：openclaw 中 readPackageManagerSpec 来自 ./package-json.js，
// cross-wms 的 package-json.ts 未导出该函数，这里直接读取 packageManager 字段。
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tryReadJson } from "./json-files.js";

type DetectedPackageManager = "pnpm" | "bun" | "npm";

/** 读取并裁剪 packageManager spec，空白或非字符串值返回 null。 */
async function readPackageManagerSpec(root: string): Promise<string | null> {
  const parsed = await tryReadJson<unknown>(path.join(root, "package.json"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const value = (parsed as { packageManager?: unknown }).packageManager;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function resolveBunGlobalNodeModules(): string {
  return path.join(
    process.env.BUN_INSTALL || path.join(os.homedir(), ".bun"),
    "install",
    "global",
    "node_modules",
  );
}

function resolvePnpmNodeModulesRoot(root: string): string | null {
  const resolved = path.resolve(root);
  const parts = resolved.split(path.sep);
  const pnpmIndex = parts.lastIndexOf(".pnpm");
  if (pnpmIndex > 0) {
    const layoutRoot = parts.slice(0, pnpmIndex).join(path.sep) || path.sep;
    return path.basename(layoutRoot) === "node_modules"
      ? layoutRoot
      : path.join(layoutRoot, "node_modules");
  }

  const parent = path.dirname(resolved);
  return path.basename(parent) === "node_modules" ? parent : null;
}

async function isBunOwnedPackageRoot(root: string): Promise<boolean> {
  return path.resolve(path.dirname(root)) === path.resolve(resolveBunGlobalNodeModules());
}

async function isPnpmOwnedPackageRoot(root: string): Promise<boolean> {
  const nodeModulesRoot = resolvePnpmNodeModulesRoot(root);
  if (!nodeModulesRoot || !(await exists(path.join(nodeModulesRoot, ".modules.yaml")))) {
    return false;
  }
  return true;
}

/** 通过 manifests、locks 与安装布局检测拥有该 package root 的包管理器。 */
export async function detectPackageManager(root: string): Promise<DetectedPackageManager | null> {
  const pm = (await readPackageManagerSpec(root))?.split("@")[0]?.trim();
  const files = await fs.readdir(root).catch((): string[] => []);
  const hasNpmShrinkwrap = files.includes("npm-shrinkwrap.json");
  const hasPnpmLock = files.includes("pnpm-lock.yaml");
  const hasBunLock = files.includes("bun.lock") || files.includes("bun.lockb");

  if (hasNpmShrinkwrap) {
    // 发布的 npm 包即使源码使用 pnpm 也会携带 npm-shrinkwrap；
    // 安装的 pnpm/bun 拥有的 root 在覆盖 npm 之前需要布局证明。
    if (await isBunOwnedPackageRoot(root)) {
      return "bun";
    }
    if (pm === "pnpm" && (hasPnpmLock || (await isPnpmOwnedPackageRoot(root)))) {
      return "pnpm";
    }
    if (pm === "bun" && hasBunLock) {
      return "bun";
    }
    return "npm";
  }

  if (pm === "pnpm" || pm === "bun" || pm === "npm") {
    return pm;
  }

  if (hasPnpmLock) {
    return "pnpm";
  }
  if (hasBunLock) {
    return "bun";
  }
  if (files.includes("package-lock.json") || hasNpmShrinkwrap) {
    return "npm";
  }
  return null;
}
