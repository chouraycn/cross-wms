/**
 * 文本处理器单元测试
 *
 * 覆盖 Markdown 剥离、中文数字归一化、句段切分、中英文混排空格与
 * 预处理流水线。
 */

import { describe, it, expect } from 'vitest';
import {
  segmentText,
  normalizeNumbers,
  normalizePunctuation,
  stripMarkdown,
  detectLanguage,
  padMixedCnEn,
  preprocessText,
} from '../text-processor.js';

describe('文本处理器', () => {
  describe('stripMarkdown', () => {
    it('应去除标题标记', () => {
      expect(stripMarkdown('## 标题')).toBe('标题');
      expect(stripMarkdown('### 多级标题')).toBe('多级标题');
    });

    it('应去除粗体与斜体标记但保留文本', () => {
      expect(stripMarkdown('这是**粗体**文字')).toBe('这是粗体文字');
      expect(stripMarkdown('这是*斜体*文字')).toBe('这是斜体文字');
    });

    it('应去除行内代码标记', () => {
      expect(stripMarkdown('使用 `npm install` 安装')).toBe('使用 npm install 安装');
    });

    it('应将链接转换为纯文本', () => {
      expect(stripMarkdown('访问 [官网](https://example.com) 了解更多')).toBe(
        '访问 官网 了解更多',
      );
    });

    it('应去除引用与分隔线标记', () => {
      expect(stripMarkdown('> 引用文字')).toBe('引用文字');
      expect(stripMarkdown('内容\n---\n后续')).toBe('内容\n\n后续');
    });
  });

  describe('normalizeNumbers', () => {
    it('应将阿拉伯整数转为中文数字', () => {
      expect(normalizeNumbers('共 123 件', 'zh')).toBe('共 一百二十三 件');
    });

    it('应处理零', () => {
      expect(normalizeNumbers('数量 0', 'zh')).toBe('数量 零');
    });

    it('应支持万、亿单位', () => {
      expect(normalizeNumbers('1万', 'zh')).toBe('一万');
      expect(normalizeNumbers('1亿', 'zh')).toBe('一亿');
    });

    it('应将小数转为中文朗读形式', () => {
      expect(normalizeNumbers('3.14', 'zh')).toBe('三点一四');
    });

    it('非 zh 语言应保留阿拉伯数字', () => {
      expect(normalizeNumbers('共 123 件', 'en')).toBe('共 123 件');
    });

    it('应归一化全角数字', () => {
      expect(normalizeNumbers('１２３', 'en')).toBe('123');
    });
  });

  describe('normalizePunctuation', () => {
    it('应合并连续重复标点', () => {
      expect(normalizePunctuation('好！！！')).toBe('好！');
    });

    it('应折叠多余空白', () => {
      expect(normalizePunctuation('你好    世界')).toBe('你好 世界');
    });
  });

  describe('detectLanguage', () => {
    it('含 CJK 字符应检测为 zh', () => {
      expect(detectLanguage('你好世界')).toBe('zh');
    });

    it('纯英文应检测为 en', () => {
      expect(detectLanguage('Hello World')).toBe('en');
    });
  });

  describe('padMixedCnEn', () => {
    it('应在中英文交界插入空格', () => {
      expect(padMixedCnEn('使用OpenAI合成')).toBe('使用 OpenAI 合成');
    });

    it('纯中文不应插入额外空格', () => {
      expect(padMixedCnEn('你好世界')).toBe('你好世界');
    });
  });

  describe('segmentText', () => {
    it('短文本应返回单段', () => {
      expect(segmentText('你好')).toEqual(['你好']);
    });

    it('空文本应返回空数组', () => {
      expect(segmentText('   ')).toEqual([]);
    });

    it('应按句末标点切分并保留标点', () => {
      const segments = segmentText('第一句。第二句！第三句？');
      expect(segments).toEqual(['第一句。', '第二句！', '第三句？']);
    });

    it('超长文本应按 maxLength 切分', () => {
      const long = 'A'.repeat(100);
      const segments = segmentText(long, 30);
      expect(segments.length).toBeGreaterThan(1);
      for (const seg of segments) {
        expect(seg.length).toBeLessThanOrEqual(30);
      }
    });
  });

  describe('preprocessText', () => {
    it('应执行完整预处理流水线', () => {
      const result = preprocessText('共 **123** 项', { language: 'zh' });
      expect(result).toBe('共 一百二十三 项');
    });

    it('应支持关闭数字归一化', () => {
      const result = preprocessText('共 123 项', {
        language: 'zh',
        normalizeNumbers: false,
      });
      expect(result).toBe('共 123 项');
    });
  });
});
