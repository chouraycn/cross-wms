/**
 * localStorage → SQLite 一次性数据迁移
 *
 * 策略：
 * - 首次启动检测 `cdf-know-clow-migrated` 标记
 * - 收集所有 localStorage 中的业务数据
 * - 单次 POST /api/migrate 批量写入
 * - 成功标记 migrated，不删除 localStorage 原始 key（保留回滚能力）
 * - 失败不标记，下次重试
 */

import { migrate } from './api';

const MIGRATED_KEY = 'cdf-know-clow-migrated';

interface MigrateKeyMapping {
  lsKey: string;
  field: string;
}

const KEY_MAPPINGS: MigrateKeyMapping[] = [
  { lsKey: 'cdf-know-clow-warehouses', field: 'warehouses' },
  { lsKey: 'cdf-know-clow-inventory-items', field: 'inventoryItems' },
  { lsKey: 'cdf-know-clow-transit-orders', field: 'transitOrders' },
  { lsKey: 'cdf-know-clow-user-skills', field: 'userSkills' },
  { lsKey: 'cdf-know-clow-builtin-status-patches', field: 'builtinStatusPatches' },
  { lsKey: 'cdf-know-clow-settings', field: 'appSettings' },
];

/**
 * 检查是否需要迁移，如需要则执行
 * @returns true 表示迁移成功或已迁移，false 表示迁移失败
 */
export async function checkAndMigrate(): Promise<boolean> {
  // 已迁移过，跳过
  if (localStorage.getItem(MIGRATED_KEY)) {
    return true;
  }

  // 收集 localStorage 数据
  const payload: Record<string, unknown> = {};
  let hasData = false;

  for (const { lsKey, field } of KEY_MAPPINGS) {
    const raw = localStorage.getItem(lsKey);
    if (raw) {
      try {
        payload[field] = JSON.parse(raw);
        hasData = true;
      } catch {
        // 跳过损坏数据
        console.warn(`[Migration] 跳过损坏的 localStorage key: ${lsKey}`);
      }
    }
  }

  // 没有数据需要迁移，直接标记
  if (!hasData) {
    localStorage.setItem(MIGRATED_KEY, '1');
    return true;
  }

  // 执行迁移
  try {
    const result = await migrate(payload);
    localStorage.setItem(MIGRATED_KEY, '1');
    // eslint-disable-next-line no-console
    console.log('[Migration] localStorage → SQLite 迁移成功:', result);
    return true;
  } catch (e) {
    console.error('[Migration] 迁移失败，下次启动将重试:', e);
    return false;
  }
}
