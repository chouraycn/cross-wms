/**
 * Analyzers 单元测试（image / video / audio / document）
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createImageAnalyzer } from '../image-analyzer.js';
import { createVideoAnalyzer, sampleKeyframes, buildDefaultScenes } from '../video-analyzer.js';
import { createAudioAnalyzer, inferEmotionFromText } from '../audio-analyzer.js';
import { createDocumentAnalyzer, inferDocumentType } from '../document-analyzer.js';
import { createProviderRegistry, registerMultimodalProvider, registerOcrProvider } from '../provider-registry.js';
import { createMultimodalProvider } from '../providers/multimodal.js';
import { createOcrProvider } from '../providers/ocr.js';
import type { ProviderRegistry } from '../provider-registry.js';

function buildRegistry(): ProviderRegistry {
  const registry = createProviderRegistry();
  registerMultimodalProvider(
    registry,
    createMultimodalProvider({
      describeFn: async (_input, prompt) => `响应: ${prompt.slice(0, 10)}\ntags: 测试, 标签`,
    }),
  );
  registerOcrProvider(
    registry,
    createOcrProvider({ recognizeFn: async () => 'OCR结果' }),
  );
  return registry;
}

describe('ImageAnalyzer', () => {
  let registry: ProviderRegistry;
  beforeEach(() => {
    registry = buildRegistry();
  });

  it('应通过多模态 Provider 分析图像', async () => {
    const analyzer = createImageAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'a.png', mime: 'image/png' });
    expect(result.kind).toBe('image');
    expect(result.result.tags).toContain('测试');
  });

  it('应使用缓存避免重复分析', async () => {
    let calls = 0;
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => {
          calls++;
          return '描述\ntags: a';
        },
      }),
    );
    const analyzer = createImageAnalyzer({ registry });
    const input = { url: 'https://example.com/a.png', mime: 'image/png' };
    await analyzer.analyze(input);
    await analyzer.analyze(input);
    expect(calls).toBe(1);
  });

  it('skipCache 时应跳过缓存', async () => {
    let calls = 0;
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => {
          calls++;
          return '描述\ntags: a';
        },
      }),
    );
    const analyzer = createImageAnalyzer({ registry });
    const input = { url: 'https://example.com/b.png', mime: 'image/png' };
    await analyzer.analyze(input, { skipCache: true });
    await analyzer.analyze(input, { skipCache: true });
    expect(calls).toBe(2);
  });

  it('OCR 选项应触发 OCR Provider', async () => {
    const analyzer = createImageAnalyzer({ registry });
    const result = await analyzer.analyze(
      { buffer: Buffer.from('img'), mime: 'image/png' },
      { ocr: true },
    );
    expect(result.kind).toBe('image');
    expect(result.result.ocrText).toBe('OCR结果');
  });

  it('应应用启发式安全检测', async () => {
    const analyzer = createImageAnalyzer({ registry });
    const result = await analyzer.analyze({ buffer: Buffer.alloc(10), mime: 'image/png' });
    expect(result.result.safety).toBeDefined();
    expect(result.result.safety!.safe).toBe(true);
  });

  it('未注册 Provider 时应抛错', async () => {
    const emptyRegistry = createProviderRegistry();
    const analyzer = createImageAnalyzer({ registry: emptyRegistry });
    await expect(analyzer.analyze({ mime: 'image/png' })).rejects.toThrow(
      /未找到支持图像分析/,
    );
  });
});

describe('VideoAnalyzer', () => {
  it('应通过 Provider 分析视频', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '视频内容\nduration: 60\nactions: 跑步',
      }),
    );
    const analyzer = createVideoAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'v.mp4', mime: 'video/mp4' });
    expect(result.kind).toBe('video');
    expect(result.result.actions).toContain('跑步');
    expect(result.result.durationSeconds).toBe(60);
  });

  it('应根据时长自动采样关键帧', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '视频\nduration: 25',
      }),
    );
    const analyzer = createVideoAnalyzer({ registry, keyframeIntervalSeconds: 10 });
    const result = await analyzer.analyze({ fileName: 'v.mp4', mime: 'video/mp4' });
    expect(result.result.keyframes.length).toBe(3); // 0, 10, 20
    expect(result.result.keyframes[0].timestamp).toBe(0);
  });

  it('应自动切分场景', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '视频\nduration: 70',
      }),
    );
    const analyzer = createVideoAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'v.mp4', mime: 'video/mp4' });
    expect(result.result.scenes.length).toBe(3); // 0-30, 30-60, 60-70
    expect(result.result.scenes[2].end).toBe(70);
  });

  it('sampleKeyframes 应按间隔采样', () => {
    const frames = sampleKeyframes(35, 10, 'desc');
    expect(frames.length).toBe(4); // 0, 10, 20, 30
  });

  it('buildDefaultScenes 应按 30 秒分段', () => {
    const scenes = buildDefaultScenes(75, 'desc');
    expect(scenes.length).toBe(3);
    expect(scenes[0]).toEqual({ start: 0, end: 30, description: 'desc' });
    expect(scenes[2].end).toBe(75);
  });
});

describe('AudioAnalyzer', () => {
  it('应通过 Provider 分析音频', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '你好世界\nmusic: yes',
      }),
    );
    const analyzer = createAudioAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'a.mp3', mime: 'audio/mpeg' });
    expect(result.kind).toBe('audio');
    expect(result.result.transcript).toContain('你好世界');
    expect(result.result.hasMusic).toBe(true);
  });

  it('应在无情绪时自动推断', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '今天很开心，太棒了',
      }),
    );
    const analyzer = createAudioAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'a.mp3', mime: 'audio/mpeg' });
    expect(result.result.emotion).toBeDefined();
    expect(['happy', 'excited']).toContain(result.result.emotion!.primary);
  });
});

describe('inferEmotionFromText', () => {
  it('应识别开心情绪', () => {
    const emotion = inferEmotionFromText('I am so happy today');
    expect(emotion.primary).toBe('happy');
    expect(emotion.distribution.happy).toBeGreaterThan(0);
  });

  it('应识别悲伤情绪', () => {
    const emotion = inferEmotionFromText('感到难过和悲伤');
    expect(emotion.primary).toBe('sad');
  });

  it('无匹配时返回 neutral', () => {
    const emotion = inferEmotionFromText('普通的文本内容');
    expect(emotion.primary).toBe('neutral');
  });

  it('多种情绪应归一化分布', () => {
    const emotion = inferEmotionFromText('happy and calm');
    expect(emotion.distribution.happy).toBeLessThanOrEqual(1);
    expect(emotion.distribution.calm).toBeLessThanOrEqual(1);
  });
});

describe('DocumentAnalyzer', () => {
  it('未注册 Provider 且无 buffer 时应抛错', async () => {
    const emptyRegistry = createProviderRegistry();
    const analyzer = createDocumentAnalyzer({ registry: emptyRegistry });
    await expect(
      analyzer.analyze({ fileName: 'doc.pdf', mime: 'application/pdf' }),
    ).rejects.toThrow(/未找到支持文档分析/);
  });

  it('应通过 Provider 提取文档', async () => {
    const registry = buildRegistry();
    registerMultimodalProvider(
      registry,
      createMultimodalProvider({
        describeFn: async () => '提取的文档内容',
      }),
    );
    const analyzer = createDocumentAnalyzer({ registry });
    const result = await analyzer.analyze({ fileName: 'doc.pdf', mime: 'application/pdf' });
    expect(result.kind).toBe('document');
    expect(result.result.text).toContain('提取的文档内容');
    expect(result.result.documentType).toBe('pdf');
  });
});

describe('inferDocumentType', () => {
  it('应根据 MIME 推断 PDF', () => {
    expect(inferDocumentType('application/pdf')).toBe('pdf');
  });

  it('应根据文件名推断 Word', () => {
    expect(inferDocumentType(undefined, 'report.docx')).toBe('word');
    expect(inferDocumentType(undefined, 'report.doc')).toBe('word');
  });

  it('应根据文件名推断 Excel', () => {
    expect(inferDocumentType(undefined, 'data.xlsx')).toBe('excel');
    expect(inferDocumentType(undefined, 'data.xls')).toBe('excel');
  });

  it('未知类型返回 unknown', () => {
    expect(inferDocumentType(undefined, 'file.txt')).toBe('unknown');
    expect(inferDocumentType('text/plain')).toBe('unknown');
  });
});
