// 移植自 openclaw/src/infra/package-json.ts（降级实现）
// package.json 读写与解析。
import fs from "node:fs";
import path from "node:path";

export type PackageJson = {
  name: string;
  version: string;
  description?: string;
  main?: string;
  type?: "commonjs" | "module";
  bin?: Record<string, string> | string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  private?: boolean;
  workspaces?: string[] | { packages: string[] };
  [key: string]: unknown;
};

/** 读取 package.json */
export function readPackageJson(packagePath: string): PackageJson | null {
  const packageJsonPath = path.join(packagePath, "package.json");
  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/** 异步读取 package.json */
export async function readPackageJsonAsync(packagePath: string): Promise<PackageJson | null> {
  const packageJsonPath = path.join(packagePath, "package.json");
  try {
    const content = await fs.promises.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

/** 写入 package.json */
export function writePackageJson(packagePath: string, pkg: PackageJson): void {
  const packageJsonPath = path.join(packagePath, "package.json");
  const dir = path.dirname(packageJsonPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

/** 解析 package.json 路径 */
export function resolvePackageJsonPath(packagePath: string): string {
  return path.join(packagePath, "package.json");
}

/** 检查 package.json 是否存在 */
export function hasPackageJson(packagePath: string): boolean {
  try {
    return fs.statSync(resolvePackageJsonPath(packagePath)).isFile();
  } catch {
    return false;
  }
}

/** 从 package.json 解析依赖列表 */
export function resolveDependencies(pkg: PackageJson): Record<string, string> {
  return { ...(pkg.dependencies ?? {}) };
}

/** 从 package.json 解析 bin 条目 */
export function resolveBinEntries(pkg: PackageJson): Record<string, string> {
  if (!pkg.bin) return {};
  if (typeof pkg.bin === "string") {
    return { [pkg.name]: pkg.bin };
  }
  return { ...pkg.bin };
}

// ============================================================================
// 异步读取辅助（移植自 openclaw/src/infra/package-json.ts）
// ============================================================================

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** 异步读取并修剪 version 字符串，空或非字符串返回 null */
export async function readPackageVersion(root: string): Promise<string | null> {
  return normalizeString((await readPackageJsonAsync(root))?.version);
}

/** 异步读取并修剪 name 字符串，空或非字符串返回 null */
export async function readPackageName(root: string): Promise<string | null> {
  return normalizeString((await readPackageJsonAsync(root))?.name);
}

/** 异步读取并修剪 packageManager spec，空或非字符串返回 null */
export async function readPackageManagerSpec(root: string): Promise<string | null> {
  const pkg = await readPackageJsonAsync(root);
  return normalizeString((pkg as { packageManager?: unknown } | null)?.packageManager);
}
