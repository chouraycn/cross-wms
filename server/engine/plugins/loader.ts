import { logger } from '../../logger.js';
import type {
  PluginDependency,
  PluginManifest,
  PluginVersionRange,
} from './types.js';

/**
 * 插件加载器 — 插件发现 / 加载 / 依赖解析 / 版本检查
 *
 * 与 server/engine/pluginLoader.ts 的运行时加载器互补：
 * - pluginLoader.ts 关注 IO（fs.readdir / dynamic import）
 * - 本模块提供纯逻辑工具：依赖拓扑、版本兼容性、清单校验、加载顺序计算
 *
 * 这样可以让核心逻辑在无 fs 的环境（如 vitest jsdom）下被测试覆盖。
 */

/** 加载顺序节点 */
export interface PluginLoadOrderNode {
  pluginId: string;
  /** 依赖此插件的前置 ID（已排序） */
  dependencies: string[];
  /** 是否被跳过（缺失或可选未满足） */
  skipped?: boolean;
  skipReason?: string;
}

/** 依赖解析结果 */
export interface DependencyResolutionResult {
  /** 拓扑排序后的加载顺序 */
  order: PluginLoadOrderNode[];
  /** 解析失败的插件 ID */
  missing: Array<{ pluginId: string; missing: string }>;
  /** 检测到的循环依赖 */
  cycles: string[][];
}

// ===================== 版本工具 =====================

/**
 * 将语义化版本字符串解析为 PluginVersionRange。
 *
 * 接受形如 `1.2.3` / `1.2.3-alpha.1` / `v1.2.3` 的输入。
 * 非法输入抛出 Error。
 */
export function parseVersion(input: string): PluginVersionRange {
  if (!input || typeof input !== 'string') {
    throw new Error(`[Plugins:Loader] 无效版本字符串: ${String(input)}`);
  }
  const trimmed = input.trim().replace(/^v/i, '');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(trimmed);
  if (!match) {
    throw new Error(`[Plugins:Loader] 无法解析版本: ${input}`);
  }
  const [, major, minor, patch, prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease,
  };
}

/**
 * 比较两个版本号。
 * - 返回 -1 表示 a < b
 * - 返回 0 表示 a === b
 * - 返回 1 表示 a > b
 *
 * 预发布版本小于同版本的正式版本（1.0.0-alpha < 1.0.0）。
 */
export function compareVersions(a: PluginVersionRange, b: PluginVersionRange): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
  }
  return 0;
}

/**
 * 检查 version 是否满足 range 描述的范围。
 *
 * 支持的 range 语法：
 * - `*` / `""` 任意版本
 * - `1.2.3` 精确版本
 * - `^1.2.3` 主版本锁定（>=1.2.3 且 <2.0.0，0.x 锁定 0.2.x）
 * - `~1.2.3` 次版本锁定（>=1.2.3 且 <1.3.0）
 * - `>=1.2.3` / `>1.2.3` / `<=1.2.3` / `<1.2.3` 单边界
 * - `>=1.0.0 <2.0.0` 多边界（空格分隔，AND 关系）
 */
export function satisfiesVersion(version: string, range: string): boolean {
  if (!range || range.trim() === '*' || range.trim() === '') return true;
  const parsedVersion = parseVersion(version);
  const trimmed = range.trim();
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    if (!checkSingleConstraint(parsedVersion, part)) return false;
  }
  return true;
}

function checkSingleConstraint(version: PluginVersionRange, constraint: string): boolean {
  if (constraint === '*') return true;
  const caretMatch = /^\^(.+)$/.exec(constraint);
  if (caretMatch) {
    const target = parseVersion(caretMatch[1]);
    if (compareVersions(version, target) < 0) return false;
    const upperBound: PluginVersionRange =
      target.major > 0
        ? { major: target.major + 1, minor: 0, patch: 0 }
        : target.minor > 0
          ? { major: 0, minor: target.minor + 1, patch: 0 }
          : { major: 0, minor: 0, patch: target.patch + 1 };
    return compareVersions(version, upperBound) < 0;
  }
  const tildeMatch = /^~(.+)$/.exec(constraint);
  if (tildeMatch) {
    const target = parseVersion(tildeMatch[1]);
    if (compareVersions(version, target) < 0) return false;
    const upperBound: PluginVersionRange = { major: target.major, minor: target.minor + 1, patch: 0 };
    return compareVersions(version, upperBound) < 0;
  }
  const opMatch = /^(>=|<=|>|<|=)?(.+)$/.exec(constraint);
  if (opMatch) {
    const [, op, ver] = opMatch;
    const target = parseVersion(ver);
    const cmp = compareVersions(version, target);
    switch (op ?? '') {
      case '>=':
        return cmp >= 0;
      case '<=':
        return cmp <= 0;
      case '>':
        return cmp > 0;
      case '<':
        return cmp < 0;
      case '=':
      case '':
        return cmp === 0;
    }
  }
  return false;
}

// ===================== 清单校验 =====================

const ID_PATTERN = /^[a-z0-9_-]+$/;

/**
 * 校验插件清单基础合法性。
 *
 * 返回错误字符串数组，空数组表示通过。
 */
