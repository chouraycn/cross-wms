/**
 * Plugin Dependency Resolver — 插件依赖解析器
 *
 * 解析插件依赖关系，生成安装/加载顺序。
 * 与 ./loader.ts 互补：
 * - loader.ts 提供 resolveDependencyTree / computeLoadOrder
 * - 本文件在拓扑排序基础上增加版本冲突检测、可选依赖处理、循环依赖报告
 */

import type { PluginManifest, PluginDependency } from './types.js';
import {
  resolveDependencyTree,
  satisfiesVersion,
  computeLoadOrder,
} from './loader.js';
import { PluginDependencyError } from './plugin-errors.js';

/** 已解析的依赖项 */
export interface ResolvedDependency {
  /** 依赖 ID */
  id: string;
  /** 版本范围 */
  versionRange: string;
  /** 是否可选 */
  optional: boolean;
  /** 是否已满足 */
  satisfied: boolean;
  /** 找到的版本 */
  foundVersion?: string;
}

/** 依赖解析结果 */
export interface DependencyResolutionOutput {
  /** 是否解析成功 */
  ok: boolean;
  /** 已解析的依赖 */
  resolved: ResolvedDependency[];
  /** 缺失的依赖 */
  missing: Array<{ id: string; requiredBy: string; versionRange: string; optional: boolean }>;
  /** 加载顺序 */
  loadOrder: string[];
  /** 检测到的循环依赖 */
  cycles: string[][];
  /** 版本冲突 */
  conflicts: Array<{ dependencyId: string; requiredVersion: string; foundVersion: string; requiredBy: string }>;
}

/** 解析选项 */
export interface DependencyResolverOptions {
  /** 已安装的插件 ID → 版本 */
  installedPlugins?: Map<string, string>;
  /** 是否允许循环依赖（仅报告不报错） */
  allowCycles?: boolean;
  /** 是否允许缺失可选依赖 */
  allowMissingOptional?: boolean;
}

/** 解析插件依赖 */
export function resolvePluginDependencies(
  manifest: PluginManifest,
  options: DependencyResolverOptions = {},
): DependencyResolutionOutput {
  const installed = options.installedPlugins ?? new Map<string, string>();
  const deps = manifest.dependencies ?? [];

  // 使用 loader.ts 的拓扑排序
  const tree = resolveDependencyTree([manifest], installed);
  const loadOrder = computeLoadOrder(tree);

  // 解析每个依赖
  const resolved: ResolvedDependency[] = [];
  const missing: Array<{ id: string; requiredBy: string; versionRange: string; optional: boolean }> = [];
  const conflicts: Array<{ dependencyId: string; requiredVersion: string; foundVersion: string; requiredBy: string }> = [];

  for (const dep of deps) {
    const foundVersion = installed.get(dep.id);
    const isOptional = dep.optional ?? false;

    if (!foundVersion) {
      // 依赖未安装
      resolved.push({
        id: dep.id,
        versionRange: dep.versionRange,
        optional: isOptional,
        satisfied: false,
      });
      if (!isOptional || !options.allowMissingOptional) {
        missing.push({
          id: dep.id,
          requiredBy: manifest.id,
          versionRange: dep.versionRange,
          optional: isOptional,
        });
      }
    } else {
      // 检查版本兼容性
      const versionOk = satisfiesVersion(foundVersion, dep.versionRange);
      resolved.push({
        id: dep.id,
        versionRange: dep.versionRange,
        optional: isOptional,
        satisfied: versionOk,
        foundVersion,
      });
      if (!versionOk) {
        conflicts.push({
          dependencyId: dep.id,
          requiredVersion: dep.versionRange,
          foundVersion,
          requiredBy: manifest.id,
        });
      }
    }
  }

  const ok = missing.length === 0 && conflicts.length === 0 && (options.allowCycles || tree.cycles.length === 0);

  return {
    ok,
    resolved,
    missing,
    loadOrder,
    cycles: tree.cycles,
    conflicts,
  };
}

