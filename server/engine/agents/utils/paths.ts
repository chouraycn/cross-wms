/**
 * Agent 路径规范化工具
 *
 * 提供路径分隔符归一化、相对路径解析与父子关系判断，
 * 用于 agent 工具在跨平台场景下的路径预处理。
 *
 * 参考自 openclaw/src/agents/utils/paths.ts。
 */
import { isAbsolute, resolve as resolveNodePath } from 'node:path';

/**
 * 将路径中的反斜杠统一为正斜杠，并合并多余的连续分隔符。
 * @param p 原始路径
 */
export function normalizePath(p: string): string {
  if (typeof p !== 'string' || !p) {
    return '';
  }
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 基于 base 解析 relative 路径，返回规范化后的绝对路径。
 * 若 relative 已是绝对路径，则直接返回其规范化形式。
 * @param base 基准目录
 * @param relativePath 相对路径
 */
export function resolvePath(base: string, relativePath: string): string {
  const safeBase = base ?? '';
  const safeRelative = relativePath ?? '';
  const resolved = isAbsolute(safeRelative)
    ? resolveNodePath(safeRelative)
    : resolveNodePath(safeBase, safeRelative);
  return normalizePath(resolved);
}

/**
 * 判断 child 是否位于 parent 目录之下（含两者相等的情况）。
 * 比较前会先将两者解析为绝对路径并规范化分隔符，跨平台一致。
 * @param parent 父目录
 * @param child 待检测路径
 */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = normalizePath(resolveNodePath(parent ?? ''));
  const resolvedChild = normalizePath(resolveNodePath(child ?? ''));
  if (!resolvedParent || !resolvedChild) {
    return false;
  }
  if (resolvedParent === resolvedChild) {
    return true;
  }
  // 确保 parent 以 / 结尾，避免 /foo 被误判为 /foobar 的父目录
  const prefix = resolvedParent.endsWith('/') ? resolvedParent : `${resolvedParent}/`;
  return resolvedChild.startsWith(prefix);
}
