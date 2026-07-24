/**
 * PDF Tools — PDF 深度处理工具集
 *
 * 提供 AI 可调用的 PDF 处理工具：
 * - pdf_extract — 提取文本/表格/图片
 * - pdf_summarize — AI 智能总结
 * - pdf_merge — 合并多个 PDF
 * - pdf_split — 拆分 PDF
 * - pdf_convert — 转换为图片/Markdown
 *
 * v1.0.0: 初始版本
 */

import type { ToolDefinition } from '../aiClient.js';
import type { ToolHandler } from './toolTypes.js';
import type {
  PdfExtractOptions,
  PdfExtractResult,
  PdfExtractMode,
  PdfSummarizeOptions,
  PdfSummarizeResult,
  PdfMergeOptions,
  PdfMergeResult,
  PdfSplitOptions,
  PdfSplitResult,
  PdfSplitMode,
  PdfConvertOptions,
  PdfConvertResult,
  PdfConvertFormat,
  AiProviderType,
} from './pdfTypes.js';

import {
  extractPdfText,
  extractPdfTables,
  mergePdfFiles,
  splitPdfFile,
  convertPdfToImages,
} from './pdfProcessor.js';

import {
  initPdfProviders,
  getAvailableOcrProvider,
  getAiProvider,
  getDefaultAiProvider,
  LocalPdfProvider,
} from './pdfProviders.js';

import { logger } from '../logger.js';

// ===================== 安全：允许的目录 =====================

/**
 * 获取允许操作的目录列表
 */
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

/**
 * 检查路径是否在允许的目录内
 */
function isPathAllowed(filePath: string): boolean {
  const path = require('path');
  const resolvedPath = path.resolve(filePath);
  const allowedDirs = getAllowedDirs();
  return allowedDirs.some(
    (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep)
  );
}

/**
 * 检查文件是否存在
 */
function checkFileExists(filePath: string): { exists: boolean; error?: string } {
  const fs = require('fs');
  const path = require('path');

  const resolvedPath = path.resolve(filePath);

  // 安全检查
  if (!isPathAllowed(resolvedPath)) {
    const allowedDirs = getAllowedDirs();
    const homeDir = require('os').homedir();
    const displayDirs = allowedDirs.map((d) => d.replace(homeDir, '~')).join(', ');
    return {
      exists: false,
      error: `安全限制：仅允许操作以下目录下的文件：${displayDirs}`,
    };
  }

  // 文件存在性检查
  if (!fs.existsSync(resolvedPath)) {
    return {
      exists: false,
      error: `文件不存在: ${resolvedPath}`,
    };
  }

  return { exists: true };
}

// ===================== 工具 Schema 定义 =====================

/**
 * pdf_extract — 提取 PDF 内容（文本/表格/图片）
 */
const pdfExtractDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pdf_extract',
    description:
      '从 PDF 文件中提取文本、表格或图片内容。支持多种提取模式：' +
      '1) text - 提取文本内容（默认）' +
      '2) tables - 提取表格数据' +
      '3) images - 提取图片（需要 pdf2pic）' +
      '4) all - 提取所有内容。' +
      '可选指定页码范围（如 "1-5,8,10-15"）。支持 OCR 提取（针对扫描版 PDF）。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'PDF 文件路径（绝对路径或相对路径）',
        },
        mode: {
          type: 'string',
          enum: ['text', 'tables', 'images', 'all'],
          description: '提取模式：text（文本）、tables（表格）、images（图片）、all（全部）',
          default: 'text',
        },
        pages: {
          type: 'string',
          description: '页码范围（如 "1-5,8,10-15"），默认提取全部',
        },
        max_chars: {
          type: 'number',
          description: '最大返回字符数（文本模式，默认 20000）',
          default: 20000,
        },
        use_ocr: {
          type: 'boolean',
          description: '是否使用 OCR 提取（针对扫描版 PDF，需要 Tesseract 或 PaddleOCR）',
          default: false,
        },
      },
      required: ['path'],
    },
  },
};

/**
 * pdf_summarize — AI 智能总结 PDF
 */
const pdfSummarizeDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pdf_summarize',
    description:
      '使用 AI 对 PDF 文档进行智能总结。支持多种总结类型：' +
      '1) brief - 简要总结（200 字以内）' +
      '2) detailed - 详细总结' +
      '3) structured - 结构化总结（提取关键点、章节结构）。' +
      '支持多种 AI 提供商：OpenAI、Anthropic、Google。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'PDF 文件路径',
        },
        summary_type: {
          type: 'string',
          enum: ['brief', 'detailed', 'structured'],
          description: '总结类型：brief（简要）、detailed（详细）、structured（结构化）',
          default: 'brief',
        },
        ai_provider: {
          type: 'string',
          enum: ['openai', 'anthropic', 'google'],
          description: 'AI 提供商（默认 OpenAI）',
          default: 'openai',
        },
        custom_prompt: {
          type: 'string',
          description: '自定义总结提示词（可选）',
        },
        pages: {
          type: 'string',
          description: '总结的页码范围（可选）',
        },
        max_tokens: {
          type: 'number',
          description: '最大 token 数（默认 2000）',
          default: 2000,
        },
      },
      required: ['path'],
    },
  },
};

/**
 * pdf_merge — 合并多个 PDF
 */
const pdfMergeDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pdf_merge',
    description:
      '将多个 PDF 文件合并为一个 PDF。支持自定义合并顺序和标题。' +
      '需要 pdf-lib 库支持。',
    parameters: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: '要合并的 PDF 文件路径列表（按顺序合并）',
        },
        output_path: {
          type: 'string',
          description: '输出 PDF 文件路径',
        },
        title: {
          type: 'string',
          description: '合并后的 PDF 标题（可选）',
        },
      },
      required: ['paths', 'output_path'],
    },
  },
};

/**
 * pdf_split — 拆分 PDF
 */
const pdfSplitDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pdf_split',
    description:
      '将 PDF 文件拆分为多个小文件。支持多种拆分模式：' +
      '1) pages - 每N页拆分一个文件' +
      '2) range - 按页码范围拆分（如 "1-5,6-10"）。' +
      '需要 pdf-lib 库支持。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '要拆分的 PDF 文件路径',
        },
        output_dir: {
          type: 'string',
          description: '输出目录路径',
        },
        mode: {
          type: 'string',
          enum: ['pages', 'range'],
          description: '拆分模式：pages（按页数）、range（按范围）',
          default: 'pages',
        },
        pages_per_file: {
          type: 'number',
          description: '每文件页数（mode=pages 时使用，默认 1）',
          default: 1,
        },
        ranges: {
          type: 'string',
          description: '页码范围（mode=range 时使用，如 "1-5,6-10,11-15"）',
        },
        naming_pattern: {
          type: 'string',
          description: '文件命名模式（支持 {index}, {page}，默认 "{index}"）',
          default: '{index}',
        },
      },
      required: ['path', 'output_dir'],
    },
  },
};

/**
 * pdf_convert — PDF 转换为图片/Markdown
 */
const pdfConvertDef: ToolDefinition = {
  type: 'function',
  function: {
    name: 'pdf_convert',
    description:
      '将 PDF 文件转换为图片或 Markdown 格式。' +
      '图片转换需要 pdf2pic 和 GraphicsMagick/ImageMagick 支持。' +
      '支持指定图片格式（png/jpg/webp）、分辨率、质量。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'PDF 文件路径',
        },
        output_dir: {
          type: 'string',
          description: '输出目录路径',
        },
        format: {
          type: 'string',
          enum: ['images', 'markdown', 'html'],
          description: '目标格式：images（图片）、markdown（Markdown）、html（HTML）',
          default: 'images',
        },
        image_format: {
          type: 'string',
          enum: ['png', 'jpg', 'webp'],
          description: '图片格式（format=images 时使用，默认 png）',
          default: 'png',
        },
        image_quality: {
          type: 'number',
          description: '图片质量（1-100，默认 90）',
          default: 90,
        },
        image_dpi: {
          type: 'number',
          description: '图片分辨率（DPI，默认 200）',
          default: 200,
        },
        pages: {
          type: 'string',
          description: '转换的页码范围（可选）',
        },
      },
      required: ['path', 'output_dir'],
    },
  },
};

