/**
 * Gateway — API 兼容网关模块
 *
 * 功能特性：
 * - OpenAI 兼容的 Chat Completions API
 * - DeepSeek 等国产模型优先支持
 * - 标准认证（API Key + Token）
 * - 多 Provider 自动路由
 *
 * API 端点：
 * - POST /v1/chat/completions     Chat Completions
 * - GET  /v1/models               模型列表
 * - GET  /health                  健康检查
 */

import { Router, type Request, type Response } from 'express';
import { callOpenAICompatibleStream } from '../aiClient.js';
import { logger } from '../logger.js';
import { authenticateRequest } from './gatewayAuth.js';

// ==================== 类型定义 ====================

export interface GatewayConfig {
  enabled: boolean;
  port: number;
  host: string;
  apiKeys: string[];
  allowedOrigins: string[];
  rateLimitPerMinute: number;
  defaultModel: string;
  providerPriority: string[];
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface OpenAIChatCompletionRequest {
  model?: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: Array<{
    type: 'function';
    function: { name: string; description?: string; parameters: Record<string, unknown> };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stop?: string | string[];
  frequency_penalty?: number;
  presence_penalty?: number;
  user?: string;
}

export interface OpenAIChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
}

export interface OpenAIModel {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
  permission: unknown[];
  root: string;
  parent: string | null;
}

// ==================== Provider 路由配置 ====================

const PROVIDER_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-v3', 'deepseek-v4'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
  anthropic: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku', 'claude-sonnet-4'],
  zhipu: ['glm-4', 'glm-4-plus', 'glm-4-flash', 'glm-4v', 'glm-3-turbo'],
  google: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-pro'],
  alibaba: ['qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen-coder'],
  moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  volcengine: ['doubao-pro', 'doubao-lite'],
  minimax: ['abab6-chat', 'abab5.5-chat'],
  stepfun: ['step-1v', 'step-1-flash'],
};

const DEFAULT_PROVIDER_ORDER = [
  'deepseek',
  'zhipu',
  'alibaba',
  'baidu',
  'tencent',
  'minimax',
  'stepfun',
  'moonshot',
  'volcengine',
  'google',
  'anthropic',
  'openai',
];

function detectProvider(modelId: string): string {
  const lower = modelId.toLowerCase();

  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    for (const model of models) {
      if (lower.includes(model.toLowerCase()) || model.toLowerCase().includes(lower)) {
        return provider;
      }
    }
  }

  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (lower.includes(provider)) {
      return provider;
    }
  }

  return 'deepseek';
}

