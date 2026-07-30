/**
 * Auth Profile SQLite 持久化层。
 *
 * 在 cross-wms 单库（chat.db）中维护两张表：
 *   - auth_profiles:        每行一个 profile，凭据与统计以 JSON 列存储
 *   - auth_profile_state:   按 provider 维护轮转顺序与 lastGood 标记
 *
 * 适配自 openclaw 的 auth-profiles 设计，去除了 per-agent 目录与外部 CLI 叠加，
 * 统一使用 initDb() 获取共享数据库实例。
 */

import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../../db.js';
import { logger } from '../../logger.js';
import type { ApiKeyCredential, AuthProfile, AuthProfileStore, AuthProfileCredential, ProfileUsageStats } from './types.js';

// 数据库表定义
const PROFILES_TABLE = 'auth_profiles';
const STATE_TABLE = 'auth_profile_state';

let authProfileStoreInitialized = false;

/** auth_profiles 行结构。 */
interface AuthProfileRow {
  id: string;
  provider: string;
  credential_json: string;
  usage_stats_json: string;
  created_at: number;
  updated_at: number;
}

/** auth_profile_state 行结构。 */
interface AuthProfileStateRow {
  provider: string;
  order_json: string | null;
  last_good_json: string | null;
}

/**
 * 初始化 auth profile 表与索引。幂等，进程内只执行一次 DDL。
 */
export function initAuthProfileStore(): void {
  if (authProfileStoreInitialized) return;

  const db = initDb();

  // profile 表：每行一个 auth profile
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${PROFILES_TABLE} (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      credential_json TEXT NOT NULL,
      usage_stats_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // 状态表：每个 provider 一行，存储轮转顺序与 lastGood
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
      provider TEXT PRIMARY KEY,
      order_json TEXT,
      last_good_json TEXT
    )
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auth_profiles_provider ON ${PROFILES_TABLE}(provider);
  `);

  authProfileStoreInitialized = true;
  logger.info('[AuthProfileStore] auth profile 表已初始化');
}

/**
 * 从 SQLite 加载完整的 AuthProfileStore。
 * 同时读取 profile 表与 state 表，组装为内存态结构。
 */
export function loadAuthProfileStore(): AuthProfileStore {
  initAuthProfileStore();
  const db = initDb();

  const store: AuthProfileStore = {
    profiles: {},
    order: {},
    lastGood: {},
  };

  // 加载所有 profile
  const profileRows = db.prepare(`
    SELECT id, provider, credential_json, usage_stats_json, created_at, updated_at
    FROM ${PROFILES_TABLE}
  `).all() as AuthProfileRow[];

  for (const row of profileRows) {
    const credential = safeParseJson<AuthProfileCredential>(row.credential_json);
    const usageStats = safeParseJson<ProfileUsageStats>(row.usage_stats_json);
    if (!credential) {
      logger.warn('[AuthProfileStore] 跳过凭据解析失败的 profile', { id: row.id });
      continue;
    }
    store.profiles[row.id] = {
      id: row.id,
      provider: row.provider,
      credential,
      usageStats: usageStats ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // 加载 per-provider 状态
  const stateRows = db.prepare(`
    SELECT provider, order_json, last_good_json
    FROM ${STATE_TABLE}
  `).all() as AuthProfileStateRow[];

  for (const row of stateRows) {
    const order = safeParseJson<string[]>(row.order_json);
    if (order && Array.isArray(order)) {
      store.order[row.provider] = order;
    }
    const lastGood = safeParseJson<string>(row.last_good_json);
    if (lastGood && typeof lastGood === 'string') {
      store.lastGood[row.provider] = lastGood;
    }
  }

  return store;
}

/**
 * 全量保存 AuthProfileStore 到 SQLite。
 * 先清空两张表再写入，保证内存态与持久态一致。
 */
export function saveAuthProfileStore(store: AuthProfileStore): void {
  initAuthProfileStore();
  const db = initDb();

  const tx = db.transaction(() => {
    db.exec(`DELETE FROM ${PROFILES_TABLE}`);
    db.exec(`DELETE FROM ${STATE_TABLE}`);

    const insertProfile = db.prepare(`
      INSERT INTO ${PROFILES_TABLE} (id, provider, credential_json, usage_stats_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const profile of Object.values(store.profiles)) {
      insertProfile.run(
        profile.id,
        profile.provider,
        JSON.stringify(profile.credential),
        JSON.stringify(profile.usageStats ?? {}),
        profile.createdAt,
        profile.updatedAt
      );
    }

    const insertState = db.prepare(`
      INSERT INTO ${STATE_TABLE} (provider, order_json, last_good_json)
      VALUES (?, ?, ?)
    `);

    const providers = new Set<string>([
      ...Object.keys(store.order),
      ...Object.keys(store.lastGood),
    ]);
    for (const provider of providers) {
      const order = store.order[provider];
      const lastGood = store.lastGood[provider];
      insertState.run(
        provider,
        order ? JSON.stringify(order) : null,
        lastGood ? JSON.stringify(lastGood) : null
      );
    }
  });

  tx();
  logger.debug('[AuthProfileStore] store 已全量保存', {
    profileCount: Object.keys(store.profiles).length,
    providerCount: new Set(Object.values(store.profiles).map((p) => p.provider)).size,
  });
}

