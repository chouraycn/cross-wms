/**
 * 路径显示处理工具函数
 *
 * 移植自 openclaw/src/utils.ts（shortenHomePath / displayPath）。
 * 简化策略：openclaw 原实现依赖 OPENCLAW_HOME 环境与 home-dir 解析器，
 * 此处按 cross-wms 既有约定（参考 engine/plugins/_parent__utils.ts）改用 os.homedir()。
 */

import os from "node:os";

/**
 * 将路径起始的用户主目录替换为 `~`，便于展示。
 * 支持精确匹配以及 `/`、`\` 两种分隔符前缀。
 *
 * @source openclaw/src/utils.ts → shortenHomePath
 * @param input 原始路径
 * @returns 缩短后的展示路径（无主目录时原样返回）
 */
export function shortenHomePath(input: string): string {
  if (!input) {
    return input;
  }
  const home = os.homedir();
  if (!home) {
    return input;
  }
  if (input === home) {
    return "~";
  }
  if (input.startsWith(`${home}/`) || input.startsWith(`${home}\\`)) {
    return `~${input.slice(home.length)}`;
  }
  return input;
}

/**
 * 缩短路径用于展示，不改变非主目录路径。
 * shortenHomePath 的语义别名。
 *
 * @source openclaw/src/utils.ts → displayPath
 * @param input 原始路径
 * @returns 缩短后的展示路径
 */
export function displayPath(input: string): string {
  return shortenHomePath(input);
}