// ===================== 工具处理器实现 =====================

/**
 * 处理 pdf_extract 工具调用
 */
const handlePdfExtract: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const filePath = String(args.path || '');
  const mode = String(args.mode || 'text');
  const pages = args.pages ? String(args.pages) : undefined;
  const maxChars = Number(args.max_chars || 20000);
  const useOcr = Boolean(args.use_ocr);

  // 初始化提供商
  initPdfProviders();

  // 检查文件
  const checkResult = checkFileExists(filePath);
  if (!checkResult.exists) {
    return JSON.stringify({ error: checkResult.error });
  }

  const path = require('path');
  const resolvedPath = path.resolve(filePath);

  try {
    const options: PdfExtractOptions = {
      path: resolvedPath,
      mode: mode as PdfExtractMode,
      pages,
      maxChars,
      useOcr,
    };

    let result: PdfExtractResult;

    // 根据 mode 选择提取方式
    if (useOcr) {
      // 使用 OCR 提取
      const ocrProvider = getAvailableOcrProvider();
      if (!ocrProvider) {
        return JSON.stringify({
          error: 'OCR 提供商不可用，请安装 Tesseract 或 PaddleOCR',
        });
      }

      logger.info('[PDF Tools] 使用 OCR 提取:', resolvedPath);
      const ocrResult = await ocrProvider.recognize(resolvedPath);

      // 构建 OCR 结果
      const fs = require('fs');
      const stat = fs.statSync(resolvedPath);

      result = {
        success: true,
        path: resolvedPath,
        pageCount: ocrResult.pages.length,
        pages: ocrResult.pages.map((p) => ({
          pageNumber: p.pageNumber,
          width: 0,
          height: 0,
          text: p.text,
        })),
        metadata: {
          pageCount: ocrResult.pages.length,
          fileSize: stat.size,
        },
      };
    } else {
      // 使用本地解析
      result = await extractPdfText(resolvedPath, options);
    }

    // 如果需要提取表格
    if (mode === 'tables' || mode === 'all') {
      const tables = await extractPdfTables(resolvedPath);
      if (tables.length > 0) {
        for (const table of tables) {
          const page = result.pages.find((p) => p.pageNumber === table.pageNumber);
          if (page) {
            page.tables = [table];
          }
        }
      }
    }

    return JSON.stringify(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Tools] 提取失败:', resolvedPath, errorMsg);
    return JSON.stringify({ error: `PDF 提取失败: ${errorMsg}` });
  }
};

/**
 * 处理 pdf_summarize 工具调用
 */
const handlePdfSummarize: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const filePath = String(args.path || '');
  const summaryType = String(args.summary_type || 'brief');
  const aiProvider = String(args.ai_provider || 'openai');
  const customPrompt = args.custom_prompt ? String(args.custom_prompt) : undefined;
  const pages = args.pages ? String(args.pages) : undefined;
  const maxTokens = Number(args.max_tokens || 2000);

  // 初始化提供商
  initPdfProviders();

  // 检查文件
  const checkResult = checkFileExists(filePath);
  if (!checkResult.exists) {
    return JSON.stringify({ error: checkResult.error });
  }

  const path = require('path');
  const resolvedPath = path.resolve(filePath);

  try {
    // 先提取文本内容
    const extractResult = await extractPdfText(resolvedPath, {
      path: resolvedPath,
      pages,
      maxChars: 10000, // 总结时提取更多内容
    });

    if (!extractResult.success) {
      return JSON.stringify({ error: extractResult.error });
    }

    // 汇总所有页面文本
    const fullText = extractResult.pages
      .map((p) => p.text || '')
      .join('\n\n');

    // 获取 AI 提供商
    const provider = getAiProvider(aiProvider) || getDefaultAiProvider();

    logger.info('[PDF Tools] 使用 AI 总结:', aiProvider, summaryType);

    // 调用 AI 总结
    const summarizeResult = await provider.summarize(
      {
        text: fullText,
        summaryType: summaryType as any,
        customPrompt,
        metadata: extractResult.metadata,
      },
      {
        type: aiProvider as AiProviderType,
        maxTokens,
      }
    );

    const result: PdfSummarizeResult = {
      success: true,
      path: resolvedPath,
      summary: summarizeResult.summary,
      summaryType,
      keyPoints: summarizeResult.keyPoints,
      structure: summarizeResult.structure,
      metadata: extractResult.metadata,
      tokensUsed: summarizeResult.tokensUsed,
      aiProvider,
    };

    return JSON.stringify(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Tools] 总结失败:', resolvedPath, errorMsg);
    return JSON.stringify({ error: `PDF 总结失败: ${errorMsg}` });
  }
};

