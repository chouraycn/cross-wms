/**
 * API Domain Whitelist Data Access Object — 域名白名单数据访问层
 *
 * v3.0: 封装 api_domain_whitelist 表的所有 CRUD 操作。
 * 支持 30s 内存缓存，DB 不可用时回退硬编码常量。
 */

import { initDb, type ApiDomainWhitelistRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Cache Layer =====================

interface CacheEntry {
  allowed: boolean;
  expiresAt: number;
}

/** 30s TTL 内存缓存 */
const domainCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(hostname: string): boolean | null {
  const entry = domainCache.get(hostname.toLowerCase());
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    domainCache.delete(hostname.toLowerCase());
    return null;
  }
  return entry.allowed;
}

function setCached(hostname: string, allowed: boolean): void {
  domainCache.set(hostname.toLowerCase(), {
    allowed,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ===================== Fallback Constants =====================

/**
 * 硬编码后备域名列表。
 * 当 DB 不可用时（如首次启动前），使用此常量作为安全底线。
 * 与 db.ts seed 中的 11 个域名保持同步。
 */
const FALLBACK_DOMAINS = new Set([
  'api.github.com',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.weixin.qq.com',
  'qyapi.weixin.qq.com',
  'docs.qq.com',
  'api.day.app',
  'open.feishu.cn',
  'api.money.126.net',
  'pushbear.ftqq.com',
]);

// ===================== Public DAO Functions =====================

/**
 * 检查域名是否在白名单中。
 * 先查 30s 缓存，再查 DB，DB 失败则回退硬编码常量。
 */
export function isDomainAllowed(hostname: string): boolean {
  const key = hostname.toLowerCase().trim();
  if (!key) return false;

  // 1. Cache hit
  const cached = getCached(key);
  if (cached !== null) return cached;

  // 2. Query DB
  try {
    const db = initDb();
    const row = db.prepare('SELECT hostname FROM api_domain_whitelist WHERE hostname = ?').get(key) as { hostname: string } | undefined;
    const result = !!row;
    setCached(key, result);
    return result;
  } catch {
    // 3. Fallback to hardcoded
    const result = FALLBACK_DOMAINS.has(key);
    setCached(key, result);
    return result;
  }
}

/** 分页查询白名单列表 */
export function listDomainWhitelist(
  category?: string,
  search?: string,
  page: number = 1,
  pageSize: number = 50
): { items: ApiDomainWhitelistRow[]; total: number } {
  const db = initDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  if (search && search.trim() !== '') {
    conditions.push('hostname LIKE ?');
    params.push(`%${search.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM api_domain_whitelist ${whereClause}`).get(...params) as { cnt: number };
  const offset = (page - 1) * pageSize;
  const items = db.prepare(
    `SELECT * FROM api_domain_whitelist ${whereClause} ORDER BY category DESC, hostname ASC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as ApiDomainWhitelistRow[];

  return { items, total: countRow.cnt };
}

/** 添加域名到白名单 */
export function addDomain(hostname: string, description: string = '', category: string = 'user'): ApiDomainWhitelistRow {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const normalizedHostname = hostname.toLowerCase().trim();

  // Check for duplicate
  const existing = db.prepare('SELECT id FROM api_domain_whitelist WHERE hostname = ?').get(normalizedHostname) as { id: string } | undefined;
  if (existing) {
    throw new Error(`域名 '${normalizedHostname}' 已在白名单中`);
  }

  db.prepare(
    'INSERT INTO api_domain_whitelist (id, hostname, description, category, is_deletable, created_at) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(id, normalizedHostname, description, category, now);

  // Invalidate cache for this domain
  domainCache.delete(normalizedHostname);

  return db.prepare('SELECT * FROM api_domain_whitelist WHERE id = ?').get(id) as ApiDomainWhitelistRow;
}

/** 删除域名（仅允许 is_deletable=1 的条目） */
export function removeDomain(id: string): boolean {
  const db = initDb();
  const row = db.prepare('SELECT hostname, is_deletable FROM api_domain_whitelist WHERE id = ?').get(id) as { hostname: string; is_deletable: number } | undefined;
  if (!row) return false;
  if (row.is_deletable === 0) {
    throw new Error(`域名 '${row.hostname}' 为系统内置，不可删除`);
  }
  domainCache.delete(row.hostname.toLowerCase());
  const result = db.prepare('DELETE FROM api_domain_whitelist WHERE id = ? AND is_deletable = 1').run(id);
  return result.changes > 0;
}

/** 获取所有白名单域名（供下拉/自动完成用） */
export function getAllDomains(): string[] {
  const { items } = listDomainWhitelist(undefined, undefined, 1, 9999);
  return items.map(r => r.hostname);
}

/** 清除缓存（测试/调试用） */
export function clearDomainCache(): void {
  domainCache.clear();
}
