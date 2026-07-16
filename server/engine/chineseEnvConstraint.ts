/**
 * 中文环境全局约束 — 统一的 Agent Prompt 中文环境基线
 *
 * 在所有 LLM 调用的 system prompt 中注入此约束，确保 Agent 行为符合国内环境：
 * - 中文路径/文件名处理
 * - 中文日期/表格格式
 * - UTF-8/GBK 编码处理
 * - 国内网络环境（无法访问境外服务）
 *
 * 用法：
 *   import { CHINESE_ENV_CONSTRAINT } from './chineseEnvConstraint.js';
 *   const systemPrompt = `...原有描述...\n\n${CHINESE_ENV_CONSTRAINT}`;
 */

/**
 * 中文环境约束文本块，用于追加到任何 system prompt 末尾。
 */
export const CHINESE_ENV_CONSTRAINT = `

【中文环境约束】
- 文件路径：使用中文路径格式，支持中文目录名和文件名（如 C:\\\\用户\\\\文档\\\\库存报表.xlsx）
- 文件名：支持中文文件名，不假设纯英文命名
- 日期格式：使用中文日期格式（YYYY年MM月DD日、YYYY-MM-DD），不使用英文日期格式
- 表格处理：支持中文表头和中文数据，正确处理含中文的 CSV/Excel 文件
- 编码处理：默认使用 UTF-8 编码，读取文件时注意 GBK/GB2312 编码可能的中文文件
- 网络环境：国内网络环境，无法访问境外服务（如 Google、Twitter、Discord、Slack 等），搜索使用国内搜索引擎
`.trim();

/**
 * 精简版中文环境约束（适用于辅助 LLM 调用，如 planner、reviewer 等子任务）。
 */
export const CHINESE_ENV_CONSTRAINT_LITE = `

【中文环境约束】
- 文件路径：支持中文路径和中文文件名
- 日期格式：使用中文日期格式（YYYY-MM-DD 或 YYYY年MM月DD日）
- 编码处理：默认 UTF-8，注意 GBK 编码的中文文件
- 网络环境：国内网络，无法访问境外服务
`.trim();

/**
 * 将中文环境约束追加到给定 prompt 末尾。
 */
export function withChineseEnvConstraint(prompt: string, lite = false): string {
  const constraint = lite ? CHINESE_ENV_CONSTRAINT_LITE : CHINESE_ENV_CONSTRAINT;
  return `${prompt}\n\n${constraint}`;
}