/**
 * 处理 pdf_merge 工具调用
 */
const handlePdfMerge: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const paths = (args.paths as string[]) || [];
  const outputPath = String(args.output_path || '');
  const title = args.title ? String(args.title) : undefined;

  if (paths.length < 2) {
    return JSON.stringify({ error: '至少需要 2 个 PDF 文件才能合并' });
  }

  if (!outputPath) {
    return JSON.stringify({ error: '输出路径不能为空' });
  }

  // 检查所有输入文件
  for (const filePath of paths) {
    const checkResult = checkFileExists(filePath);
    if (!checkResult.exists) {
      return JSON.stringify({ error: checkResult.error });
    }
  }

  // 检查输出路径是否在允许目录
  if (!isPathAllowed(outputPath)) {
    return JSON.stringify({
      error: `安全限制：输出路径不在允许的目录内`,
    });
  }

  const path = require('path');
  const resolvedPaths = paths.map((p) => path.resolve(p));
  const resolvedOutputPath = path.resolve(outputPath);

  try {
    const options: PdfMergeOptions = {
      paths: resolvedPaths,
      outputPath: resolvedOutputPath,
      title,
    };

    const result = await mergePdfFiles(options);

    return JSON.stringify(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Tools] 合并失败:', errorMsg);
    return JSON.stringify({ error: `PDF 合并失败: ${errorMsg}` });
  }
};

/**
 * 处理 pdf_split 工具调用
 */
const handlePdfSplit: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const filePath = String(args.path || '');
  const outputDir = String(args.output_dir || '');
  const mode = String(args.mode || 'pages');
  const pagesPerFile = Number(args.pages_per_file || 1);
  const ranges = args.ranges ? String(args.ranges) : undefined;
  const namingPattern = String(args.naming_pattern || '{index}');

  // 检查输入文件
  const checkResult = checkFileExists(filePath);
  if (!checkResult.exists) {
    return JSON.stringify({ error: checkResult.error });
  }

  // 检查输出目录是否在允许目录
  if (!isPathAllowed(outputDir)) {
    return JSON.stringify({
      error: `安全限制：输出目录不在允许的目录内`,
    });
  }

  const path = require('path');
  const resolvedPath = path.resolve(filePath);
  const resolvedOutputDir = path.resolve(outputDir);

  try {
    const options: PdfSplitOptions = {
      path: resolvedPath,
      outputDir: resolvedOutputDir,
      mode: mode as PdfSplitMode,
      pagesPerFile,
      ranges,
      namingPattern,
    };

    const result = await splitPdfFile(options);

    return JSON.stringify(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Tools] 拆分失败:', errorMsg);
    return JSON.stringify({ error: `PDF 拆分失败: ${errorMsg}` });
  }
};

/**
 * 处理 pdf_convert 工具调用
 */
