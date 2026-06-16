/**
 * referenceLoader 引用加载器测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockExistsSync, mockReaddirSync, mockReadFileSync, mockStatSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockStatSync: vi.fn(),
}));

vi.mock('fs', () => {
  const mockObj = {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    statSync: mockStatSync,
  };
  return { default: mockObj, ...mockObj };
});

import { loadReferences } from '../services/referenceLoader.js';

function makeFileEntry(name: string, _size = 100) {
  return { name, isFile: () => true, isDirectory: () => false };
}

describe('referenceLoader', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  describe('references 目录不存在', () => {
    it('应返回空数组', () => {
      mockExistsSync.mockReturnValue(false);
      expect(loadReferences('/some/skill/dir')).toEqual([]);
    });
  });

  describe('文件类型判断', () => {
    it('.md 文件应为 markdown 类型', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('readme.md')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('# 标题\n内容');
      expect(loadReferences('/skill')[0].type).toBe('markdown');
    });

    it('.markdown 文件应为 markdown 类型', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('guide.markdown')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('内容');
      expect(loadReferences('/skill')[0].type).toBe('markdown');
    });

    it('.pdf 文件应为 pdf 类型', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.pdf')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockImplementation(() => { throw new Error('binary'); });
      const result = loadReferences('/skill');
      expect(result[0].type).toBe('pdf');
      expect(result[0].content).toBe('');
    });

    it('.txt 文件应为 text 类型', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('notes.txt')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('纯文本内容');
      expect(loadReferences('/skill')[0].type).toBe('text');
    });

    it('其他扩展名应为 text 类型', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('data.csv')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('a,b,c');
      expect(loadReferences('/skill')[0].type).toBe('text');
    });
  });

  describe('summary 提取', () => {
    it('首行为标题时应去掉 # 前缀', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.md')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('## 操作指南\n这是内容');
      expect(loadReferences('/skill')[0].summary).toBe('操作指南');
    });

    it('首行无 # 前缀时应保留原样', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.md')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('普通首行\n第二行');
      expect(loadReferences('/skill')[0].summary).toBe('普通首行');
    });

    it('summary 超过100字符应截断并加省略号', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.md')]);
      mockStatSync.mockReturnValue({ size: 200 });
      mockReadFileSync.mockReturnValue('A'.repeat(150));
      const result = loadReferences('/skill');
      expect(result[0].summary.length).toBe(103);
      expect(result[0].summary).toContain('...');
    });

    it('summary 恰好100字符不应截断', () => {
      const exactLine = 'A'.repeat(100);
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.md')]);
      mockStatSync.mockReturnValue({ size: 150 });
      mockReadFileSync.mockReturnValue(exactLine);
      const result = loadReferences('/skill');
      expect(result[0].summary).toBe(exactLine);
      expect(result[0].summary).not.toContain('...');
    });
  });

  describe('文件大小限制', () => {
    it('超过默认 1MB 的文件应跳过', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('big.md')]);
      mockStatSync.mockReturnValue({ size: 2_000_000 });
      expect(loadReferences('/skill')).toEqual([]);
    });

    it('超过自定义 maxSize 的文件应跳过', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('medium.md')]);
      mockStatSync.mockReturnValue({ size: 500 });
      expect(loadReferences('/skill', 100)).toEqual([]);
    });

    it('未超过大小限制的文件应正常加载', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('small.md')]);
      mockStatSync.mockReturnValue({ size: 100 });
      mockReadFileSync.mockReturnValue('内容');
      expect(loadReferences('/skill', 1_048_576).length).toBe(1);
    });
  });

  describe('隐藏文件跳过', () => {
    it('应跳过 . 开头的隐藏文件', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('.hidden'), makeFileEntry('visible.md')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('内容');
      const filenames = loadReferences('/skill').map((r) => r.filename);
      expect(filenames).not.toContain('.hidden');
      expect(filenames).toContain('visible.md');
    });
  });

  describe('子目录跳过', () => {
    it('应跳过子目录只处理文件', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        { name: 'subdir', isFile: () => false, isDirectory: () => true },
        makeFileEntry('file.md'),
      ]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('内容');
      const result = loadReferences('/skill');
      expect(result.length).toBe(1);
      expect(result[0].filename).toBe('file.md');
    });
  });

  describe('读取失败容错', () => {
    it('无法读取的文件仍记录但 content 为空', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('binary.pdf')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockImplementation(() => { throw new Error('Binary file'); });
      const result = loadReferences('/skill');
      expect(result.length).toBe(1);
      expect(result[0].filename).toBe('binary.pdf');
      expect(result[0].content).toBe('');
      expect(result[0].summary).toBe('binary.pdf');
    });
  });

  describe('多文件加载', () => {
    it('应加载多个文件', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        makeFileEntry('doc1.md'),
        makeFileEntry('doc2.txt'),
        makeFileEntry('doc3.pdf'),
      ]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        if (pathStr.includes('doc1')) return '# 文档1\n内容1';
        if (pathStr.includes('doc2')) return '文本内容';
        throw new Error('binary');
      });
      const result = loadReferences('/skill');
      expect(result.length).toBe(3);
      const types = result.map((r) => r.type);
      expect(types).toContain('markdown');
      expect(types).toContain('text');
      expect(types).toContain('pdf');
    });
  });

  describe('目录读取失败', () => {
    it('readdirSync 失败时应返回空数组', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => { throw new Error('Permission denied'); });
      expect(loadReferences('/skill')).toEqual([]);
    });
  });

  describe('首行处理边界', () => {
    it('多个 # 前缀都应去除', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('doc.md')]);
      mockStatSync.mockReturnValue({ size: 50 });
      mockReadFileSync.mockReturnValue('### 深层标题\n内容');
      expect(loadReferences('/skill')[0].summary).toBe('深层标题');
    });

    it('空文件首行不存在时 summary 应为文件名', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([makeFileEntry('empty.md')]);
      mockStatSync.mockReturnValue({ size: 0 });
      mockReadFileSync.mockReturnValue('');
      expect(loadReferences('/skill')[0].summary).toBe('empty.md');
    });
  });
});
