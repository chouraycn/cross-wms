/**
 * ObservationCompressor — 观察结果压缩模块
 *
 * 对超长的工具执行结果进行压缩，减少上下文占用。
 * 支持三种压缩策略：JSON key-value、表格 Top-5、文本 Top-3 段落。
 *
 * 压缩规则：
 * - 结果长度 > 500 字时触发压缩
 * - 优先尝试 JSON 解析 → 提取 key-value
 * - 其次尝试表格格式 → 提取 Top-5 行
 * - 最后降级为文本 → 提取 Top-3 段落
 *
 * v5.0.0: ReAct 循环优化
 */

// ===================== 类型定义 =====================

/** 压缩后的观察结果 */
export interface CompressedObservation {
  compressed: string;
  original: string;
  wasCompressed: boolean;
  compressionRatio: number; // compressed.length / original.length
}

// ===================== 常量 =====================

/** 触发压缩的长度阈值 */
const COMPRESSION_THRESHOLD = 500;

/** 压缩后最大长度 */
const MAX_COMPRESSED_LENGTH = 200;

// ===================== ObservationCompressor 类 =====================

/**
 * 观察结果压缩器 — 纯规则压缩，不调用 LLM。
 *
 * 压缩策略优先级：
 * 1. JSON key-value 提取：解析 JSON，提取关键字段
 * 2. 表格 Top-5 行：识别表格格式，保留前 5 行
 * 3. 文本 Top-3 段落：按段落分割，保留最长的 N 段
 */
export class ObservationCompressor {
  /**
   * 压缩观察结果。
   *
   * @param result - 原始结果文本
   * @param maxLength - 压缩后最大长度（默认 200）
   * @returns 压缩后的观察结果
   */
  compress(result: string, maxLength: number = MAX_COMPRESSED_LENGTH): CompressedObservation {
    // 未超过阈值，不需要压缩
    if (result.length <= COMPRESSION_THRESHOLD) {
      return {
        compressed: result,
        original: result,
        wasCompressed: false,
        compressionRatio: 1,
      };
    }

    let compressed = '';

    // 策略 1：尝试 JSON key-value 提取
    compressed = this.extractJsonKeyValues(result);
    if (compressed && compressed.length < result.length) {
      return this.buildResult(compressed, result, maxLength);
    }

    // 策略 2：尝试表格 Top-5 行
    compressed = this.extractTableTopRows(result, 5);
    if (compressed && compressed.length < result.length) {
      return this.buildResult(compressed, result, maxLength);
    }

    // 策略 3：文本 Top-3 段落
    compressed = this.extractTextTopParagraphs(result, 3);
    return this.buildResult(compressed, result, maxLength);
  }

  /**
   * 从 JSON 格式的结果中提取 key-value 对。
   * 保留关键字段，跳过大型数组/嵌套对象。
   *
   * @param text - 原始文本
   * @returns 提取的 key-value 摘要文本
   */
  private extractJsonKeyValues(text: string): string {
    try {
      // 尝试解析 JSON
      let jsonStr = text.trim();

      // 去除可能的 markdown 代码块
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // 尝试找到 JSON 起止位置
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) {
        return '';
      }

      jsonStr = jsonStr.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);

      // 提取 key-value 对
      const entries: string[] = [];
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          // 字符串值：截断到 50 字
          entries.push(`${key}: ${value.length > 50 ? value.slice(0, 50) + '...' : value}`);
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          entries.push(`${key}: ${value}`);
        } else if (Array.isArray(value)) {
          // 数组：只记录长度
          entries.push(`${key}: [${value.length} items]`);
        } else if (value === null) {
          entries.push(`${key}: null`);
        } else if (typeof value === 'object') {
          // 嵌套对象：只记录 keys
          const subKeys = Object.keys(value as Record<string, unknown>);
          entries.push(`${key}: {${subKeys.length} keys: ${subKeys.slice(0, 5).join(', ')}}`);
        }
      }

      if (entries.length === 0) {
        return '';
      }

      // 拼接并返回
      const result = `{${entries.join(', ')}}`;
      return result;
    } catch {
      // 非 JSON 格式，返回空字符串
      return '';
    }
  }

  /**
   * 从表格格式的结果中提取前 N 行。
   * 识别 Markdown 表格、CSV、TSV 格式。
   *
   * @param text - 原始文本
   * @param rows - 保留的行数
   * @returns 提取的表格摘要文本
   */
  private extractTableTopRows(text: string, rows: number): string {
    const lines = text.split('\n').filter(line => line.trim());

    // 检测 Markdown 表格（包含 |）
    const mdTableLines = lines.filter(line => line.includes('|') && line.trim().startsWith('|'));
    if (mdTableLines.length >= 2) {
      // 保留表头 + 分隔行 + 前 N 数据行
      const header = mdTableLines[0];
      const separator = mdTableLines[1];
      const dataRows = mdTableLines.slice(2, 2 + rows);
      const result = [header, separator, ...dataRows].join('\n');
      const totalRows = mdTableLines.length - 2;
      return `${result}\n... (共 ${totalRows} 行，已截取前 ${dataRows.length} 行)`;
    }

    // 检测 CSV/TSV（多行包含逗号或制表符）
    const csvLines = lines.filter(line =>
      (line.includes(',') || line.includes('\t')) &&
      line.split(/[,\t]/).length >= 2
    );
    if (csvLines.length >= 2) {
      const header = csvLines[0];
      const dataRows = csvLines.slice(1, 1 + rows);
      const result = [header, ...dataRows].join('\n');
      return `${result}\n... (共 ${csvLines.length - 1} 行，已截取前 ${dataRows.length} 行)`;
    }

    return '';
  }

  /**
   * 从文本结果中提取前 N 段落。
   * 按空行分段，保留最长的 N 段。
   *
   * @param text - 原始文本
   * @param count - 保留的段落数
   * @returns 提取的文本摘要
   */
  private extractTextTopParagraphs(text: string, count: number): string {
    // 按双换行分段
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    if (paragraphs.length <= count) {
      // 段落数不多，直接截断到 maxLength
      return text.length > MAX_COMPRESSED_LENGTH
        ? text.slice(0, MAX_COMPRESSED_LENGTH) + '...'
        : text;
    }

    // 选择最长的 N 段（按长度降序排列后取前 N 个，再按原始顺序排列）
    const indexed = paragraphs.map((p, idx) => ({ text: p, idx, length: p.length }));
    indexed.sort((a, b) => b.length - a.length);
    const topN = indexed.slice(0, count);
    topN.sort((a, b) => a.idx - b.idx);

    const result = topN.map(item => {
      const para = item.text.trim();
      return para.length > 80 ? para.slice(0, 80) + '...' : para;
    }).join('\n\n');

    return `${result}\n\n... (原始结果 ${text.length} 字，已压缩为摘要)`;
  }

  /**
   * 构建压缩结果对象。
   */
  private buildResult(
    compressed: string,
    original: string,
    maxLength: number,
  ): CompressedObservation {
    // 截断到最大长度
    const finalCompressed = compressed.length > maxLength
      ? compressed.slice(0, maxLength) + '...'
      : compressed;

    return {
      compressed: finalCompressed,
      original,
      wasCompressed: true,
      compressionRatio: finalCompressed.length / original.length,
    };
  }
}

/**
 * 工具函数：检查结果是否需要压缩。
 */
export function needsCompression(result: string, threshold: number = COMPRESSION_THRESHOLD): boolean {
  return result.length > threshold;
}