const handlePdfConvert: ToolHandler = async (
  args: Record<string, unknown>
): Promise<string> => {
  const filePath = String(args.path || '');
  const outputDir = String(args.output_dir || '');
  const format = String(args.format || 'images');
  const imageFormat = String(args.image_format || 'png');
  const imageQuality = Number(args.image_quality || 90);
  const imageDpi = Number(args.image_dpi || 200);
  const pages = args.pages ? String(args.pages) : undefined;

  // 检查输入文件
  const checkResult = checkFileExists(filePath);
  if (!checkResult.exists) {
    return JSON.stringify({ error: checkResult.error });
  }

  // 检查输出目录是否在允许目录
  if (!isPathAllowed(outputDir)) {
    return JSON.stringify({
      error: `安全限制：输出目录不在允许的目录内`,
    });
  }

  const path = require('path');
  const resolvedPath = path.resolve(filePath);
  const resolvedOutputDir = path.resolve(outputDir);

  try {
    const options: PdfConvertOptions = {
      path: resolvedPath,
      outputDir: resolvedOutputDir,
      format: format as PdfConvertFormat,
      imageFormat: imageFormat as 'png' | 'jpg' | 'webp',
      imageQuality,
      imageDpi,
      pages,
    };

    // 目前仅支持图片转换
    if (format === 'images') {
      const result = await convertPdfToImages(options);
      return JSON.stringify(result);
    } else if (format === 'markdown' || format === 'html') {
      // Markdown/HTML 转换：先提取文本，再格式化
      const extractResult = await extractPdfText(resolvedPath, {
        path: resolvedPath,
        pages,
        maxChars: 50000,
      });

      if (!extractResult.success) {
        return JSON.stringify({ error: extractResult.error });
      }

      // 生成 Markdown/HTML
      const fs = require('fs');
      if (!fs.existsSync(resolvedOutputDir)) {
        fs.mkdirSync(resolvedOutputDir, { recursive: true });
      }

      const outputFile = path.join(
        resolvedOutputDir,
        `${path.basename(resolvedPath, '.pdf')}.${format}`
      );

      let content = '';
      if (format === 'markdown') {
        // Markdown 格式
        content = `# ${extractResult.metadata?.title || path.basename(resolvedPath)}\n\n`;
        if (extractResult.metadata?.author) {
          content += `作者：${extractResult.metadata.author}\n\n`;
        }
        content += `---\n\n`;
        for (const page of extractResult.pages) {
          content += `## 第 ${page.pageNumber} 页\n\n`;
          content += `${page.text || ''}\n\n`;
        }
      } else {
        // HTML 格式
        content = `<!DOCTYPE html>\n<html>\n<head>\n<title>${extractResult.metadata?.title || path.basename(resolvedPath)}</title>\n</head>\n<body>\n`;
        content += `<h1>${extractResult.metadata?.title || path.basename(resolvedPath)}</h1>\n`;
        if (extractResult.metadata?.author) {
          content += `<p>作者：${extractResult.metadata.author}</p>\n`;
        }
        for (const page of extractResult.pages) {
          content += `<h2>第 ${page.pageNumber} 页</h2>\n`;
          content += `<p>${page.text?.replace(/\n/g, '<br/>') || ''}</p>\n`;
        }
        content += `</body>\n</html>`;
      }

      fs.writeFileSync(outputFile, content);

      const result: PdfConvertResult = {
        success: true,
        outputDir: resolvedOutputDir,
        format: format as PdfConvertFormat,
        outputFiles: [
          {
            path: outputFile,
            pageNumber: 0,
            size: fs.statSync(outputFile).size,
          },
        ],
        totalFiles: 1,
      };

      return JSON.stringify(result);
    }

    return JSON.stringify({ error: `不支持的转换格式: ${format}` });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Tools] 转换失败:', errorMsg);
    return JSON.stringify({ error: `PDF 转换失败: ${errorMsg}` });
  }
};

// ===================== 导出 =====================

/**
 * 获取 PDF 工具定义列表
 */
export function getPdfToolDefinitions(): ToolDefinition[] {
  return [
    pdfExtractDef,
    pdfSummarizeDef,
    pdfMergeDef,
    pdfSplitDef,
    pdfConvertDef,
  ];
}

/**
 * 获取 PDF 工具处理器映射
 */
export function getPdfToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set(pdfExtractDef.function.name, handlePdfExtract);
  handlers.set(pdfSummarizeDef.function.name, handlePdfSummarize);
  handlers.set(pdfMergeDef.function.name, handlePdfMerge);
  handlers.set(pdfSplitDef.function.name, handlePdfSplit);
  handlers.set(pdfConvertDef.function.name, handlePdfConvert);
  return handlers;
}

/**
 * 初始化 PDF 工具（初始化提供商）
 */
export function initPdfTools(): void {
  initPdfProviders();
  logger.debug('[PDF Tools] PDF 工具初始化完成');
}