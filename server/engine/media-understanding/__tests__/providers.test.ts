/**
 * Providers 单元测试（multimodal + ocr）
 */

import { describe, it, expect } from 'vitest';
import { createMultimodalProvider } from '../providers/multimodal.js';
import { createOcrProvider } from '../providers/ocr.js';

describe('MultimodalProvider', () => {
  it('未配置 describeFn 时 describeImage 应抛错', async () => {
    const provider = createMultimodalProvider();
    await expect(provider.describeImage!({ fileName: 'a.png' })).rejects.toThrow(
      /未配置 describeFn/,
    );
  });

  it('describeImage 应返回描述和标签', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '一只猫坐在沙发上\ntags: 猫, 沙发, 室内',
    });
    const result = await provider.describeImage!({ fileName: 'cat.png' });
    expect(result.description).toContain('一只猫坐在沙发上');
    expect(result.tags).toEqual(['猫', '沙发', '室内']);
    expect(result.model).toBe('multimodal-default');
  });

  it('describeImage 应解析 OCR 文字', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '一张海报\nocr: Hello World\ntags: 海报',
    });
    const result = await provider.describeImage!(
      { fileName: 'poster.png' },
      { ocr: true },
    );
    expect(result.ocrText).toBe('Hello World');
  });

  it('describeImage 应解析人脸数量', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '合照\nfaces: 3\ntags: 合照',
    });
    const result = await provider.describeImage!(
      { fileName: 'group.png' },
      { faceDetection: true },
    );
    expect(result.faceCount).toBe(3);
  });

  it('describeImage 应解析安全检测结果', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '安全图片\nsafe: yes\ntags: 风景',
    });
    const result = await provider.describeImage!({ fileName: 'scene.png' });
    expect(result.safety).toBeDefined();
    expect(result.safety!.safe).toBe(true);
  });

  it('describeImage 应解析不安全检测结果', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '不安全内容\nsafe: no\ntags: nsfw',
    });
    const result = await provider.describeImage!({ fileName: 'unsafe.png' });
    expect(result.safety!.safe).toBe(false);
    expect(result.safety!.categories).toContain('flagged');
  });

  it('describeVideo 应返回描述和动作', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '一个人在跑步\nduration: 30.5\nactions: 跑步, 运动',
    });
    const result = await provider.describeVideo!({ fileName: 'run.mp4' });
    expect(result.description).toContain('跑步');
    expect(result.actions).toEqual(['跑步', '运动']);
    expect(result.durationSeconds).toBe(30.5);
  });

  it('transcribeAudio 应返回转写和情绪', async () => {
    const provider = createMultimodalProvider({
      describeFn: async () => '你好世界\nemotion: happy\nmusic: no',
    });
    const result = await provider.transcribeAudio!({ fileName: 'a.mp3' });
    expect(result.transcript).toContain('你好世界');
    expect(result.hasMusic).toBe(false);
    expect(result.emotion?.primary).toBe('happy');
  });

  it('extractDocument 应截断超长内容', async () => {
    const longText = 'A'.repeat(200);
    const provider = createMultimodalProvider({
      describeFn: async () => longText,
    });
    const result = await provider.extractDocument!(
      { fileName: 'doc.pdf' },
      { maxLength: 100 },
    );
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(100);
  });
});

describe('OcrProvider', () => {
  it('未配置 recognizeFn 时应抛错', async () => {
    const provider = createOcrProvider();
    await expect(provider.recognize(Buffer.from('x'))).rejects.toThrow(
      /未配置 recognizeFn/,
    );
  });

  it('应调用注入的 recognizeFn', async () => {
    const provider = createOcrProvider({
      recognizeFn: async (buf) => `text-from-${buf.length}-bytes`,
    });
    const text = await provider.recognize(Buffer.from('hello'), 'image/png');
    expect(text).toBe('text-from-5-bytes');
  });

  it('应支持自定义 id', async () => {
    const provider = createOcrProvider({ id: 'tesseract' });
    expect(provider.id).toBe('tesseract');
  });
});
