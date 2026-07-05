/**
 * Web Search REST API
 *
 * 提供：
 * - POST /api/web-search/test — 测试指定搜索 provider 连接
 */

import { Router } from 'express';
import { webSearch, DEFAULT_SEARCH_USER_AGENT } from '../engine/web-search-new.js';
import type { WebSearchParams, WebSearchOptions } from '../engine/web-search-new.js';
import { getSecretValueByKey } from '../engine/secretsStore.js';

const router = Router();

/**
 * POST /api/web-search/test
 * 测试指定搜索 provider 的连接
 *
 * Body: { provider: 'kimi' | 'minimax', query: string, maxResults: number }
 */
router.post('/test', async (req, res) => {
  try {
    const { provider, query, maxResults } = req.body;

    if (!provider || !['kimi', 'minimax'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'provider 必须是 kimi 或 minimax',
      });
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'query 必须是非空字符串',
      });
    }

    const params: WebSearchParams = {
      query,
      maxResults: maxResults || 3,
      timeoutMs: 15000,
      userAgent: DEFAULT_SEARCH_USER_AGENT,
      useCache: true,
      cacheTtlMs: 600000,
      renderJs: false,
      safeSearch: 'moderate',
      language: 'zh-CN',
      timeRange: 'any',
      retries: 1,
      retryDelayMs: 500,
      priority: 'normal',
      includeRawResults: false,
      onlyPluginIds: [provider === 'kimi' ? 'kimi' : 'minimax'],
    };

    const options: WebSearchOptions = {};

    // 从 secrets DB 加载 API Key
    const searchConfig: Record<string, unknown> = {};
    try {
      const keyName = provider === 'kimi' ? 'KIMI_API_KEY' : 'MINIMAX_API_KEY';
      const apiKey = getSecretValueByKey('encrypted', keyName, 'web-search-test');
      if (apiKey) {
        searchConfig.apiKey = apiKey;
      }
      if (provider === 'minimax') {
        const groupId = getSecretValueByKey('encrypted', 'MINIMAX_GROUP_ID', 'web-search-test');
        if (groupId) {
          searchConfig.groupId = groupId;
        }
      }
    } catch {
      // ignore
    }
    if (Object.keys(searchConfig).length > 0) {
      options.searchConfig = searchConfig;
    }

    const result = await webSearch(params, options);

    res.json({
      success: result.count > 0,
      provider: result.provider,
      count: result.count,
      results: result.results.slice(0, 3),
      error: result.count === 0 ? '搜索返回空结果' : undefined,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;