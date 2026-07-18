// 移植自 openclaw/src/infra/npm-managed-root.ts（降级实现）
// npm 受管根目录解析。
import os from "node:os";
import path from "node:path";

/** 解析 npm 受管根目录 */
export function resolveNpmManagedRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_NPM_MANAGED_ROOT) {
    return path.resolve(env.OPENCLAW_NPM_MANAGED_ROOT);
  }
  return path.join(os.homedir(), ".openclaw", "npm-managed");
}

/** 解析 npm 包安装目录 */
export function resolveNpmPackageInstallDir(params: {
  packageName: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const root = resolveNpmManagedRoot(params.env);
  return path.join(root, "packages", params.packageName);
}

/** 解析 npm 全局根目录 */
export function resolveNpmGlobalRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.OPENCLAW_NPM_GLOBAL_ROOT) {
    return path.resolve(env.OPENCLAW_NPM_GLOBAL_ROOT);
  }
  return path.join(os.homedir(), ".npm-global");
}

/** 确保 npm 受管根目录存在 */
export async function ensureNpmManagedRoot(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const fs = await import("node:fs/promises");
  await fs.mkdir(resolveNpmManagedRoot(env), { recursive: true });
}
