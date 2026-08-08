/**
 * Canvas Tool 单元测试
 *
 * 覆盖：
 * - createCanvasTool 基本功能
 * - 各 action 调用（present/hide/navigate/eval/snapshot/a2ui_push/a2ui_reset）
 * - 节点解析
 * - fetchCanvasSnapshotFromNode
 * - saveCanvasSnapshotToFile
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createCanvasTool,
  fetchCanvasSnapshotFromNode,
  saveCanvasSnapshotToFile,
} from '../canvasTool.js';
import type {
  AnyAgentTool,
  CanvasNodeInfo,
  CanvasGatewayOptions,
} from '../types.js';

describe('Canvas Tool — 画布工具', () => {
  let tempDir: string;
  let mockNodes: CanvasNodeInfo[];
  let mockCallHistory: Array<{ command: string; params: Record<string, unknown> }>;

  const mockListNodes = async (_opts: CanvasGatewayOptions): Promise<CanvasNodeInfo[]> => {
    return mockNodes;
  };

  const mockCallGatewayTool = async (
    command: string,
    _opts: CanvasGatewayOptions,
    params: Record<string, unknown>,
  ): Promise<{ payload?: unknown }> => {
    mockCallHistory.push({ command, params });

    if (command === 'node.invoke' && params.command === 'canvas.snapshot') {
      return {
        payload: {
          format: 'png',
          base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          width: 1,
          height: 1,
        },
      };
    }

    if (command === 'node.invoke' && params.command === 'canvas.eval') {
      return {
        payload: { result: 'eval-result' },
      };
    }

    return { payload: { ok: true } };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-test-'));
    mockNodes = [
      { id: 'node-1', label: 'Main Canvas', status: 'running' },
      { id: 'node-2', label: 'Secondary', status: 'idle' },
    ];
    mockCallHistory = [];
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // 1
  it('createCanvasTool 应创建有效的工具对象', () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
      snapshotDir: tempDir,
    });

    expect(tool.name).toBe('canvas');
    expect(tool.label).toBe('Canvas');
    expect(typeof tool.execute).toBe('function');
    expect(tool.parameters).toBeDefined();
  });

  // 2
  it('present action 应调用 canvas.present', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    const result = await tool.execute!('call-1', {
      action: 'present',
      url: 'https://example.com',
      x: 10,
      y: 20,
      width: 800,
      height: 600,
    });

    expect(result.content.length).toBeGreaterThan(0);
    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.command).toBe('node.invoke');
    expect(lastCall.params.command).toBe('canvas.present');
    expect((lastCall.params.params as unknown).url).toBe('https://example.com');
    expect((lastCall.params.params as unknown).placement).toBeDefined();
  });

  // 3
  it('hide action 应调用 canvas.hide', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await tool.execute!('call-1', { action: 'hide' });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.command).toBe('canvas.hide');
  });

  // 4
  it('navigate action 应调用 canvas.navigate', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await tool.execute!('call-1', {
      action: 'navigate',
      url: 'https://example.com/page',
    });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.command).toBe('canvas.navigate');
    expect((lastCall.params.params as unknown).url).toBe('https://example.com/page');
  });

  // 5
  it('eval action 应调用 canvas.eval 并返回结果', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    const result = await tool.execute!('call-1', {
      action: 'eval',
      javaScript: 'document.title',
    });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.command).toBe('canvas.eval');
    expect((lastCall.params.params as unknown).javaScript).toBe('document.title');
    expect(result.content[0].type).toBe('text');
    expect((result.content[0] as unknown).text).toBe('eval-result');
  });

  // 6
  it('snapshot action 应保存快照到文件', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
      snapshotDir: tempDir,
    });

    const result = await tool.execute!('call-1', {
      action: 'snapshot',
      outputFormat: 'png',
    });

    expect(result.content.length).toBeGreaterThan(0);
    const textContent = result.content.find((c) => c.type === 'text') as { type: 'text'; text: string };
    expect(textContent).toBeDefined();
    expect(textContent.text).toContain('saved to');

    const filePath = (result.details as unknown)?.path;
    expect(filePath).toBeDefined();
    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  // 7
  it('a2ui_reset action 应调用 canvas.a2ui.reset', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await tool.execute!('call-1', { action: 'a2ui_reset' });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.command).toBe('canvas.a2ui.reset');
  });

  // 8
  it('未知 action 应抛出错误', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await expect(
      tool.execute!('call-1', { action: 'unknown_action' }),
    ).rejects.toThrow();
  });

  // 9
  it('节点解析：应按 ID 精确匹配', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await tool.execute!('call-1', {
      action: 'hide',
      node: 'node-2',
    });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.nodeId).toBe('node-2');
  });

  // 10
  it('节点解析：应按 label 模糊匹配', async () => {
    const tool = createCanvasTool({
      listNodes: mockListNodes,
      callGatewayTool: mockCallGatewayTool,
    });

    await tool.execute!('call-1', {
      action: 'hide',
      node: 'secondary',
    });

    const lastCall = mockCallHistory[mockCallHistory.length - 1];
    expect(lastCall.params.nodeId).toBe('node-2');
  });

  // 11
  it('fetchCanvasSnapshotFromNode 应返回快照载荷', async () => {
    const result = await fetchCanvasSnapshotFromNode({
      nodeId: 'node-1',
      format: 'png',
      callGatewayTool: mockCallGatewayTool,
    });

    expect(result.format).toBe('png');
    expect(result.base64).toBeDefined();
    expect(result.base64.length).toBeGreaterThan(0);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
  });

  // 12
  it('saveCanvasSnapshotToFile 应保存到指定路径', async () => {
    const testPath = path.join(tempDir, 'test-snapshot.png');
    const payload = {
      format: 'png' as const,
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      width: 1,
      height: 1,
    };

    const savedPath = await saveCanvasSnapshotToFile({
      payload,
      filePath: testPath,
    });

    expect(savedPath).toBe(testPath);
    const exists = await fs.access(testPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(testPath);
    expect(content.length).toBeGreaterThan(0);
  });
});
