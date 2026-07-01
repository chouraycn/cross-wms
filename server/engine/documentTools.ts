/**
 * Document Tools — 文档处理工具（PDF、Word、Excel）
 *
 * 提供 AI 可调用的文档内容提取工具：
 *   document_extractText — 从文档中提取文本内容（支持 PDF、Word、Excel、纯文本）
 *
 * PDF 深度处理功能已迁移到 pdfTools.ts：
 *   pdf_extract — 提取文本/表格/图片（支持 OCR）
 *   pdf_summarize — AI 智能总结
 *   pdf_merge — 合并多个 PDF
 *   pdf_split — 拆分 PDF
 *   pdf_convert — 转换为图片/Markdown
 *
 * 依赖：
 *   - pdf-parse: PDF 文本提取
 *   - mammoth: Word 文档 (.docx) 转 Markdown/文本
 *   - @e965/xlsx: Excel 电子表格解析
 *   - pdf-lib: PDF 操作（合并、拆分）
 *   - pdf2pic: PDF 转图片（可选）
 *   - tesseract.js/PaddleOCR: OCR 支持（可选）
 */

import type { ToolDefinition } from '../aiClient.js';
import type { RegisteredTool, ToolHandler } from './toolTypes.js';
import { logger } from '../logger.js';

// ===================== 工具 Schema 定义 =====================

const documentExtractTextDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'document_extractText',
    description:
      '从本地文档文件中提取纯文本内容。支持 PDF (.pdf)、Word (.docx)、Excel (.xlsx, .xls)、CSV (.csv) 和纯文本文件。' +
      '提取后的文本可用于分析、摘要、问答等。注意：仅允许读取用户目录（Desktop、Documents、Downloads）和临时目录下的文件。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '文档文件的本地路径（绝对路径或相对路径）',
        },
        max_chars: {
          type: 'number',
          description: '最大返回字符数（默认 20000，防止 token 超限）',
          default: 20000,
        },
        sheet: {
          type: 'string',
          description: '（仅 Excel）指定工作表名称，默认返回第一个工作表',
        },
      },
      required: ['path'],
    },
  },
};

// ===================== 安全：允许的目录 =====================

function getAllowedDirs(): string[] {
  const os = require('os');
  const path = require('path');
  const homeDir = os.homedir();
  return [
    path.join(homeDir, 'Desktop'),
    path.join(homeDir, 'Documents'),
    path.join(homeDir, 'Downloads'),
    '/tmp',
    '/private/tmp',
  ];
}

function isPathAllowed(filePath: string): boolean {
  const path = require('path');
  const resolvedPath = path.resolve(filePath);
  const allowedDirs = getAllowedDirs();
  return allowedDirs.some(
    (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep)
  );
}

// ===================== 文档提取实现 =====================

async function extractPdfText(filePath: string): Promise<string> {
  const fs = require('fs');
  const pdfParse = require('pdf-parse');
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text || '';
}

async function extractWordText(filePath: string): Promise<string> {
  const fs = require('fs');
  const mammoth = require('mammoth');
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

async function extractExcelText(
  filePath: string,
  sheetName?: string
): Promise<string> {
  const XLSX = require('@e965/xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheetToUse = sheetName || workbook.SheetNames[0];
  if (!sheetToUse || !workbook.Sheets[sheetToUse]) {
    throw new Error(
      `工作表不存在。可用工作表: ${workbook.SheetNames.join(', ')}`
    );
  }
  const worksheet = workbook.Sheets[sheetToUse];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const lines: string[] = [];
  lines.push(
    `[Excel 工作表: ${sheetToUse}，共 ${jsonData.length} 行]`
  );
  for (const row of jsonData) {
    if (Array.isArray(row)) {
      lines.push(
        row
          .map((cell) => (cell !== undefined && cell !== null ? String(cell) : ''))
          .join('\t')
      );
    }
  }
  return lines.join('\n');
}

async function extractCsvText(filePath: string): Promise<string> {
  const fs = require('fs');
  const content = fs.readFileSync(filePath, 'utf-8');
  return content;
}

async function extractPlainText(filePath: string): Promise<string> {
  const fs = require('fs');
  return fs.readFileSync(filePath, 'utf-8');
}

function getFileExtension(filePath: string): string {
  const path = require('path');
  return path.extname(filePath).toLowerCase();
}

// ===================== 处理器 =====================

const handleDocumentExtractText: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const fs = require('fs');
  const path = require('path');

  const filePath = String(args.path || '');
  const maxChars = Number(args.max_chars || 20000);
  const sheetName = args.sheet ? String(args.sheet) : undefined;

  if (!filePath) {
    return JSON.stringify({ error: '文件路径不能为空' });
  }

  const resolvedPath = path.resolve(filePath);

  // 安全检查：路径必须在允许的目录内
  if (!isPathAllowed(resolvedPath)) {
    const allowedDirs = getAllowedDirs();
    const homeDir = require('os').homedir();
    const displayDirs = allowedDirs.map((d) => d.replace(homeDir, '~')).join(', ');
    return JSON.stringify({
      error: `安全限制：仅允许读取以下目录下的文件：${displayDirs}`,
    });
  }

  // 检查文件是否存在
  if (!fs.existsSync(resolvedPath)) {
    return JSON.stringify({ error: `文件不存在: ${resolvedPath}` });
  }

  // 检查是否为文件
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return JSON.stringify({ error: `路径不是文件: ${resolvedPath}` });
  }

  // 文件大小限制（最大 50MB）
  const maxSize = 50 * 1024 * 1024;
  if (stat.size > maxSize) {
    return JSON.stringify({
      error: `文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），最大支持 50MB`,
    });
  }

  const ext = getFileExtension(resolvedPath);

  try {
    let text = '';
    let docType = '';

    switch (ext) {
      case '.pdf':
        docType = 'PDF';
        text = await extractPdfText(resolvedPath);
        break;
      case '.docx':
        docType = 'Word';
        text = await extractWordText(resolvedPath);
        break;
      case '.xlsx':
      case '.xls':
        docType = 'Excel';
        text = await extractExcelText(resolvedPath, sheetName);
        break;
      case '.csv':
        docType = 'CSV';
        text = await extractCsvText(resolvedPath);
        break;
      case '.txt':
      case '.md':
      case '.json':
      case '.js':
      case '.ts':
      case '.py':
      case '.java':
      case '.c':
      case '.cpp':
      case '.html':
      case '.css':
      case '.xml':
      case '.yaml':
      case '.yml':
        docType = '纯文本';
        text = await extractPlainText(resolvedPath);
        break;
      default:
        return JSON.stringify({
          error: `不支持的文件格式: ${ext}。支持的格式: .pdf, .docx, .xlsx, .xls, .csv, .txt, .md, .json 等`,
        });
    }

    // 截断过长文本
    const wasTruncated = text.length > maxChars;
    const displayText = wasTruncated ? text.slice(0, maxChars) : text;

    return JSON.stringify({
      success: true,
      path: resolvedPath,
      type: docType,
      total_chars: text.length,
      returned_chars: displayText.length,
      truncated: wasTruncated,
      content: displayText,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[DocumentTools] 提取失败:', resolvedPath, errorMsg);
    return JSON.stringify({ error: `文档提取失败: ${errorMsg}` });
  }
};

// ===================== 导出 =====================

export function getDocumentToolDefinitions(): ToolDefinition[] {
  return [documentExtractTextDef];
}

export function getDocumentToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set(documentExtractTextDef.function.name, handleDocumentExtractText);
  return handlers;
}
