/**
 * API 文档自动化 — OpenAPI 3.0 + Swagger UI
 *
 * 端点：
 *   GET /api/docs          — Swagger UI 交互式文档（CDN 加载，无需前端构建）
 *   GET /api/docs/openapi.json — OpenAPI 3.0 规范 JSON
 *
 * 设计：
 * - 不引入新 npm 依赖，Swagger UI 走 CDN（webview 内联渲染）
 * - OpenAPI 规范手写覆盖核心 API，后续可通过装饰器自动生成扩展
 * - 与 /api/health 同级挂载，开发与生产环境均可访问
 */

import { Router, type Request, type Response } from 'express';

const router = Router();

// ===================== OpenAPI 规范 =====================

const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Cross-WMS API',
    description: '仓储管理系统 + 数字员工 + AI 对话后端 API 文档',
    version: '1.0.0',
    contact: { name: 'Cross-WMS Team' },
  },
  servers: [
    { url: '/api', description: '当前实例' },
  ],
  tags: [
    { name: 'Health', description: '健康检查' },
    { name: 'Sessions', description: 'AI 对话会话' },
    { name: 'Chat', description: 'AI 对话' },
    { name: 'WMS', description: '仓储管理' },
    { name: 'StaffDeck', description: '数字员工' },
    { name: 'Skills', description: '技能管理' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: '服务器健康检查',
        responses: {
          '200': {
            description: '服务正常',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string' } } } } },
          },
        },
      },
    },
    '/sessions': {
      get: {
        tags: ['Sessions'],
        summary: '列出 AI 对话会话',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        ],
        responses: { '200': { description: '会话列表' } },
      },
      post: {
        tags: ['Sessions'],
        summary: '创建新会话',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { title: { type: 'string' } } } } } },
        responses: { '201': { description: '创建成功' } },
      },
    },
    '/chat': {
      post: {
        tags: ['Chat'],
        summary: 'AI 对话（SSE 流式）',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { sessionId: { type: 'string' }, message: { type: 'string' } } } } } },
        responses: { '200': { description: 'SSE 流式响应' } },
      },
    },
    '/warehouses': {
      get: { tags: ['WMS'], summary: '列出仓库', responses: { '200': { description: '仓库列表' } } },
      post: { tags: ['WMS'], summary: '创建仓库', responses: { '201': { description: '创建成功' } } },
    },
    '/inventory': {
      get: { tags: ['WMS'], summary: '列出库存', responses: { '200': { description: '库存列表' } } },
    },
    '/inbound-records': {
      get: { tags: ['WMS'], summary: '列出入库记录', responses: { '200': { description: '入库记录列表' } } },
      post: { tags: ['WMS'], summary: '创建入库记录', responses: { '201': { description: '创建成功' } } },
    },
    '/outbound-records': {
      get: { tags: ['WMS'], summary: '列出出库记录', responses: { '200': { description: '出库记录列表' } } },
      post: { tags: ['WMS'], summary: '创建出库记录', responses: { '201': { description: '创建成功' } } },
    },
    '/staffdeck/chat/sessions': {
      get: {
        tags: ['StaffDeck'],
        summary: '列出数字员工会话',
        parameters: [{ name: 'tenant_id', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '员工会话列表' } },
      },
      post: { tags: ['StaffDeck'], summary: '创建员工会话', responses: { '201': { description: '创建成功' } } },
    },
    '/staffdeck/chat/stream': {
      post: {
        tags: ['StaffDeck'],
        summary: '数字员工对话（SSE 流式）',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { agent_id: { type: 'string' }, message: { type: 'string' } } } } } },
        responses: { '200': { description: 'SSE 流式响应' } },
      },
    },
    '/skills': {
      get: { tags: ['Skills'], summary: '列出技能', responses: { '200': { description: '技能列表' } } },
    },
  },
};

// ===================== Swagger UI HTML =====================

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cross-WMS API 文档</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    body { margin: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.addEventListener('DOMContentLoaded', function () {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
      });
    });
  </script>
</body>
</html>`;

// ===================== 路由 =====================

router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(OPENAPI_SPEC);
});

router.get('/', (_req: Request, res: Response) => {
  res.type('html').send(SWAGGER_UI_HTML);
});

export default router;
