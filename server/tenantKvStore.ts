/**
 * Per-Tenant KV Store —— 自动化（cron 定时任务）跨会话变量共享（B3）
 *
 * 设计约束：
 *  - 内存 + JSON 文件持久化（appStorageDir/staff-kv/<tenantId>.json）
 *  - 每租户总字符预算 ≤ 8192（≈8KB），超出写入会抛错，调用方需裁剪
 *  - Key 命名建议使用前缀，如 `cron:<jobId>:last_report_id`，避免冲突
 *  - 定时任务 ctx 可直接读写：set/get/delete/has/list
 *
 * 线程模型：Node.js 单进程，无竞争；批量写入用 flush debounce（默认 200ms）
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';
import { AppPaths } from './config/appPaths.js';

// ===================== 常量 & 类型 =====================

/** 每租户字符预算上限（含所有 key + value 的 JSON 序列化结果） */
export const TENANT_KV_BUDGET_CHARS = 8192;
const DEBOUNCE_MS = 200;
const KV_SUBDIR = 'staff-kv';

export type KvValue = string | number | boolean | null | KvValue[] | { [k: string]: KvValue };

export interface KvSnapshot {
  /** 实际已存储的键值对 */
  entries: Record<string, KvValue>;
  /** 当前 JSON 序列化后字符数 */
  sizeChars: number;
  /** 预算剩余（字符数）；负值表示已超预算（一般不应出现，写入会被拦） */
  remainingChars: number;
  /** 键数 */
  keyCount: number;
}

interface TenantStore {
  entries: Record<string, KvValue>;
  dirty: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
}

// ===================== 内部状态 =====================

const tenantStores = new Map<string, TenantStore>();
const loadedTenants = new Set<string>();

function dirPath(): string {
  return path.join(AppPaths.userDataDir, KV_SUBDIR);
}

function tenantFilePath(tenantId: string): string {
  const safe = tenantId.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return path.join(dirPath(), `${safe}.json`);
}

function ensureDir(): void {
  const d = dirPath();
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

function sizeChars(entries: Record<string, KvValue>): number {
  try {
    return JSON.stringify(entries).length;
  } catch {
    // 极端循环引用等 → 返回极大，拦截写入
    return Number.MAX_SAFE_INTEGER;
  }
}

function loadTenant(tenantId: string): TenantStore {
  let store = tenantStores.get(tenantId);
  if (store) return store;
  store = { entries: {}, dirty: false, flushTimer: null };
  tenantStores.set(tenantId, store);
  if (loadedTenants.has(tenantId)) return store;
  loadedTenants.add(tenantId);
  try {
    const p = tenantFilePath(tenantId);
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          store.entries = parsed as Record<string, KvValue>;
          logger.info(`[TenantKV] 载入 tenant=${tenantId} 键数=${Object.keys(store.entries).length} 大小=${sizeChars(store.entries)}c`);
        }
      }
    }
  } catch (e) {
    logger.warn(
      `[TenantKV] tenant=${tenantId} 载入失败（将以空启动）：${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return store;
}

function scheduleFlush(tenantId: string, store: TenantStore): void {
  store.dirty = true;
  if (store.flushTimer) return;
  store.flushTimer = setTimeout(() => {
    store.flushTimer = null;
    try {
      if (!store.dirty) return;
      ensureDir();
      fs.writeFileSync(tenantFilePath(tenantId), JSON.stringify(store.entries, null, 2), 'utf-8');
      store.dirty = false;
    } catch (e) {
      logger.warn(`[TenantKV] tenant=${tenantId} flush 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }, DEBOUNCE_MS);
}

/** 写入前预算检查；若新大小超预算，抛出错误（不改动 entries） */
function assertBudget(tenantId: string, nextEntries: Record<string, KvValue>): void {
  const chars = sizeChars(nextEntries);
  if (chars > TENANT_KV_BUDGET_CHARS) {
    throw new Error(
      `KV 预算超出：tenant=${tenantId} 当前 ${chars}c / 上限 ${TENANT_KV_BUDGET_CHARS}c。请删除部分旧键或压缩 value 后重试。`,
    );
  }
}

// ===================== 外部 API =====================

/** 写入键值对（自动持久化）。若新总大小超出预算则报错，不执行写入。 */
export function setTenantKv(tenantId: string, key: string, value: KvValue): KvSnapshot {
  if (!tenantId) throw new Error('tenantId 必填');
  if (!key) throw new Error('key 必填');
  const store = loadTenant(tenantId);
  const next = { ...store.entries, [key]: value };
  // 若 value=undefined/null：视为 delete → 但 API 层面用 deleteKv 更明确，这里仍允许
  if (value === undefined) {
    delete next[key];
  }
  assertBudget(tenantId, next);
  store.entries = next;
  scheduleFlush(tenantId, store);
  return getTenantKvSnapshot(tenantId);
}

export function getTenantKv(tenantId: string, key: string): KvValue | undefined {
  if (!tenantId || !key) return undefined;
  const store = loadTenant(tenantId);
  return store.entries[key];
}

export function hasTenantKv(tenantId: string, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(loadTenant(tenantId).entries, key);
}

export function deleteTenantKv(tenantId: string, key: string): KvSnapshot {
  if (!tenantId || !key) return getTenantKvSnapshot(tenantId);
  const store = loadTenant(tenantId);
  if (!(key in store.entries)) return getTenantKvSnapshot(tenantId);
  const next = { ...store.entries };
  delete next[key];
  store.entries = next;
  scheduleFlush(tenantId, store);
  return getTenantKvSnapshot(tenantId);
}

export function listTenantKvKeys(tenantId: string, prefix?: string): string[] {
  const store = loadTenant(tenantId);
  const keys = Object.keys(store.entries);
  return prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
}

export function getTenantKvSnapshot(tenantId: string): KvSnapshot {
  const store = loadTenant(tenantId);
  const chars = sizeChars(store.entries);
  return {
    entries: { ...store.entries },
    sizeChars: chars,
    remainingChars: TENANT_KV_BUDGET_CHARS - chars,
    keyCount: Object.keys(store.entries).length,
  };
}

/** 强制刷盘（测试/进程关闭时调用）；返回实际刷盘的 tenant 数 */
export function flushAllTenantKv(): number {
  let flushed = 0;
  for (const [tenantId, store] of tenantStores) {
    if (!store.dirty) continue;
    if (store.flushTimer) {
      clearTimeout(store.flushTimer);
      store.flushTimer = null;
    }
    try {
      ensureDir();
      fs.writeFileSync(tenantFilePath(tenantId), JSON.stringify(store.entries, null, 2), 'utf-8');
      store.dirty = false;
      flushed++;
    } catch (e) {
      logger.warn(`[TenantKV] flushAll tenant=${tenantId} 失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return flushed;
}

/** 清空指定租户 KV（仅用于测试） */
export function __resetTenantKvForTest(tenantId: string): void {
  const store = tenantStores.get(tenantId);
  if (store) {
    if (store.flushTimer) clearTimeout(store.flushTimer);
    store.flushTimer = null;
  }
  tenantStores.delete(tenantId);
  loadedTenants.delete(tenantId);
  try {
    const p = tenantFilePath(tenantId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // ignore
  }
}