/**
 * 新增或更新单个 auth profile。
 * 若 profile.id 为空则自动生成；写入时更新 updated_at。
 */
export function upsertAuthProfile(profile: AuthProfile): void {
  initAuthProfileStore();
  const db = initDb();

  const id = profile.id || uuidv4();
  const now = Date.now();
  const existing = db
    .prepare(`SELECT created_at FROM ${PROFILES_TABLE} WHERE id = ?`)
    .get(id) as { created_at: number } | undefined;

  const createdAt = existing ? existing.created_at : (profile.createdAt || now);

  db.prepare(`
    INSERT INTO ${PROFILES_TABLE} (id, provider, credential_json, usage_stats_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      credential_json = excluded.credential_json,
      usage_stats_json = excluded.usage_stats_json,
      updated_at = excluded.updated_at
  `).run(
    id,
    profile.provider,
    JSON.stringify(profile.credential),
    JSON.stringify(profile.usageStats ?? {}),
    createdAt,
    now
  );

  logger.info('[AuthProfileStore] profile 已写入', { id, provider: profile.provider });
}

/**
 * 删除单个 auth profile，并清理 state 表中对该 profileId 的引用。
 */
export function removeAuthProfile(profileId: string): void {
  initAuthProfileStore();
  const db = initDb();

  const existing = db
    .prepare(`SELECT id FROM ${PROFILES_TABLE} WHERE id = ?`)
    .get(profileId) as { id: string } | undefined;
  if (!existing) {
    logger.debug('[AuthProfileStore] 删除跳过：profile 不存在', { id: profileId });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM ${PROFILES_TABLE} WHERE id = ?`).run(profileId);

    // 清理 state 表中对被删 profileId 的引用
    const stateRows = db.prepare(`
      SELECT provider, order_json, last_good_json FROM ${STATE_TABLE}
    `).all() as AuthProfileStateRow[];

    for (const row of stateRows) {
      const order = safeParseJson<string[]>(row.order_json);
      const lastGood = safeParseJson<string>(row.last_good_json);
      const orderChanged = order && order.includes(profileId);
      const lastGoodChanged = lastGood === profileId;
      if (!orderChanged && !lastGoodChanged) continue;

      const nextOrder = order ? order.filter((p) => p !== profileId) : undefined;
      const nextLastGood = lastGoodChanged ? undefined : lastGood;

      if (nextOrder && nextOrder.length > 0) {
        db.prepare(`
          UPDATE ${STATE_TABLE} SET order_json = ?, last_good_json = ? WHERE provider = ?
        `).run(
          JSON.stringify(nextOrder),
          nextLastGood ? JSON.stringify(nextLastGood) : null,
          row.provider
        );
      } else if (nextLastGood) {
        db.prepare(`
          UPDATE ${STATE_TABLE} SET order_json = ?, last_good_json = ? WHERE provider = ?
        `).run(null, JSON.stringify(nextLastGood), row.provider);
      } else {
        db.prepare(`DELETE FROM ${STATE_TABLE} WHERE provider = ?`).run(row.provider);
      }
    }
  });

  tx();
  logger.info('[AuthProfileStore] profile 已删除', { id: profileId });
}

/**
 * 按 provider 列出所有 auth profile（按 createdAt 升序）。
 */
export function listProfilesForProvider(provider: string): AuthProfile[] {
  initAuthProfileStore();
  const db = initDb();

  const rows = db.prepare(`
    SELECT id, provider, credential_json, usage_stats_json, created_at, updated_at
    FROM ${PROFILES_TABLE}
    WHERE provider = ?
    ORDER BY created_at ASC
  `).all(provider) as AuthProfileRow[];

  return rows.map((row) => {
    const credential = safeParseJson<AuthProfileCredential>(row.credential_json);
    const usageStats = safeParseJson<ProfileUsageStats>(row.usage_stats_json);
    return {
      id: row.id,
      provider: row.provider,
      credential: credential ?? ({ type: 'api_key', provider: row.provider } as ApiKeyCredential),
      usageStats: usageStats ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * 安全解析 JSON 单元格，失败时返回 null。
 */
function safeParseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** 仅用于测试：清空 auth profile 表（不清理其他模块数据）。 */
export function clearAuthProfileStoreForTests(): void {
  initAuthProfileStore();
  const db = initDb();
  db.exec(`DELETE FROM ${STATE_TABLE}`);
  db.exec(`DELETE FROM ${PROFILES_TABLE}`);
}
