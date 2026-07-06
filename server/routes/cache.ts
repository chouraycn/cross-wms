/**
 * Cache Management REST API — 缓存管理端点
 *
 * 支持查看缓存统计、清理缓存、管理命名空间等操作。
 */

import { Router } from 'express';
import { cacheManager, CACHE_NAMESPACES } from '../cache/cache-manager.js';

const router = Router();

// GET /api/cache/stats — 获取整体缓存统计
router.get('/stats', (_req, res) => {
  try {
    const stats = cacheManager.getStats();
    res.json({
      ok: true,
      data: {
        totalCaches: stats.totalCaches,
        totalEntries: stats.totalEntries,
        totalMemory: stats.totalMemory,
        totalMemoryFormatted: formatBytes(stats.totalMemory),
        overallHitRate: stats.overallHitRate,
        overallHitRatePercent: (stats.overallHitRate * 100).toFixed(2) + '%',
        namespaces: stats.namespaces,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `获取缓存统计失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// GET /api/cache/namespaces — 获取所有缓存命名空间
router.get('/namespaces', (_req, res) => {
  try {
    const names = cacheManager.getCacheNames();
    const predefined = Object.values(CACHE_NAMESPACES);

    res.json({
      ok: true,
      data: {
        active: names,
        predefined,
        count: names.length,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `获取命名空间列表失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// GET /api/cache/namespaces/:name — 获取指定命名空间的详细信息
router.get('/namespaces/:name', (req, res) => {
  try {
    const { name } = req.params;
    const info = cacheManager.getCacheInfo(name);

    if (!info) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    res.json({
      ok: true,
      data: {
        name: info.name,
        stats: {
          ...info.stats,
          memoryEstimateFormatted: formatBytes(info.stats.memoryEstimate),
          hitRatePercent: (info.stats.hitRate * 100).toFixed(2) + '%',
        },
        options: info.options,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `获取命名空间详情失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// POST /api/cache/clear — 清空所有缓存
router.post('/clear', (_req, res) => {
  try {
    const count = cacheManager.getStats().totalEntries;
    cacheManager.clearAll();

    res.json({
      ok: true,
      data: {
        clearedEntries: count,
        message: `已清空所有缓存，共 ${count} 条记录`,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `清空缓存失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// POST /api/cache/namespaces/:name/clear — 清空指定命名空间的缓存
router.post('/namespaces/:name/clear', (req, res) => {
  try {
    const { name } = req.params;

    if (!cacheManager.hasCache(name)) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    const info = cacheManager.getCacheInfo(name);
    const count = info?.stats.totalEntries || 0;
    cacheManager.clearCache(name);

    res.json({
      ok: true,
      data: {
        namespace: name,
        clearedEntries: count,
        message: `已清空命名空间 "${name}" 的缓存，共 ${count} 条记录`,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `清空命名空间缓存失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// DELETE /api/cache/namespaces/:name — 删除整个缓存命名空间
router.delete('/namespaces/:name', (req, res) => {
  try {
    const { name } = req.params;

    if (!cacheManager.hasCache(name)) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    cacheManager.deleteCache(name);

    res.json({
      ok: true,
      data: {
        namespace: name,
        message: `已删除缓存命名空间 "${name}"`,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `删除命名空间失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// POST /api/cache/prune — 清理所有过期缓存
router.post('/prune', (_req, res) => {
  try {
    const removed = cacheManager.pruneAllExpired();

    res.json({
      ok: true,
      data: {
        removedEntries: removed,
        message: `已清理 ${removed} 条过期缓存`,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `清理过期缓存失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// POST /api/cache/stats/reset — 重置所有缓存统计
router.post('/stats/reset', (_req, res) => {
  try {
    cacheManager.resetAllStats();

    res.json({
      ok: true,
      data: {
        message: '已重置所有缓存统计数据',
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `重置统计失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// GET /api/cache/namespaces/:name/keys — 获取命名空间的所有键
router.get('/namespaces/:name/keys', (req, res) => {
  try {
    const { name } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!cacheManager.hasCache(name)) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    const cache = cacheManager.getCache(name);
    const allKeys = cache.keys();
    const paginatedKeys = allKeys.slice(offset, offset + limit);

    res.json({
      ok: true,
      data: {
        namespace: name,
        total: allKeys.length,
        returned: paginatedKeys.length,
        limit,
        offset,
        keys: paginatedKeys,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `获取缓存键列表失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// GET /api/cache/namespaces/:name/keys/:key — 查看指定缓存条目
router.get('/namespaces/:name/keys/:key', (req, res) => {
  try {
    const { name, key } = req.params;

    if (!cacheManager.hasCache(name)) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    const cache = cacheManager.getCache(name);
    const entry = cache.getWithMetadata(key);

    if (!entry) {
      return res.status(404).json({
        ok: false,
        error: `缓存键 "${key}" 不存在或已过期`,
      });
    }

    res.json({
      ok: true,
      data: {
        key: entry.key,
        value: entry.value,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt,
        ttlRemaining: Math.max(0, entry.expiresAt - Date.now()),
        accessCount: entry.accessCount,
        lastAccessedAt: entry.lastAccessedAt,
        size: entry.size,
        sizeFormatted: formatBytes(entry.size),
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `获取缓存条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

// DELETE /api/cache/namespaces/:name/keys/:key — 删除指定缓存条目
router.delete('/namespaces/:name/keys/:key', (req, res) => {
  try {
    const { name, key } = req.params;

    if (!cacheManager.hasCache(name)) {
      return res.status(404).json({
        ok: false,
        error: `缓存命名空间 "${name}" 不存在`,
      });
    }

    const cache = cacheManager.getCache(name);
    const deleted = cache.delete(key);

    if (!deleted) {
      return res.status(404).json({
        ok: false,
        error: `缓存键 "${key}" 不存在`,
      });
    }

    res.json({
      ok: true,
      data: {
        namespace: name,
        key,
        message: `已删除缓存条目 "${key}"`,
      },
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: `删除缓存条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
