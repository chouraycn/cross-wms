/**
 * Browser Profiles Data Access Object — 浏览器配置文件数据访问层
 *
 * v3.0: 封装 browser_profiles 表的 CRUD 操作。
 * 支持列出、创建、删除、设置默认配置文件。
 */

import { initDb, type BrowserProfileRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import os from 'os';

/** browser_profiles 数据目录根路径 */
const BROWSER_DATA_ROOT = path.join(os.homedir(), '.cdf-know-clow', 'browser-profiles');

/**
 * 列出所有浏览器配置文件
 * @returns 按创建时间排序的配置文件列表
 */
export function listProfiles(): BrowserProfileRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM browser_profiles ORDER BY is_default DESC, created_at ASC').all() as BrowserProfileRow[];
}

/**
 * 获取单个配置文件
 * @param id 配置文件 ID
 * @returns 配置文件行，不存在则返回 null
 */
export function getProfile(id: string): BrowserProfileRow | null {
  const db = initDb();
  return db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id) as BrowserProfileRow | null ?? null;
}

/**
 * 创建新的浏览器配置文件
 * @param name 配置文件名称
 * @param userDataDir 可选的自定义用户数据目录，未提供则自动生成
 * @returns 新创建的配置文件行
 */
export function createProfile(name: string, userDataDir?: string): BrowserProfileRow {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  // 如果未提供自定义目录，自动生成基于 ID 的目录路径
  const dir = userDataDir && userDataDir.trim() !== ''
    ? userDataDir.trim()
    : path.join(BROWSER_DATA_ROOT, id);

  db.prepare(
    'INSERT INTO browser_profiles (id, name, user_data_dir, is_default, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(id, name.trim(), dir, now);

  return db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id) as BrowserProfileRow;
}

/**
 * 删除浏览器配置文件
 * @param id 配置文件 ID
 * @returns 成功/失败结果对象
 */
export function deleteProfile(id: string): { success: boolean; error?: string } {
  const db = initDb();
  const profile = db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id) as BrowserProfileRow | undefined;

  if (!profile) {
    return { success: false, error: '配置文件不存在' };
  }

  if (profile.is_default === 1) {
    return { success: false, error: '不能删除默认配置文件' };
  }

  const result = db.prepare('DELETE FROM browser_profiles WHERE id = ?').run(id);
  return { success: result.changes > 0 };
}

/**
 * 设置默认浏览器配置文件
 * 先将所有配置文件的 is_default 置为 0，再将指定 ID 的置为 1
 * @param id 配置文件 ID
 * @returns 是否设置成功
 */
export function setDefaultProfile(id: string): boolean {
  const db = initDb();
  const profile = db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id) as BrowserProfileRow | undefined;

  if (!profile) {
    return false;
  }

  // 使用事务确保原子性：先清除所有默认，再设置新默认
  const transaction = db.transaction(() => {
    db.prepare('UPDATE browser_profiles SET is_default = 0').run();
    db.prepare('UPDATE browser_profiles SET is_default = 1 WHERE id = ?').run(id);
  });
  transaction();

  return true;
}
