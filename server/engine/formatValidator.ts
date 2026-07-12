import { logger } from '../logger.js';

export type FormatValidationLevel = 'valid' | 'warning' | 'error';

export interface FormatValidationResult {
  level: FormatValidationLevel;
  issues: string[];
  suggestions: string[];
}

export class FormatValidator {
  validate(content: string): FormatValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // JSON 块验证
    this.validateJsonBlocks(content, issues, suggestions);

    // 代码块验证
    this.validateCodeBlocks(content, issues, suggestions);

    // Markdown 格式验证
    this.validateMarkdown(content, issues, suggestions);

    // 链接验证
    this.validateLinks(content, issues, suggestions);

    const level: FormatValidationLevel = issues.some(i => i.includes('错误') || i.includes('error'))
      ? 'error'
      : issues.length > 0
      ? 'warning'
      : 'valid';

    if (level !== 'valid') {
      logger.info(`[FormatValidator] Found ${issues.length} issues (level: ${level})`);
    }

    return { level, issues, suggestions };
  }

  private validateJsonBlocks(content: string, issues: string[], suggestions: string[]): void {
    const jsonBlockRegex = /```json\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = jsonBlockRegex.exec(content)) !== null) {
      const jsonStr = match[1].trim();
      try {
        JSON.parse(jsonStr);
      } catch {
        issues.push(`JSON 格式错误: ${jsonStr.slice(0, 50)}...`);
        suggestions.push('检查 JSON 语法，确保括号、引号匹配正确');
      }
    }

    // 内联 JSON 验证（以 { 开头以 } 结尾的独立行）
    const inlineJsonRegex = /^(\{[^{}]*\})$/gm;
    while ((match = inlineJsonRegex.exec(content)) !== null) {
      try {
        JSON.parse(match[1]);
      } catch {
        // 忽略，可能是普通文本
      }
    }
  }

  private validateCodeBlocks(content: string, issues: string[], suggestions: string[]): void {
    const codeBlockRegex = /```(\w*)\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    let hasUnclosed = false;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const lang = match[1];
      const code = match[2].trim();

      if (!lang) {
        issues.push('代码块缺少语言标识');
        suggestions.push('为代码块添加语言标识（如 ```python、```typescript）');
      }

      if (lang === 'python') {
        if (code.includes('\t') && code.includes('    ')) {
          issues.push('Python 代码混用 Tab 和空格缩进');
          suggestions.push('统一使用空格或 Tab 缩进');
        }
      }

      if (lang === 'json' || lang === 'javascript' || lang === 'typescript') {
        const openBraces = (code.match(/[{[]/g) || []).length;
        const closeBraces = (code.match(/[}\]]/g) || []).length;
        if (openBraces !== closeBraces) {
          issues.push(`${lang} 代码块括号不匹配: ${openBraces} 开 vs ${closeBraces} 闭`);
          suggestions.push('检查括号是否匹配');
        }
      }
    }

    // 检查未闭合的代码块
    const fenceCount = (content.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      hasUnclosed = true;
      issues.push('代码块未正确关闭（``` 数量为奇数）');
      suggestions.push('检查所有代码块是否正确关闭');
    }
  }

  private validateMarkdown(content: string, issues: string[], suggestions: string[]): void {
    // 检查表格格式
    const tableRegex = /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/g;
    let match: RegExpExecArray | null;
    while ((match = tableRegex.exec(content)) !== null) {
      const header = match[1].split('|').filter(Boolean);
      const separator = match[2].split('|').filter(Boolean);
      if (header.length !== separator.length) {
        issues.push('Markdown 表格表头与分隔行列数不匹配');
        suggestions.push('检查表格格式，确保表头和分隔行列数一致');
      }
    }

    // 检查未闭合的行内代码
    const inlineCodeCount = (content.match(/`[^`]/g) || []).length;
    const inlineCodeCloseCount = (content.match(/[^`]`/g) || []).length;
    if (Math.abs(inlineCodeCount - inlineCodeCloseCount) > 1) {
      issues.push('行内代码反引号可能不匹配');
      suggestions.push('检查 ` 反引号是否成对使用');
    }
  }

  private validateLinks(content: string, issues: string[], suggestions: string[]): void {
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const text = match[1];
      const url = match[2];
      if (!text.trim()) {
        issues.push(`链接文本为空: ${url}`);
        suggestions.push('为链接添加描述文本');
      }
      if (!url.startsWith('http') && !url.startsWith('#') && !url.startsWith('/')) {
        issues.push(`链接 URL 可能无效: ${url}`);
        suggestions.push('确保链接以 http://、https://、# 或 / 开头');
      }
    }
  }

  validateJson(jsonStr: string): FormatValidationResult {
    try {
      JSON.parse(jsonStr);
      return { level: 'valid', issues: [], suggestions: [] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        level: 'error',
        issues: [`JSON 解析错误: ${msg}`],
        suggestions: ['检查 JSON 语法'],
      };
    }
  }
}

export const formatValidator = new FormatValidator();
