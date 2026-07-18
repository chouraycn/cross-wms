// 移植自 openclaw/src/infra/package-dist-inventory.ts（降级实现）
// package 分发清单。
import fs from "node:fs";
import path from "node:path";
import { readPackageJson, type PackageJson } from "./package-json.js";

export type DistInventoryEntry = {
  relativePath: string;
  size: number;
  isDirectory: boolean;
};

export type DistInventory = {
  packagePath: string;
  entries: DistInventoryEntry[];
  totalSize: number;
};

/** 构建包分发清单（降级：遍历目录） */
export function buildPackageDistInventory(packagePath: string): DistInventory {
  const entries: DistInventoryEntry[] = [];
  let totalSize = 0;
  const walk = (dir: string, base: string) => {
    let items: fs.Dirent[];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.name === "node_modules" || item.name === ".git") continue;
      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(base, fullPath);
      if (item.isDirectory()) {
        entries.push({ relativePath, size: 0, isDirectory: true });
        walk(fullPath, base);
      } else if (item.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          entries.push({ relativePath, size: stat.size, isDirectory: false });
          totalSize += stat.size;
        } catch {
          // 忽略错误
        }
      }
    }
  };
  walk(packagePath, packagePath);
  return { packagePath, entries, totalSize };
}

/** 过滤分发清单中的文件条目 */
export function filterDistFiles(inventory: DistInventory): DistInventoryEntry[] {
  return inventory.entries.filter((e) => !e.isDirectory);
}

/** 检查包是否包含特定文件 */
export function packageContainsFile(packagePath: string, relativePath: string): boolean {
  try {
    return fs.statSync(path.join(packagePath, relativePath)).isFile();
  } catch {
    return false;
  }
}

/** 从 package.json 解析 files 字段 */
export function resolvePackageFiles(pkg: PackageJson): string[] {
  if (!Array.isArray(pkg.files)) return [];
  return pkg.files.filter((f): f is string => typeof f === "string");
}
