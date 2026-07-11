/**
 * code_understanding 接入验证
 *
 * 验证 Group C 单例 codeUnderstanding 既挂上了 HTTP 面（/api/code-understanding），
 * 也接进了 LIVE 工具解析链路（内置工具 code_understanding）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import path from 'node:path';
import type { Express } from 'express';
import { initDefaultTools, listTools } from '../../server/engine/toolRegistry.js';

const TARGET = path.resolve(__dirname, '../../server/routes/codeUnderstanding.ts');

describe('code_understanding HTTP 面 (/api/code-understanding)', () => {
  let app: Express;
  beforeEach(async () => {
    const mod = await import('../../server/routes/codeUnderstanding.js');
    app = express();
    app.use(express.json());
    app.use(mod.default);
  });

  it('GET / 应返回能力清单', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
    expect(Array.isArray(res.body.endpoints)).toBe(true);
  });

  it('GET /analyze-file?path=... 应分析真实文件并返回复杂度', async () => {
    const res = await request(app).get(`/analyze-file?path=${encodeURIComponent(TARGET)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('filePath');
    expect(typeof res.body.data.complexityScore).toBe('number');
  });

  it('GET /analyze-file 缺 path 应 400', async () => {
    const res = await request(app).get('/analyze-file');
    expect(res.status).toBe(400);
  });

  it('GET /explain-symbol 缺参数应 400', async () => {
    const res = await request(app).get('/explain-symbol?path=x');
    expect(res.status).toBe(400);
  });
});

describe('code_understanding LIVE 工具 (内置工具 code_understanding)', () => {
  it('handler 应能分析真实文件并返回结构化结果', async () => {
    const { handleCodeUnderstanding } = await import('../../server/engine/codeUnderstandingTool.js');
    const out = await handleCodeUnderstanding({ action: 'analyzeFile', filePath: TARGET });
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('filePath');
    expect(typeof parsed.complexityScore).toBe('number');
  });

  it('handler 缺 filePath 应返回错误 JSON', async () => {
    const { handleCodeUnderstanding } = await import('../../server/engine/codeUnderstandingTool.js');
    const out = await handleCodeUnderstanding({ action: 'analyzeFile' });
    const parsed = JSON.parse(out);
    expect(parsed).toHaveProperty('error');
  });
});

describe('code_understanding 已注册进 LIVE 工具注册表', () => {
  it('initDefaultTools 应注册 code_understanding 工具', async () => {
    await initDefaultTools();
    expect(listTools()).toContain('code_understanding');
  });
});
