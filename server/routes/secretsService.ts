/**
 * 密钥管理 REST API
 *
 * 提供：
 * - GET    /api/secrets/list       — 列出密钥引用（不暴露值）
 * - POST   /api/secrets/set        — 设置密钥
 * - DELETE /api/secrets/delete     — 删除密钥
 * - GET    /api/secrets/stats      — 获取统计信息
 * - GET    /api/secrets/logs/:id   — 获取访问日志
 */

import { Router } from 'express';
import {
  listSecrets,
  createSecret,
  deleteSecret,
  getSecret,
  getSecretAccessLogs,
  initSecretsStore,
} from '../engine/secretsStore.js';
import {
  getSecretsStats,
  clearAllSecretCache,
  getActiveSecretsRuntimeConfigSnapshot,
} from '../engine/secretsRuntime.js';
import {
  resolveSecretRef,
  setSecret,
  removeSecret,
  validateSecretRef,
  getSecretsManagerStatus,
} from '../engine/secretsManager.js';
import type { SecretProvider } from '../engine/secretsTypes.js';

const router = Router();

// 初始化密钥存储
initSecretsStore();

/**
 * GET /api/secrets/list
 * 列出密钥引用（不暴露明文值）
 */
router.get('/list', (req, res) => {
  try {
    const provider = req.query.provider as SecretProvider | undefined;
    const secrets = listSecrets(provider);

    res.json({
      data: secrets,
      total: secrets.length,
    });
  } catch (e) {
    res.status(500).json({
      error: `获取密钥列表失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/secrets/stats
 * 获取密钥统计信息
 */
router.get('/stats', (req, res) => {
  try {
    const stats = getSecretsStats();
    res.json({ data: stats });
  } catch (e) {
    res.status(500).json({
      error: `获取统计信息失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/secrets/status
 * 获取密钥管理器状态
 */
router.get('/status', (req, res) => {
  try {
    const status = getSecretsManagerStatus();
    res.json({ data: status });
  } catch (e) {
    res.status(500).json({
      error: `获取状态失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/secrets/runtime-config
 * 获取运行时配置快照
 */
router.get('/runtime-config', (req, res) => {
  try {
    const sessionId = req.query.sessionId as string | undefined;
    const config = getActiveSecretsRuntimeConfigSnapshot(sessionId);
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({
      error: `获取运行时配置失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/secrets/logs
 * 获取所有密钥访问日志
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '100', 10);
    const logs = getSecretAccessLogs(undefined, limit);
    res.json({ data: logs, total: logs.length });
  } catch (e) {
    res.status(500).json({
      error: `获取访问日志失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/secrets/logs/:id
 * 获取指定密钥的访问日志
 */
router.get('/logs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit as string || '100', 10);
    const logs = getSecretAccessLogs(id, limit);
    res.json({ data: logs, total: logs.length });
  } catch (e) {
    res.status(500).json({
      error: `获取访问日志失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/secrets/set
 * 设置密钥（创建或更新）
 */
router.post('/set', (req, res) => {
  try {
    const { provider, key, value, type, description } = req.body;

    // 参数验证
    if (!provider || typeof provider !== 'string') {
      return res.status(400).json({ error: 'provider 不能为空' });
    }

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'key 不能为空' });
    }

    if (!value || typeof value !== 'string') {
      return res.status(400).json({ error: 'value 不能为空' });
    }

    const validProviders: SecretProvider[] = ['env', 'file', 'encrypted', 'keychain'];
    if (!validProviders.includes(provider as SecretProvider)) {
      return res.status(400).json({
        error: `无效的 provider: ${provider}，有效值: ${validProviders.join(', ')}`,
      });
    }

    // 设置密钥
    setSecret(
      provider as SecretProvider,
      key,
      value,
      type,
      description
    );

    res.json({
      data: {
        success: true,
        provider,
        key,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `设置密钥失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/secrets/resolve
 * 解析密钥引用（返回明文值，谨慎使用）
 */
router.post('/resolve', (req, res) => {
  try {
    const { provider, key, type, source, useCache } = req.body;

    // 参数验证
    if (!provider || !key) {
      return res.status(400).json({ error: 'provider 和 key 不能为空' });
    }

    const ref = { provider, key, type };
    const resolved = resolveSecretRef(
      ref,
      source || 'api-resolve',
      useCache !== false
    );

    if (!resolved) {
      return res.status(404).json({
        error: '密钥解析失败',
        ref,
      });
    }

    // 注意：此接口返回明文值，仅用于内部服务调用
    res.json({
      data: {
        provider: resolved.source,
        key: ref.key,
        value: resolved.value,
        resolvedAt: resolved.resolvedAt,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `解析密钥失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/secrets/validate
 * 验证密钥是否存在
 */
router.post('/validate', (req, res) => {
  try {
    const { provider, key, type } = req.body;

    if (!provider || !key) {
      return res.status(400).json({ error: 'provider 和 key 不能为空' });
    }

    const ref = { provider, key, type };
    const exists = validateSecretRef(ref);

    res.json({
      data: {
        exists,
        ref,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `验证密钥失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * DELETE /api/secrets/delete
 * 删除密钥
 */
router.delete('/delete', (req, res) => {
  try {
    const { provider, key } = req.body;

    if (!provider || !key) {
      return res.status(400).json({ error: 'provider 和 key 不能为空' });
    }

    const success = removeSecret(provider as SecretProvider, key);

    if (!success) {
      return res.status(404).json({
        error: '密钥不存在',
        provider,
        key,
      });
    }

    res.json({
      data: {
        success: true,
        provider,
        key,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `删除密钥失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * DELETE /api/secrets/:id
 * 根据 ID 删除密钥
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'id 不能为空' });
    }

    const secret = getSecret(id);
    if (!secret) {
      return res.status(404).json({ error: `密钥不存在: ${id}` });
    }

    const success = deleteSecret(id);

    if (!success) {
      return res.status(500).json({ error: '删除密钥失败' });
    }

    res.json({
      data: {
        success: true,
        id,
        provider: secret.provider,
        key: secret.key,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `删除密钥失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/secrets/cache/clear
 * 清除所有缓存
 */
router.post('/cache/clear', (req, res) => {
  try {
    clearAllSecretCache();
    res.json({
      data: {
        success: true,
        message: '缓存已清除',
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `清除缓存失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

export default router;