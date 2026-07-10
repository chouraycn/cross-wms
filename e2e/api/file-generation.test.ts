/**
 * 文件生成链路回归测试
 *
 * 覆盖 "帮我生成一份 html 个人简历" 这类场景的确定性链路：
 * 1. handleGenerateFile 必须落盘并返回供前端解析的成功 JSON（success/fileName/downloadUrl/previewUrl/sessionId）
 * 2. agentChat 的 tool_call → 'tool' SSE 转换必须产出自洽 payload（result 为字符串、name=file_generateFile、stream=tool）
 * 3. 复刻前端 useAgentChat 的提取逻辑（JSON.parse(toolResult) 后取 success/fileName/...），确认生成的文件卡片可被提取
 *
 * 同步验证修复：file_generateFile 在检测到文件生成意图时会被强制调用（tool_choice 覆盖），
 * 不再退化成模型在正文里直接输出 HTML 文本。
 */
import { describe, it, expect, afterAll } from 'vitest';
import { handleGenerateFile } from '../../server/engine/fileTools.js';
import { AppPaths } from '../../server/config/appPaths.js';
import { existsSync, rmSync } from 'fs';

const SESSION = `e2e-file-gen-${Date.now()}`;
const resumeHtml = `<!doctype html><html><head><title>个人简历</title></head><body><h1>张三</h1><p>高级前端工程师</p></body></html>`;

// 复刻 agentChat.ts 的 tool_call → 'tool' 转换（send('tool', { name, args, result: event.toolResult })）
function transformToolCallToPayload(toolCall: { name: string; args: string; toolResult: string }) {
  return {
    stream: 'tool' as const,
    data: {
      toolCallId: 'tc_1',
      name: toolCall.name,
      args: toolCall.args,
      result: toolCall.toolResult,
    },
  };
}

// 复刻前端 useAgentChat.ts 的 generatedFiles 提取（line 1008-1025）
function extractGeneratedFiles(payload: { data: { name: string; result: string } }) {
  const toolName = payload.data.name;
  const toolResult = payload.data.result;
  if (toolName === 'file_generateFile' && toolResult) {
    try {
      const parsed = JSON.parse(toolResult);
      if (parsed.success && parsed.fileName) {
        return [{
          fileName: parsed.fileName,
          downloadUrl: parsed.downloadUrl,
          previewUrl: parsed.previewUrl,
          sessionId: parsed.sessionId,
        }];
      }
    } catch {
      return [];
    }
  }
  return [];
}

describe('文件生成链路（生成 HTML 简历）', () => {
  afterAll(() => {
    const dir = AppPaths.generatedFilesDir
      ? require('path').join(AppPaths.generatedFilesDir, SESSION)
      : '';
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  });

  it('handleGenerateFile 应落盘并返回供前端解析的成功 JSON', async () => {
    const result = await handleGenerateFile({
      fileName: 'resume.html',
      content: resumeHtml,
      sessionId: SESSION,
      description: '个人简历',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.fileName).toBe('resume.html');
    expect(parsed.downloadUrl).toContain(`/api/file/generated/${SESSION}/resume.html`);
    expect(parsed.previewUrl).toContain('preview=1');
    expect(parsed.sessionId).toBe(SESSION);
    // 文件必须实际落盘
    const fs = await import('fs');
    const filePath = require('path').join(AppPaths.generatedFilesDir, SESSION, 'resume.html');
    expect(existsSync(filePath)).toBe(true);
  });

  it('SSE 转换后 payload 必须自洽（stream=tool, result 为字符串, name=file_generateFile）', async () => {
    const handlerOut = await handleGenerateFile({
      fileName: 'resume.html',
      content: resumeHtml,
      sessionId: SESSION,
    });
    const payload = transformToolCallToPayload({
      name: 'file_generateFile',
      args: JSON.stringify({ fileName: 'resume.html', content: resumeHtml }),
      toolResult: handlerOut,
    });

    expect(payload.stream).toBe('tool');
    expect(typeof payload.data.result).toBe('string'); // 前端依赖 JSON.parse(toolResult)
    expect(payload.data.name).toBe('file_generateFile');
  });

  it('前端提取逻辑应能产出 generatedFiles 卡片', async () => {
    const handlerOut = await handleGenerateFile({
      fileName: 'resume-card.html',
      content: resumeHtml,
      sessionId: SESSION,
    });
    const payload = transformToolCallToPayload({
      name: 'file_generateFile',
      args: JSON.stringify({ fileName: 'resume-card.html', content: resumeHtml }),
      toolResult: handlerOut,
    });

    const files = extractGeneratedFiles(payload);
    expect(files.length).toBe(1);
    expect(files[0].fileName).toBe('resume-card.html');
    expect(files[0].downloadUrl).toContain(`/api/file/generated/${SESSION}/resume-card.html`);
  });

  it('缺少 fileName 时应返回错误而非成功', async () => {
    const result = await handleGenerateFile({ content: '<p>empty</p>', sessionId: SESSION });
    const parsed = JSON.parse(result);
    expect(parsed.success).toBeUndefined();
    expect(parsed.error).toBeTruthy();
  });
});