export function validateManifest(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id || !ID_PATTERN.test(manifest.id)) {
    errors.push(`非法插件 ID: '${manifest.id}'（仅允许小写字母、数字、下划线、连字符）`);
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('插件 name 不能为空');
  }
  if (!manifest.version) {
    errors.push('插件 version 不能为空');
  } else {
    try {
      parseVersion(manifest.version);
    } catch {
      errors.push(`非法 version: ${manifest.version}`);
    }
  }
  if (manifest.apiVersion) {
    try {
      parseVersion(manifest.apiVersion);
    } catch {
      errors.push(`非法 apiVersion: ${manifest.apiVersion}`);
    }
  }
  if (manifest.dependencies) {
    for (const dep of manifest.dependencies) {
      if (!dep.id || typeof dep.id !== 'string') {
        errors.push(`依赖 id 非法: ${JSON.stringify(dep)}`);
      }
      if (!dep.versionRange) {
        errors.push(`依赖 ${dep.id} 缺少 versionRange`);
      }
    }
  }
  if (manifest.tools) {
    for (const tool of manifest.tools) {
      if (!tool.name || !/^[a-zA-Z0-9_.-]+$/.test(tool.name)) {
        errors.push(`工具名非法: ${tool.name}`);
      }
    }
  }
  return errors;
}

// ===================== 依赖解析 =====================

/**
 * 解析插件依赖图，生成拓扑排序后的加载顺序。
 *
 * 算法：Kahn's algorithm
 * - 入度为 0 的插件先加载
 * - 缺失的必需依赖会标记为 missing
 * - 可选依赖缺失时跳过但不报错
 * - 检测循环依赖时把环上的节点列表加入 cycles
 *
 * @param manifests 待解析的插件清单列表
 * @param available 已知可用插件 ID → 版本（用于版本约束检查）
 */
export function resolveDependencyTree(
  manifests: PluginManifest[],
  available: Map<string, string>,
): DependencyResolutionResult {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const order: PluginLoadOrderNode[] = [];
  const missing: Array<{ pluginId: string; missing: string }> = [];
  const cycles: string[][] = [];

  // 入度统计（仅计算必需依赖且依赖存在）
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const m of manifests) {
    inDegree.set(m.id, 0);
    dependents.set(m.id, []);
  }
  for (const m of manifests) {
    if (!m.dependencies) continue;
    for (const dep of m.dependencies) {
      const exists = byId.has(dep.id);
      const availableVersion = available.get(dep.id);
      const versionOk = exists && availableVersion
        ? satisfiesVersion(availableVersion, dep.versionRange)
        : true;
      if (!exists || !versionOk) {
        if (dep.optional) continue;
        missing.push({ pluginId: m.id, missing: dep.id });
      } else {
        inDegree.set(m.id, (inDegree.get(m.id) ?? 0) + 1);
        dependents.get(dep.id)!.push(m.id);
      }
    }
  }

  // Kahn 拓扑排序
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const visited = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const manifest = byId.get(id)!;
    order.push({
      pluginId: id,
      dependencies: (manifest.dependencies ?? [])
        .filter((d) => byId.has(d.id))
        .map((d) => d.id),
    });
    for (const next of dependents.get(id) ?? []) {
      const newDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  // 未访问的节点即为循环依赖
  for (const m of manifests) {
    if (!visited.has(m.id)) {
      const cycle = [m.id];
      let current: string | undefined = m.id;
      const seen = new Set<string>([m.id]);
      while (current) {
        const cm = byId.get(current);
        const next = cm?.dependencies?.find((d) => byId.has(d.id) && !visited.has(d.id));
        if (!next) break;
        if (seen.has(next.id)) {
          cycle.push(next.id);
          break;
        }
        seen.add(next.id);
        cycle.push(next.id);
        current = next.id;
      }
      cycles.push(cycle);
      order.push({
        pluginId: m.id,
        dependencies: (m.dependencies ?? []).map((d) => d.id),
        skipped: true,
        skipReason: 'circular dependency',
      });
    }
  }

  return { order, missing, cycles };
}

/**
 * 根据依赖解析结果计算加载顺序（返回插件 ID 数组）。
 */
export function computeLoadOrder(result: DependencyResolutionResult): string[] {
  return result.order
    .filter((n) => !n.skipped)
    .map((n) => n.pluginId);
}

/**
 * 给定一组 manifest 与宿主 API 版本，返回不兼容的插件列表。
 *
 * @param manifests 待校验清单
 * @param hostApiVersion 宿主 API 版本（例如 '1.0'）
 * @param supportedRange 宿主支持的 API 版本范围（默认 '^1.0'）
 */
export function findIncompatiblePlugins(
  manifests: PluginManifest[],
  hostApiVersion: string,
  supportedRange = '^1.0',
): Array<{ pluginId: string; apiVersion: string }> {
  const incompatible: Array<{ pluginId: string; apiVersion: string }> = [];
  for (const m of manifests) {
    const apiVersion = m.apiVersion ?? '1.0';
    if (!satisfiesVersion(hostApiVersion, supportedRange)) {
      // 宿主本身不支持的 API 版本范围 — 视为全部不兼容
      incompatible.push({ pluginId: m.id, apiVersion });
      continue;
    }
    if (!satisfiesVersion(apiVersion, supportedRange)) {
      incompatible.push({ pluginId: m.id, apiVersion });
    }
  }
  return incompatible;
}

/**
 * 根据依赖声明过滤出当前缺失的依赖。
 */
export function findMissingDependencies(
  manifest: PluginManifest,
  installed: Set<string>,
): PluginDependency[] {
  return (manifest.dependencies ?? []).filter((d) => !installed.has(d.id));
}

/**
 * 简单的发现日志封装（不影响主流程，仅用于调试）。
 */
export function logLoadOrder(order: string[]): void {
  logger.debug(`[Plugins:Loader] Load order: ${order.join(' → ') || '(empty)'}`);
}
