/**
 * SecretLifecycle 凭证生命周期管理模块
 *
 * 基于 SecretStore 提供：
 * - 过期检测 (isExpired)
 * - 剩余天数 (daysUntilExpiry)
 * - 即将过期清单 (getExpiringSoon)
 * - 清理过期凭证 (cleanup)
 * - 审计报告 (audit)
 *
 * 设计原则：
 * - 不直接持有 SecretStore 引用（避免循环依赖），通过构造注入
 * - 所有方法纯函数 / 仅修改 SecretStore 的元数据或条目
 */

import type { SecretEntry, SecretStore } from './secretStore.js';
import { logger } from '../logger.js';

// ===================== 审计报告类型 =====================

/**
 * 审计报告
 * - total: 凭证总数
 * - active: 未过期且未过期
 * - expired: 已过期凭证数
 * - expiring: 即将过期（默认 7 天内）凭证数
 * - rotated: 至少轮换过一次的凭证数（version > 1）
 * - byTag: 按 tag 分组的统计（key=tag, value=凭证数）
 */
export interface SecretAuditReport {
  total: number;
  active: number;
  expired: number;
  expiring: number;
  rotated: number;
  byTag: Record<string, number>;
  /** 即将过期详情：key -> 剩余天数 */
  expiringSoon: Array<{ key: string; daysLeft: number; expiresAt: string }>;
  /** 已过期详情：key -> 过期天数（正数） */
  expiredEntries: Array<{ key: string; daysOverdue: number; expiresAt: string }>;
}

// ===================== SecretLifecycle 类 =====================

/**
 * SecretLifecycle 凭证生命周期管理器
 *
 * @example
 *   const store = new SecretStore();
 *   const lifecycle = new SecretLifecycle(store);
 *   lifecycle.cleanup();
 *   const report = lifecycle.audit();
 */
export class SecretLifecycle {
  private readonly store: SecretStore;

  constructor(store: SecretStore) {
    this.store = store;
  }

  /**
   * 判断凭证是否已过期
   * - 无 expiresAt 字段：永不过期（返回 false）
   * - expiresAt <= 当前时间：已过期
   */
  isExpired(entry: SecretEntry): boolean {
    if (!entry.expiresAt) return false;
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAtMs)) {
      // 非法日期视为过期，避免泄漏
      logger.warn(`[SecretLifecycle] 凭证 ${entry.key} 的 expiresAt 非法: ${entry.expiresAt}`);
      return true;
    }
    return expiresAtMs <= Date.now();
  }

  /**
   * 距离过期的天数
   * - 无 expiresAt：返回 Infinity（永不过期）
   * - 已过期：返回负数（绝对值表示过期天数）
   * - 非法日期：返回 NaN
   */
  daysUntilExpiry(entry: SecretEntry): number {
    if (!entry.expiresAt) return Infinity;
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (Number.isNaN(expiresAtMs)) return NaN;
    const diffMs = expiresAtMs - Date.now();
    return diffMs / (1000 * 60 * 60 * 24);
  }

  /**
   * 获取即将过期的凭证列表
   * @param days 阈值天数，默认 7；未过期且剩余天数 <= days 的凭证
   */
  getExpiringSoon(days: number = 7): SecretEntry[] {
    const all = this.store.list();
    return all.filter(entry => {
      const left = this.daysUntilExpiry(entry);
      // 过滤：未过期 (left > 0) 且剩余天数 <= days
      return Number.isFinite(left) && left > 0 && left <= days;
    });
  }

  /**
   * 清理已过期凭证
   * @returns 被删除的 key 列表
   */
  cleanup(): string[] {
    const all = this.store.list();
    const removed: string[] = [];
    for (const entry of all) {
      if (this.isExpired(entry)) {
        this.store.delete(entry.key);
        removed.push(entry.key);
      }
    }
    if (removed.length > 0) {
      logger.info(`[SecretLifecycle] 清理过期凭证 ${removed.length} 条: ${removed.join(', ')}`);
    }
    return removed;
  }

  /**
   * 生成审计报告
   * @param expiringDays 即将过期阈值，默认 7 天
   */
  audit(expiringDays: number = 7): SecretAuditReport {
    const all = this.store.list();
    const now = Date.now();

    let active = 0;
    let expired = 0;
    let expiring = 0;
    let rotated = 0;
    const byTag: Record<string, number> = {};
    const expiringSoon: SecretAuditReport['expiringSoon'] = [];
    const expiredEntries: SecretAuditReport['expiredEntries'] = [];

    for (const entry of all) {
      // 按 tag 分组
      for (const tag of entry.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }

      // 轮换统计
      if (entry.version > 1) rotated++;

      // 过期 / 即将过期统计
      if (entry.expiresAt) {
        const expiresAtMs = Date.parse(entry.expiresAt);
        if (Number.isNaN(expiresAtMs)) {
          // 非法日期：视为过期
          expired++;
          expiredEntries.push({
            key: entry.key,
            daysOverdue: Math.abs((now - expiresAtMs) / (1000 * 60 * 60 * 24)) || 0,
            expiresAt: entry.expiresAt,
          });
          continue;
        }
        const left = expiresAtMs - now;
        if (left <= 0) {
          // 已过期
          expired++;
          expiredEntries.push({
            key: entry.key,
            daysOverdue: Math.abs(left) / (1000 * 60 * 60 * 24),
            expiresAt: entry.expiresAt,
          });
        } else {
          // 未过期
          active++;
          const daysLeft = left / (1000 * 60 * 60 * 24);
          if (daysLeft <= expiringDays) {
            expiring++;
            expiringSoon.push({
              key: entry.key,
              daysLeft,
              expiresAt: entry.expiresAt,
            });
          }
        }
      } else {
        // 无 expiresAt：永不过期
        active++;
      }
    }

    return {
      total: all.length,
      active,
      expired,
      expiring,
      rotated,
      byTag,
      expiringSoon,
      expiredEntries,
    };
  }
}
