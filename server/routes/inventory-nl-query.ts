/**
 * POST /api/inventory/nl-query 路由
 * 接收 AI 生成的 SQL + chartType，安全执行并返回结构化结果
 * @version 1.7.0 — 新增 LRU 查询缓存
 */
import { Router, type Request, type Response } from 'express';
import type { NlQueryRequest, NlQueryResponse } from '../../src/types/inventory-query.js';
import { InventoryQueryService } from '../services/inventoryQueryService.js';
import { initDb } from '../db.js';

const router = Router();

// 初始化数据库实例和查询服务（单例）
const db = initDb();
const queryService = new InventoryQueryService(db);

// ===================== v1.7.0: LRU 查询缓存 =====================

/** 缓存条目 */
interface CacheEntry {
  result: NlQueryResponse;
  timestamp: number;
}

/** LRU 缓存配置 */
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/** LRU 缓存（Map 保持插入顺序） */
const queryCache = new Map<string, CacheEntry>();

/**
 * 标准化 SQL 用于缓存 key 生成
 * 去除多余空白、转小写，确保相同语义的 SQL 命中同一缓存
 */
function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 生成缓存 key（SQL + chartType 组合）
 */
function cacheKey(sql: string, chartType: string): string {
  return `${normalizeSql(sql)}|${chartType}`;
}

/**
 * 淘汰过期缓存条目
 */
function evictStaleEntries(): void {
  const now = Date.now();
  for (const [key, entry] of queryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      queryCache.delete(key);
    }
  }
}

/**
 * 写入缓存（LRU 策略：超过 max 时删除最旧的条目）
 */
function cacheSet(key: string, entry: CacheEntry): void {
  // 先淘汰过期条目以释放空间
  evictStaleEntries();

  // 已存在则先删除（Map 会保留插入顺序）
  if (queryCache.has(key)) {
    queryCache.delete(key);
  }

  // 超过上限时删除最旧条目（Map 第一个 key）
  if (queryCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey !== undefined) {
      queryCache.delete(oldestKey);
    }
  }

  queryCache.set(key, entry);
}

/**
 * POST /nl-query
 * 请求体：{ sql: string, chartType?: string, chartConfig?: object }
 * 响应体：{ code: number, data: QueryResult | null, message: string }
 */
router.post('/nl-query', (req: Request, res: Response) => {
  const { sql, chartType, chartConfig, dataSource, queryIntent } = req.body as NlQueryRequest;

  // 请求体校验：sql 必填且非空
  if (!sql || typeof sql !== 'string' || !sql.trim()) {
    res.status(400).json({
      code: 400,
      data: null,
      message: '参数错误：sql 字段必填且不能为空',
    } satisfies NlQueryResponse);
    return;
  }

  // 校验 chartType 合法性
  const validChartTypes = ['table', 'bar', 'line', 'pie'];
  const safeChartType = validChartTypes.includes(chartType ?? 'table')
    ? (chartType ?? 'table') as 'table' | 'bar' | 'line' | 'pie'
    : 'table';

  // v1.7.0: 检查缓存
  const key = cacheKey(sql.trim(), safeChartType);
  const cached = queryCache.get(key);
  if (cached) {
    // 更新访问时间（LRU 刷新）
    cached.timestamp = Date.now();
    // 将缓存结果中的 dataSource/queryIntent 更新为本次请求的值
    if (cached.result.data) {
      cached.result.data.dataSource = dataSource;
      cached.result.data.queryIntent = queryIntent;
    }
    res.setHeader('X-Cache', 'HIT');
    res.status(200).json(cached.result);
    return;
  }

  // 调用查询服务
  const request: NlQueryRequest = {
    sql: sql.trim(),
    chartType: safeChartType,
    chartConfig,
    dataSource,
    queryIntent,
  };

  const result: NlQueryResponse = queryService.validateAndExecute(request);

  // v1.7.0: 成功结果写入缓存
  if (result.code === 0 && result.data) {
    cacheSet(key, { result: { ...result }, timestamp: Date.now() });
  }

  // 根据返回 code 设置 HTTP 状态码
  const httpStatus = result.code === 0 ? 200
    : result.code === 403 ? 403
    : result.code === 400 ? 400
    : 500;

  res.status(httpStatus).json(result);
});

export default router;
