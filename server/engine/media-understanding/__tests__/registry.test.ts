/**
 * Provider Registry & Media Analyzer Registry 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createProviderRegistry,
  registerMultimodalProvider,
  registerOcrProvider,
  unregisterMultimodalProvider,
  unregisterOcrProvider,
  getMultimodalProvider,
  getOcrProvider,
  findProvidersByCapability,
  findProviderForCapability,
  findOcrProvider,
} from '../provider-registry.js';
import { createMediaAnalyzerRegistry } from '../registry.js';
import { createMultimodalProvider } from '../providers/multimodal.js';
import { createOcrProvider } from '../providers/ocr.js';
import type { MultimodalProvider, OcrProvider } from '../types.js';

describe('ProviderRegistry', () => {
  let registry: ReturnType<typeof createProviderRegistry>;
  let mmProvider: MultimodalProvider;
  let ocrProvider: OcrProvider;

  beforeEach(() => {
    registry = createProviderRegistry();
    mmProvider = createMultimodalProvider({
      id: 'test-mm',
      describeFn: async () => 'desc',
    });
    ocrProvider = createOcrProvider({ id: 'test-ocr', recognizeFn: async () => 'text' });
  });

  it('初始状态应为空', () => {
    expect(registry.multimodal.size).toBe(0);
    expect(registry.ocr.size).toBe(0);
  });

  it('registerMultimodalProvider 应注册 Provider', () => {
    registerMultimodalProvider(registry, mmProvider);
    expect(registry.multimodal.size).toBe(1);
    expect(getMultimodalProvider(registry, 'test-mm')).toBe(mmProvider);
  });

  it('registerOcrProvider 应注册 Provider', () => {
    registerOcrProvider(registry, ocrProvider);
    expect(registry.ocr.size).toBe(1);
    expect(getOcrProvider(registry, 'test-ocr')).toBe(ocrProvider);
  });

  it('unregisterMultimodalProvider 应注销 Provider', () => {
    registerMultimodalProvider(registry, mmProvider);
    expect(unregisterMultimodalProvider(registry, 'test-mm')).toBe(true);
    expect(registry.multimodal.size).toBe(0);
    expect(unregisterMultimodalProvider(registry, 'test-mm')).toBe(false);
  });

  it('unregisterOcrProvider 应注销 Provider', () => {
    registerOcrProvider(registry, ocrProvider);
    expect(unregisterOcrProvider(registry, 'test-ocr')).toBe(true);
    expect(registry.ocr.size).toBe(0);
  });

  it('findProvidersByCapability 应按能力过滤', () => {
    registerMultimodalProvider(registry, mmProvider);
    const imageProviders = findProvidersByCapability(registry, 'image');
    expect(imageProviders).toHaveLength(1);
    expect(imageProviders[0].id).toBe('test-mm');
  });

  it('findProviderForCapability 应优先匹配 preferredId', () => {
    const mm2 = createMultimodalProvider({
      id: 'preferred-mm',
      describeFn: async () => 'desc2',
    });
    registerMultimodalProvider(registry, mmProvider);
    registerMultimodalProvider(registry, mm2);
    const found = findProviderForCapability(registry, 'image', 'preferred-mm');
    expect(found?.id).toBe('preferred-mm');
  });

  it('findProviderForCapability 在 preferredId 无能力时应回退', () => {
    registerMultimodalProvider(registry, mmProvider);
    const found = findProviderForCapability(registry, 'image', 'nonexistent');
    expect(found?.id).toBe('test-mm');
  });

  it('findOcrProvider 应返回第一个或指定 id 的 Provider', () => {
    registerOcrProvider(registry, ocrProvider);
    expect(findOcrProvider(registry)?.id).toBe('test-ocr');
    expect(findOcrProvider(registry, 'test-ocr')?.id).toBe('test-ocr');
    expect(findOcrProvider(registry, 'missing')).toBeUndefined();
  });

  it('无 Provider 时 findProvidersByCapability 返回空数组', () => {
    expect(findProvidersByCapability(registry, 'image')).toHaveLength(0);
  });
});

describe('MediaAnalyzerRegistry', () => {
  it('默认应注册四种分析器', () => {
    const registry = createMediaAnalyzerRegistry();
    expect(registry.list()).toEqual(expect.arrayContaining(['image', 'video', 'audio', 'document']));
    expect(registry.list()).toHaveLength(4);
  });

  it('get 应返回指定类型的分析器', () => {
    const registry = createMediaAnalyzerRegistry();
    expect(registry.get('image')).toBeDefined();
    expect(registry.get('audio')).toBeDefined();
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  it('register/unregister 应正确操作', () => {
    const registry = createMediaAnalyzerRegistry();
    const customAnalyzer = {
      id: 'image' as const,
      supportedMimes: ['image/'],
      analyze: async () => ({ kind: 'image' as const, result: { description: '', tags: [] } }),
    };
    registry.register(customAnalyzer);
    expect(registry.get('image')).toBe(customAnalyzer);
    expect(registry.unregister('image')).toBe(true);
    expect(registry.get('image')).toBeUndefined();
  });

  it('resolveAnalyzer 应根据 MIME 选择分析器', () => {
    const registry = createMediaAnalyzerRegistry();
    expect(registry.resolveAnalyzer({ mime: 'image/png' })?.id).toBe('image');
    expect(registry.resolveAnalyzer({ mime: 'video/mp4' })?.id).toBe('video');
    expect(registry.resolveAnalyzer({ mime: 'audio/mpeg' })?.id).toBe('audio');
    expect(registry.resolveAnalyzer({ mime: 'application/pdf' })?.id).toBe('document');
    expect(registry.resolveAnalyzer({ mime: 'unknown/x' })).toBeUndefined();
  });

  it('resolveAnalyzer 应根据文件名选择分析器', () => {
    const registry = createMediaAnalyzerRegistry();
    expect(registry.resolveAnalyzer({ fileName: 'photo.JPG' })?.id).toBe('image');
    expect(registry.resolveAnalyzer({ fileName: 'clip.MP4' })?.id).toBe('video');
  });

  it('analyze 应自动选择分析器', async () => {
    const registry = createMediaAnalyzerRegistry();
    registerMultimodalProvider(
      registry.providers,
      createMultimodalProvider({ describeFn: async () => '描述\ntags: a' }),
    );
    const result = await registry.analyze({ mime: 'image/png' });
    expect(result.kind).toBe('image');
  });

  it('analyze 支持显式指定 kind', async () => {
    const registry = createMediaAnalyzerRegistry();
    registerMultimodalProvider(
      registry.providers,
      createMultimodalProvider({ describeFn: async () => '音频转写' }),
    );
    const result = await registry.analyze({ buffer: Buffer.from('x') }, { kind: 'audio' });
    expect(result.kind).toBe('audio');
  });

  it('无法推断类型且未指定 kind 时应抛错', async () => {
    const registry = createMediaAnalyzerRegistry();
    await expect(registry.analyze({})).rejects.toThrow(/无法推断媒体类型/);
  });
});
