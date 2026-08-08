/**
 * Cache Management REST API 集成测试
 *
 * 覆盖 /api/cache/* 的所有端点：
 * - GET /stats — 整体缓存统计
 * - GET /namespaces — 命名空间列表
 * - GET /namespaces/:name — 命名空间详情
 * - POST /clear — 清空所有缓存
 * - POST /namespaces/:name/clear — 清空指定命名空间
 * - DELETE /namespaces/:name — 删除命名空间
 * - POST /prune — 清理过期缓存
 * - POST /stats/reset — 重置统计
 * - GET /namespaces/:name/keys — 键列表（分页）
 * - GET /namespaces/:name/keys/:key — 查看条目
 * - DELETE /namespaces/:name/keys/:key — 删除条目
 */

import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { cacheManager } from '../../cache/cache-manager.js';

import cacheRouter from '../cache.js';

describe('Cache REST API', () => {
  let app: express.Application;

  beforeEach(() => {
    // 彻底删除所有命名空间，确保测试间隔离
    for (const name of cacheManager.getCacheNames()) {
      cacheManager.deleteCache(name);
    }
    app = express();
    app.use(express.json());
    app.use('/api/cache', cacheRouter);
  });

  // ===================== GET /stats =====================
  describe('GET /api/cache/stats', () => {
    it('返回整体缓存统计', async () => {
      const res = await request(app).get('/api/cache/stats');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data).toHaveProperty('totalCaches');
      expect(res.body.data).toHaveProperty('totalEntries');
      expect(res.body.data).toHaveProperty('totalMemory');
      expect(res.body.data).toHaveProperty('overallHitRate');
      expect(res.body.data).toHaveProperty('namespaces');
    });

    it('包含格式化后的内存大小和命中率', async () => {
      cacheManager.getCache('test-ns').set('k', 'v');
      const res = await request(app).get('/api/cache/stats');
      expect(res.body.data.totalMemoryFormatted).toBeDefined();
      expect(res.body.data.overallHitRatePercent).toContain('%');
    });
  });

  // ===================== GET /namespaces =====================
  describe('GET /api/cache/namespaces', () => {
    it('返回命名空间列表', async () => {
      cacheManager.getCache('ns-1');
      cacheManager.getCache('ns-2');

      const res = await request(app).get('/api/cache/namespaces');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.active).toContain('ns-1');
      expect(res.body.data.active).toContain('ns-2');
      expect(res.body.data.count).toBe(2);
      expect(res.body.data.predefined).toBeInstanceOf(Array);
    });
  });

  // ===================== GET /namespaces/:name =====================
  describe('GET /api/cache/namespaces/:name', () => {
    it('返回存在的命名空间详情', async () => {
      cacheManager.getCache('test-ns', { maxSize: 100 }).set('k', 'v');

      const res = await request(app).get('/api/cache/namespaces/test-ns');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.name).toBe('test-ns');
      expect(res.body.data.stats).toBeDefined();
      expect(res.body.data.options).toBeDefined();
      expect(res.body.data.stats.hitRatePercent).toContain('%');
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).get('/api/cache/namespaces/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // ===================== POST /clear =====================
  describe('POST /api/cache/clear', () => {
    it('清空所有缓存', async () => {
      cacheManager.getCache('ns-1').set('k1', 'v1');
      cacheManager.getCache('ns-2').set('k2', 'v2');

      const res = await request(app).post('/api/cache/clear');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.clearedEntries).toBe(2);

      expect(cacheManager.getCache('ns-1').size()).toBe(0);
      expect(cacheManager.getCache('ns-2').size()).toBe(0);
    });
  });

  // ===================== POST /namespaces/:name/clear =====================
  describe('POST /api/cache/namespaces/:name/clear', () => {
    it('清空指定命名空间', async () => {
      cacheManager.getCache('ns-1').set('k', 'v');
      cacheManager.getCache('ns-2').set('k', 'v');

      const res = await request(app).post('/api/cache/namespaces/ns-1/clear');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.namespace).toBe('ns-1');

      expect(cacheManager.getCache('ns-1').size()).toBe(0);
      expect(cacheManager.getCache('ns-2').size()).toBe(1); // ns-2 不受影响
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).post('/api/cache/namespaces/nonexistent/clear');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // ===================== DELETE /namespaces/:name =====================
  describe('DELETE /api/cache/namespaces/:name', () => {
    it('删除存在的命名空间', async () => {
      cacheManager.getCache('to-delete').set('k', 'v');

      const res = await request(app).delete('/api/cache/namespaces/to-delete');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(cacheManager.hasCache('to-delete')).toBe(false);
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).delete('/api/cache/namespaces/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // ===================== POST /prune =====================
  describe('POST /api/cache/prune', () => {
    it('清理过期缓存', async () => {
      const cache = cacheManager.getCache('ns-1');
      cache.set('a', 'value-a');
      cache.set('b', 'value-b');

      // 模拟过期
      for (const entry of (cache as any).cache.values()) {
        entry.expiresAt = Date.now() - 1;
      }

      const res = await request(app).post('/api/cache/prune');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.removedEntries).toBe(2);
    });
  });

  // ===================== POST /stats/reset =====================
  describe('POST /api/cache/stats/reset', () => {
    it('重置所有缓存统计', async () => {
      const cache = cacheManager.getCache('ns-1');
      cache.set('k', 'v');
      cache.get('k'); // hit
      cache.get('missing'); // miss

      const res = await request(app).post('/api/cache/stats/reset');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const stats = cacheManager.getStats();
      expect(stats.namespaces['ns-1'].hitCount).toBe(0);
    });
  });

  // ===================== GET /namespaces/:name/keys =====================
  describe('GET /api/cache/namespaces/:name/keys', () => {
    it('返回命名空间的所有键（分页）', async () => {
      const cache = cacheManager.getCache('ns-1');
      cache.set('key-1', 'v1');
      cache.set('key-2', 'v2');

      const res = await request(app).get('/api/cache/namespaces/ns-1/keys');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.namespace).toBe('ns-1');
      expect(res.body.data.total).toBe(2);
      expect(res.body.data.keys).toContain('key-1');
      expect(res.body.data.keys).toContain('key-2');
    });

    it('支持 limit 和 offset 分页', async () => {
      const cache = cacheManager.getCache('ns-1');
      for (let i = 1; i <= 5; i++) {
        cache.set(`key-${i}`, `v${i}`);
      }

      const res = await request(app)
        .get('/api/cache/namespaces/ns-1/keys')
        .query({ limit: 2, offset: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.returned).toBe(2);
      expect(res.body.data.limit).toBe(2);
      expect(res.body.data.offset).toBe(1);
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).get('/api/cache/namespaces/nonexistent/keys');
      expect(res.status).toBe(404);
    });
  });

  // ===================== GET /namespaces/:name/keys/:key =====================
  describe('GET /api/cache/namespaces/:name/keys/:key', () => {
    it('返回指定缓存条目的详细信息', async () => {
      cacheManager.getCache('ns-1').set('my-key', 'my-value');

      const res = await request(app).get('/api/cache/namespaces/ns-1/keys/my-key');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.key).toBe('my-key');
      expect(res.body.data.value).toBe('my-value');
      expect(res.body.data).toHaveProperty('createdAt');
      expect(res.body.data).toHaveProperty('expiresAt');
      expect(res.body.data).toHaveProperty('ttlRemaining');
      expect(res.body.data).toHaveProperty('size');
      expect(res.body.data).toHaveProperty('sizeFormatted');
    });

    it('不存在的 key 返回 404', async () => {
      cacheManager.getCache('ns-1');
      const res = await request(app).get('/api/cache/namespaces/ns-1/keys/missing');
      expect(res.status).toBe(404);
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).get('/api/cache/namespaces/nonexistent/keys/key');
      expect(res.status).toBe(404);
    });
  });

  // ===================== DELETE /namespaces/:name/keys/:key =====================
  describe('DELETE /api/cache/namespaces/:name/keys/:key', () => {
    it('删除指定的缓存条目', async () => {
      cacheManager.getCache('ns-1').set('to-delete', 'value');

      const res = await request(app).delete('/api/cache/namespaces/ns-1/keys/to-delete');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.key).toBe('to-delete');

      expect(cacheManager.getCache('ns-1').get('to-delete')).toBeUndefined();
    });

    it('不存在的 key 返回 404', async () => {
      cacheManager.getCache('ns-1');
      const res = await request(app).delete('/api/cache/namespaces/ns-1/keys/missing');
      expect(res.status).toBe(404);
    });

    it('不存在的命名空间返回 404', async () => {
      const res = await request(app).delete('/api/cache/namespaces/nonexistent/keys/key');
      expect(res.status).toBe(404);
    });
  });
});
