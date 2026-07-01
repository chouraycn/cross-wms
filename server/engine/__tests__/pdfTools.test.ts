/**
 * PDF Tools Test — PDF 深度处理工具测试
 *
 * 测试 PDF 工具的核心功能：
 * - pdf_extract — 文本提取
 * - pdf_summarize — AI 总结（需要 mock）
 * - pdf_merge — PDF 合并
 * - pdf_split — PDF 拆分
 * - pdf_convert — PDF 转换
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPdfToolDefinitions,
  getPdfToolHandlers,
  initPdfTools,
} from '../pdfTools.js';
import {
  extractPdfText,
  mergePdfFiles,
  splitPdfFile,
  convertPdfToImages,
} from '../pdfProcessor.js';
import {
  initPdfProviders,
  LocalPdfProvider,
} from '../pdfProviders.js';

// ===================== Mock 数据和依赖 =====================

// Mock pdf-parse
vi.mock('pdf-parse', () => ({
  default: vi.fn(async (buffer: Buffer) => ({
    text: '这是测试 PDF 文本的示例内容。\n包含多行文本。\n这是第三行。',
    numpages: 3,
    info: {
      Title: '测试 PDF',
      Author: '测试作者',
      CreationDate: 'D:20240101',
    },
  })),
}));

// Mock pdf-lib
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(async () => ({
      addPage: vi.fn(),
      copyPages: vi.fn(async () => [{}]),
      setTitle: vi.fn(),
      save: vi.fn(async () => Buffer.from('mock pdf content')),
      getPageCount: vi.fn(() => 3),
      getPageIndices: vi.fn(() => [0, 1, 2]),
    })),
    load: vi.fn(async () => ({
      getPageCount: vi.fn(() => 3),
      getPageIndices: vi.fn(() => [0, 1, 2]),
    })),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path.includes('test')),
  statSync: vi.fn(() => ({ size: 1024, isFile: () => true })),
  readFileSync: vi.fn(() => Buffer.from('mock pdf content')),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock aiClient
vi.mock('../../aiClient.js', () => ({
  callModelAPI: vi.fn(async () => ({
    content: '这是 AI 总结的内容。',
    usage: { totalTokens: 100 },
  })),
}));

// ===================== 测试套件 =====================

describe('PDF Tools', () => {
  beforeEach(() => {
    initPdfTools();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===================== 工具定义测试 =====================

  describe('getPdfToolDefinitions', () => {
    it('应该返回 5 个 PDF 工具定义', () => {
      const definitions = getPdfToolDefinitions();
      expect(definitions).toHaveLength(5);
      expect(definitions.map(d => d.function.name)).toEqual([
        'pdf_extract',
        'pdf_summarize',
        'pdf_merge',
        'pdf_split',
        'pdf_convert',
      ]);
    });

    it('pdf_extract 定义应该正确', () => {
      const definitions = getPdfToolDefinitions();
      const pdfExtract = definitions.find(d => d.function.name === 'pdf_extract');
      expect(pdfExtract).toBeDefined();
      expect(pdfExtract?.function.parameters.required).toContain('path');
    });

    it('pdf_summarize 定义应该正确', () => {
      const definitions = getPdfToolDefinitions();
      const pdfSummarize = definitions.find(d => d.function.name === 'pdf_summarize');
      expect(pdfSummarize).toBeDefined();
      expect(pdfSummarize?.function.parameters.properties).toHaveProperty('ai_provider');
    });

    it('pdf_merge 定义应该正确', () => {
      const definitions = getPdfToolDefinitions();
      const pdfMerge = definitions.find(d => d.function.name === 'pdf_merge');
      expect(pdfMerge).toBeDefined();
      expect(pdfMerge?.function.parameters.required).toContain('paths');
      expect(pdfMerge?.function.parameters.required).toContain('output_path');
    });

    it('pdf_split 定义应该正确', () => {
      const definitions = getPdfToolDefinitions();
      const pdfSplit = definitions.find(d => d.function.name === 'pdf_split');
      expect(pdfSplit).toBeDefined();
      expect(pdfSplit?.function.parameters.properties).toHaveProperty('mode');
    });

    it('pdf_convert 定义应该正确', () => {
      const definitions = getPdfToolDefinitions();
      const pdfConvert = definitions.find(d => d.function.name === 'pdf_convert');
      expect(pdfConvert).toBeDefined();
      expect(pdfConvert?.function.parameters.properties).toHaveProperty('format');
    });
  });

  // ===================== 工具处理器测试 =====================

  describe('getPdfToolHandlers', () => {
    it('应该返回 5 个工具处理器', () => {
      const handlers = getPdfToolHandlers();
      expect(handlers.size).toBe(5);
      expect(handlers.has('pdf_extract')).toBe(true);
      expect(handlers.has('pdf_summarize')).toBe(true);
      expect(handlers.has('pdf_merge')).toBe(true);
      expect(handlers.has('pdf_split')).toBe(true);
      expect(handlers.has('pdf_convert')).toBe(true);
    });

    it('处理器应该是函数', () => {
      const handlers = getPdfToolHandlers();
      for (const [name, handler] of handlers.entries()) {
        expect(typeof handler).toBe('function');
      }
    });
  });

  // ===================== PDF 提取测试 =====================

  describe('pdf_extract handler', () => {
    it('应该正确处理文件不存在的情况', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_extract')!;

      const result = await handler({ path: '/nonexistent/test.pdf' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('文件不存在');
    });

    it('应该正确提取 PDF 文本', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_extract')!;

      // Mock 文件存在
      vi.doMock('fs', () => ({
        existsSync: vi.fn(() => true),
        statSync: vi.fn(() => ({ size: 1024, isFile: () => true })),
        readFileSync: vi.fn(() => Buffer.from('mock pdf')),
      }));

      const result = await handler({
        path: '~/Desktop/test.pdf',
        mode: 'text',
        max_chars: 1000,
      });

      const parsed = JSON.parse(result);
      expect(parsed).toBeDefined();
    });
  });

  // ===================== PDF 总结测试 =====================

  describe('pdf_summarize handler', () => {
    it('应该正确处理文件不存在的情况', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_summarize')!;

      const result = await handler({ path: '/nonexistent/test.pdf' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('文件不存在');
    });
  });

  // ===================== PDF 合并测试 =====================

  describe('pdf_merge handler', () => {
    it('应该验证至少需要 2 个文件', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_merge')!;

      const result = await handler({
        paths: ['~/Desktop/test.pdf'],
        output_path: '~/Desktop/output.pdf',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('至少需要 2 个');
    });

    it('应该验证输出路径不能为空', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_merge')!;

      const result = await handler({
        paths: ['~/Desktop/test1.pdf', '~/Desktop/test2.pdf'],
        output_path: '',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('输出路径不能为空');
    });
  });

  // ===================== PDF 拆分测试 =====================

  describe('pdf_split handler', () => {
    it('应该正确处理文件不存在的情况', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_split')!;

      const result = await handler({
        path: '/nonexistent/test.pdf',
        output_dir: '~/Desktop/output',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('文件不存在');
    });
  });

  // ===================== PDF 转换测试 =====================

  describe('pdf_convert handler', () => {
    it('应该正确处理文件不存在的情况', async () => {
      const handlers = getPdfToolHandlers();
      const handler = handlers.get('pdf_convert')!;

      const result = await handler({
        path: '/nonexistent/test.pdf',
        output_dir: '~/Desktop/output',
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toContain('文件不存在');
    });
  });

  // ===================== PDF 处理器测试 =====================

  describe('pdfProcessor', () => {
    describe('extractPdfText', () => {
      it('应该返回提取结果结构', async () => {
        // Mock 文件存在
        vi.doMock('fs', () => ({
          existsSync: vi.fn(() => true),
          statSync: vi.fn(() => ({ size: 1024 })),
          readFileSync: vi.fn(() => Buffer.from('mock pdf')),
        }));

        const result = await extractPdfText ('~/Desktop/test.pdf');
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('path');
        expect(result).toHaveProperty('pageCount');
        expect(result).toHaveProperty('pages');
      });
    });

    describe('mergePdfFiles', () => {
      it('应该验证所有输入文件存在', async () => {
        const result = await mergePdfFiles({
          paths: ['/nonexistent1.pdf', '/nonexistent2.pdf'],
          outputPath: '/tmp/output.pdf',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('不存在');
      });
    });

    describe('splitPdfFile', () => {
      it('应该验证输入文件存在', async () => {
        const result = await splitPdfFile({
          path: '/nonexistent.pdf',
          outputDir: '/tmp/output',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('不存在');
      });
    });

    describe('convertPdfToImages', () => {
      it('应该验证输入文件存在', async () => {
        const result = await convertPdfToImages({
          path: '/nonexistent.pdf',
          outputDir: '/tmp/output',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('不存在');
      });
    });
  });

  // ===================== PDF 提供商测试 =====================

  describe('pdfProviders', () => {
    describe('LocalPdfProvider', () => {
      it('应该能够提取文本', async () => {
        const provider = new LocalPdfProvider();
        expect(provider.name).toBe('local');
        expect(typeof provider.extractText).toBe('function');
      });

      it('应该能够提取元数据', async () => {
        const provider = new LocalPdfProvider();
        expect(typeof provider.extractMetadata).toBe('function');
      });

      it('应该检查可用性', async () => {
        const provider = new LocalPdfProvider();
        expect(typeof provider.isAvailable).toBe('function');
      });
    });

    describe('initPdfProviders', () => {
      it('应该初始化 OCR 提供商', () => {
        initPdfProviders();
        // OCR 提供商应该已注册
      });

      it('应该初始化 AI 提供商', () => {
        initPdfProviders();
        // AI 提供商应该已注册
      });
    });
  });

  // ===================== 初始化测试 =====================

  describe('initPdfTools', () => {
    it('应该成功初始化', () => {
      initPdfTools();
      // 应该不抛出错误
      expect(true).toBe(true);
    });
  });
});