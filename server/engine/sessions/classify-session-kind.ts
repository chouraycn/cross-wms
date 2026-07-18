/**
 * 会话分类
 *
 * 根据会话密钥和元数据将会话分类为不同类型
 */

import type { SessionKind } from './types.js';
import { isCronSessionKey } from './session-key.js';

export type { SessionKind } from './types.js';

export interface ClassifySessionKindEntry {
  chatType?: string | null;
  spawnedBy?: string | null;
}

/**
 * 将会话密钥和条目分类为显示类型
 *
 * 评估顺序很重要 — 更具体的信号优先：
 *   1. 哨兵密钥（"global", "unknown"）
 *   2. cron 密钥形状
 *   3. spawn-child（条目有 `spawnedBy`）
 *   4. group/channel chatType 或密钥形状子串
 *   5. 回退："direct"
 */
export function classifySessionKind(
  key: string,
  entry?: ClassifySessionKindEntry,
): SessionKind {
  if (key === 'global') {
    return 'global';
  }
  if (key === 'unknown') {
    return 'unknown';
  }
  if (isCronSessionKey(key)) {
    return 'cron';
  }
  if (entry?.spawnedBy) {
    return 'spawn-child';
  }
  if (entry?.chatType === 'group' || entry?.chatType === 'channel') {
    return 'group';
  }
  if (key.includes(':group:') || key.includes(':channel:')) {
    return 'group';
  }
  return 'direct';
}