/** 批量解析依赖 */
export function resolveDependenciesBatch(
  manifests: PluginManifest[],
  options: DependencyResolverOptions = {},
): DependencyResolutionOutput & { perPlugin: Array<{ pluginId: string; result: DependencyResolutionOutput }> } {
  const installed = options.installedPlugins ?? new Map<string, string>();

  // 使用 loader.ts 批量解析
  const tree = resolveDependencyTree(manifests, installed);
  const loadOrder = computeLoadOrder(tree);

  // 逐个插件解析
  const perPlugin = manifests.map((m) => ({
    pluginId: m.id,
    result: resolvePluginDependencies(m, options),
  }));

  // 汇总
  const allMissing = perPlugin.flatMap((p) => p.result.missing);
  const allConflicts = perPlugin.flatMap((p) => p.result.conflicts);
  const allResolved = perPlugin.flatMap((p) => p.result.resolved);
  const ok = perPlugin.every((p) => p.result.ok);

  return {
    ok,
    resolved: allResolved,
    missing: allMissing,
    loadOrder,
    cycles: tree.cycles,
    conflicts: allConflicts,
    perPlugin,
  };
}

/** 检查依赖是否满足 */
export function isDependencySatisfied(
  dep: PluginDependency,
  installedVersion?: string,
): boolean {
  if (!installedVersion) return false;
  return satisfiesVersion(installedVersion, dep.versionRange);
}

/** 获取缺失的必需依赖 */
export function getMissingRequiredDependencies(
  manifest: PluginManifest,
  installedPlugins: Set<string> | Map<string, string>,
): PluginDependency[] {
  const deps = manifest.dependencies ?? [];
  return deps.filter((dep) => {
    if (dep.optional) return false;
    if (installedPlugins instanceof Map) {
      return !installedPlugins.has(dep.id) || !satisfiesVersion(installedPlugins.get(dep.id)!, dep.versionRange);
    }
    return !installedPlugins.has(dep.id);
  });
}

/** 获取缺失的可选依赖 */
export function getMissingOptionalDependencies(
  manifest: PluginManifest,
  installedPlugins: Set<string>,
): PluginDependency[] {
  const deps = manifest.dependencies ?? [];
  return deps.filter((dep) => dep.optional && !installedPlugins.has(dep.id));
}

/** 检测版本冲突 */
export function detectVersionConflicts(
  manifests: PluginManifest[],
  installedPlugins: Map<string, string>,
): Array<{ dependencyId: string; requiredVersion: string; foundVersion: string; requiredBy: string }> {
  const conflicts: Array<{ dependencyId: string; requiredVersion: string; foundVersion: string; requiredBy: string }> = [];
  for (const manifest of manifests) {
    if (!manifest.dependencies) continue;
    for (const dep of manifest.dependencies) {
      const foundVersion = installedPlugins.get(dep.id);
      if (foundVersion && !satisfiesVersion(foundVersion, dep.versionRange)) {
        conflicts.push({
          dependencyId: dep.id,
          requiredVersion: dep.versionRange,
          foundVersion,
          requiredBy: manifest.id,
        });
      }
    }
  }
  return conflicts;
}

/** 断言依赖已满足（不满足时抛出） */
export function assertDependenciesSatisfied(
  manifest: PluginManifest,
  installedPlugins: Map<string, string>,
): void {
  const result = resolvePluginDependencies(manifest, { installedPlugins });
  if (!result.ok) {
    if (result.missing.length > 0) {
      throw new PluginDependencyError(
        `缺失依赖: ${result.missing.map((m) => m.id).join(', ')}`,
        result.missing[0].id,
        manifest.id,
        result.missing[0].versionRange,
      );
    }
    if (result.conflicts.length > 0) {
      throw new PluginDependencyError(
        `版本冲突: ${result.conflicts.map((c) => `${c.dependencyId}(${c.requiredVersion} vs ${c.foundVersion})`).join(', ')}`,
        result.conflicts[0].dependencyId,
        manifest.id,
        result.conflicts[0].requiredVersion,
        result.conflicts[0].foundVersion,
      );
    }
    if (result.cycles.length > 0) {
      throw new PluginDependencyError(
        `循环依赖: ${result.cycles.map((c) => c.join(' → ')).join(', ')}`,
        result.cycles[0][0] ?? 'unknown',
        manifest.id,
      );
    }
  }
}