function normalizeModelId(modelId: string): string {
  const lower = modelId.toLowerCase();

  const modelMap: Record<string, string> = {
    'gpt-4': 'gpt-4-turbo',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'deepseek-chat': 'deepseek-chat',
    'deepseek-v3': 'deepseek-v3',
    'claude': 'claude-sonnet-4',
    'claude-3': 'claude-3-5-sonnet-20240620',
    'glm-4': 'glm-4',
    'glm-4-plus': 'glm-4-plus',
    'qwen': 'qwen-plus',
    'gemini': 'gemini-2.0-flash',
  };

  for (const [key, value] of Object.entries(modelMap)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return modelId;
}

// ==================== Gateway Router ====================

const gatewayRouter = Router();

// ==================== 中间件 ====================

gatewayRouter.use((req: Request, res: Response, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.debug(`[Gateway] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// 健康检查（无需认证）
gatewayRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// 获取模型列表
gatewayRouter.get('/v1/models', async (_req: Request, res: Response) => {
  try {
    const models: OpenAIModel[] = [
      { id: 'deepseek-chat', object: 'model', created: 1700000000, owned_by: 'DeepSeek', permission: [], root: 'deepseek-chat', parent: null },
      { id: 'deepseek-v3', object: 'model', created: 1700000000, owned_by: 'DeepSeek', permission: [], root: 'deepseek-v3', parent: null },
      { id: 'gpt-4o', object: 'model', created: 1700000000, owned_by: 'system', permission: [], root: 'gpt-4o', parent: null },
      { id: 'gpt-4o-mini', object: 'model', created: 1700000000, owned_by: 'system', permission: [], root: 'gpt-4o-mini', parent: null },
      { id: 'gpt-4-turbo', object: 'model', created: 1700000000, owned_by: 'system', permission: [], root: 'gpt-4-turbo', parent: null },
      { id: 'claude-sonnet-4', object: 'model', created: 1700000000, owned_by: 'Anthropic', permission: [], root: 'claude-sonnet-4', parent: null },
      { id: 'glm-4', object: 'model', created: 1700000000, owned_by: 'ZhipuAI', permission: [], root: 'glm-4', parent: null },
      { id: 'glm-4-plus', object: 'model', created: 1700000000, owned_by: 'ZhipuAI', permission: [], root: 'glm-4-plus', parent: null },
      { id: 'qwen-plus', object: 'model', created: 1700000000, owned_by: 'Alibaba', permission: [], root: 'qwen-plus', parent: null },
      { id: 'gemini-2.0-flash', object: 'model', created: 1700000000, owned_by: 'Google', permission: [], root: 'gemini-2.0-flash', parent: null },
    ];

    res.json({
      object: 'list',
      data: models,
    });
  } catch (error) {
    logger.error('[Gateway] 获取模型列表失败:', error);
    res.status(500).json({ error: { message: 'Failed to list models', type: 'server_error' } });
  }
});

// Chat Completions（需认证）
gatewayRouter.post('/v1/chat/completions', async (req: Request, res: Response) => {
  const authResult = await authenticateRequest(req);
  if (!authResult.authenticated) {
    res.status(401).json({
      error: {
        message: authResult.error || 'Unauthorized',
        type: 'authentication_error',
        code: 'invalid_api_key',
      },
    });
    return;
  }

  try {
    const body = req.body as OpenAIChatCompletionRequest;
    const {
      messages,
      model = 'deepseek-chat',
      stream = false,
      temperature,
      max_tokens,
    } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: { message: 'messages is required', type: 'invalid_request_error' },
      });
      return;
    }

    const provider = detectProvider(model);
    const normalizedModel = normalizeModelId(model);

    logger.info(`[Gateway] Chat Completion: model=${model}, provider=${provider}, stream=${stream}`);

    // 流式响应
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      try {
        let fullContent = '';
        let firstChunk = true;
        const completionId = `chatcmpl-${Date.now()}`;

        // 将 OpenAI 格式转换为内部格式
        const chatMessages = messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content || '',
        }));

        const result = await callOpenAICompatibleStream(
          '', // API endpoint 由 aiClient 内部处理
          undefined,
          normalizedModel,
          chatMessages as Array<{ role: string; content: string }>,
          temperature || 0.7,
          max_tokens || 4096,
          (chunk: string) => {
            fullContent += chunk;

            if (firstChunk) {
              res.write(`data: ${JSON.stringify({
                id: completionId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: normalizedModel,
                choices: [{
                  index: 0,
                  delta: { role: 'assistant', content: chunk },
                  finish_reason: null,
                }],
              })}\n\n`);
              firstChunk = false;
            } else {
              res.write(`data: ${JSON.stringify({
                id: completionId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: normalizedModel,
                choices: [{
                  index: 0,
                  delta: { content: chunk },
                  finish_reason: null,
                }],
              })}\n\n`);
            }
          },
          undefined,
          undefined,
          undefined
        );

        // 发送结束信号
        res.write(`data: ${JSON.stringify({
          id: completionId,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: normalizedModel,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop',
          }],
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();

      } catch (error) {
        logger.error('[Gateway] 流式响应失败:', error);
        res.write(`data: ${JSON.stringify({
          error: {
            message: error instanceof Error ? error.message : 'Stream error',
            type: 'server_error',
          },
        })}\n\n`);
        res.end();
      }

    } else {
      // 非流式响应
      try {
        const chatMessages = messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content || '',
        }));

        const result = await callOpenAICompatibleStream(
          '',
          undefined,
          normalizedModel,
          chatMessages as Array<{ role: string; content: string }>,
          temperature || 0.7,
          max_tokens || 4096,
          (chunk: string) => {} // 非流式模式不使用回调
        );

        res.json({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: normalizedModel,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: result.content,
            },
            finish_reason: 'stop',
          }],
          usage: result.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        });

      } catch (error) {
        logger.error('[Gateway] 非流式响应失败:', error);
        res.status(500).json({
          error: {
            message: error instanceof Error ? error.message : 'Internal server error',
            type: 'server_error',
          },
        });
      }
    }

  } catch (error) {
    logger.error('[Gateway] Chat Completions 请求处理失败:', error);
    res.status(500).json({
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        type: 'server_error',
      },
    });
  }
});

export default gatewayRouter;
