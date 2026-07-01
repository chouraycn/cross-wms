/**
 * PDF Routes — REST API 端点
 *
 * 提供 PDF 处理相关的 HTTP 端点，供前端 UI 直接调用。
 *
 * 端点:
 *   GET  /api/pdf/health       — PDF 工具健康检查
 *   POST /api/pdf/extract      — 提取 PDF 内容
 *   POST /api/pdf/summarize    — 总结 PDF 内容
 *   POST /api/pdf/merge        — 合并多个 PDF
 *   POST /api/pdf/split       — 拆分 PDF
 *   POST /api/pdf/convert     — 转换 PDF
 */

import { Router } from 'express';
import { logger } from '../logger.js';
import {
  extractPdfText,
  extractPdfTables,
  mergePdfFiles,
  splitPdfFile,
  convertPdfToImages,
} from '../engine/pdfProcessor.js';
import {
  initPdfProviders,
  getAvailableOcrProvider,
  getAiProvider,
  getDefaultAiProvider,
} from '../engine/pdfProviders.js';
import type {
  PdfExtractOptions,
  PdfMergeOptions,
  PdfSplitOptions,
  PdfConvertOptions,
} from '../engine/pdfTypes.js';

const router = Router();

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

/**
 * 解析页码范围字符串
 * 支持格式: "1-5,8,10-15" => [1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 14, 15]
 */
function parsePageRange(pagesStr: string): number[] {
  const pages: number[] = [];
  const parts = pagesStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((s) => parseInt(s.trim()));
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    } else {
      pages.push(parseInt(trimmed));
    }
  }

  return pages;
}

/**
 * 解析页码范围数组（用于 split API）
 * 格式: [{ start: 1, end: 5 }, { start: 6, end: 10 }]
 */
function parsePageRanges(ranges: Array<{ start: number; end: number }>): string {
  return ranges.map((r) => `${r.start}-${r.end}`).join(',');
}

// ===================== API 端点 =====================

/**
 * GET /api/pdf/health
 * PDF 工具健康检查
 */
router.get('/health', async (_req, res) => {
  try {
    // 初始化 PDF 提供商
    initPdfProviders();

    // 检查 OCR 提供商
    const ocrProvider = getAvailableOcrProvider();

    res.json({
      ok: true,
      available: true,
      version: '1.0.0',
      ocrAvailable: !!ocrProvider,
    });
  } catch (err) {
    logger.error('[PDF API] 健康检查失败:', err);
    res.json({
      ok: true,
      available: false,
      version: '1.0.0',
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdf/extract
 * 提取 PDF 内容
 * Body: { filePath: string, pages?: number[], mode?: 'text' | 'tables' | 'images' | 'all' }
 */
router.post('/extract', async (req, res) => {
  try {
    const { filePath, pages, mode = 'text', useOcr = false } = req.body;

    if (!filePath) {
      res.json({ ok: false, error: 'filePath is required' });
      return;
    }

    // 初始化提供商
    initPdfProviders();

    // 检查文件
    const checkResult = checkFileExists(filePath);
    if (!checkResult.exists) {
      res.json({ ok: false, error: checkResult.error });
      return;
    }

    const path = require('path');
    const resolvedPath = path.resolve(filePath);

    // 转换页码数组为字符串
    const pagesStr = pages && Array.isArray(pages) && pages.length > 0
      ? pages.join(',')
      : undefined;

    const options: PdfExtractOptions = {
      path: resolvedPath,
      mode: mode as any,
      pages: pagesStr,
      maxChars: 20000,
      useOcr,
    };

    let result: any;

    if (useOcr) {
      // 使用 OCR 提取
      const ocrProvider = getAvailableOcrProvider();
      if (!ocrProvider) {
        res.json({
          ok: false,
          error: 'OCR 提供商不可用，请安装 Tesseract 或 PaddleOCR',
        });
        return;
      }

      logger.info('[PDF API] 使用 OCR 提取:', resolvedPath);
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
          const page = result.pages.find((p: any) => p.pageNumber === table.pageNumber);
          if (page) {
            page.tables = [table];
          }
        }
      }
    }

    // 构建返回内容
    const content = result.pages
      .map((p: any) => `--- 第 ${p.pageNumber} 页 ---\n${p.text || ''}`)
      .join('\n\n');

    res.json({
      ok: true,
      content,
      pageCount: result.pageCount,
      pages: result.pages,
      metadata: result.metadata,
    });
  } catch (err) {
    logger.error('[PDF API] 提取失败:', err);
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdf/summarize
 * 总结 PDF 内容
 * Body: { filePath: string, maxLength?: number, summaryType?: 'brief' | 'detailed' | 'structured' }
 */
router.post('/summarize', async (req, res) => {
  try {
    const {
      filePath,
      maxLength,
      summaryType = 'brief',
      aiProvider = 'openai',
      customPrompt,
      pages,
    } = req.body;

    if (!filePath) {
      res.json({ ok: false, error: 'filePath is required' });
      return;
    }

    // 初始化提供商
    initPdfProviders();

    // 检查文件
    const checkResult = checkFileExists(filePath);
    if (!checkResult.exists) {
      res.json({ ok: false, error: checkResult.error });
      return;
    }

    const path = require('path');
    const resolvedPath = path.resolve(filePath);

    // 先提取文本内容
    const pagesStr = pages && Array.isArray(pages) && pages.length > 0
      ? pages.join(',')
      : undefined;

    const extractResult = await extractPdfText(resolvedPath, {
      path: resolvedPath,
      pages: pagesStr,
      maxChars: 10000,
    });

    if (!extractResult.success) {
      res.json({ ok: false, error: extractResult.error });
      return;
    }

    // 汇总所有页面文本
    const fullText = extractResult.pages
      .map((p) => p.text || '')
      .join('\n\n');

    // 获取 AI 提供商
    const provider = getAiProvider(aiProvider) || getDefaultAiProvider();

    logger.info('[PDF API] 使用 AI 总结:', aiProvider, summaryType);

    // 调用 AI 总结
    const summarizeResult = await provider.summarize(
      {
        text: fullText,
        summaryType: summaryType as any,
        customPrompt,
        metadata: extractResult.metadata,
      },
      {
        type: aiProvider as any,
        maxTokens: maxLength || 2000,
      }
    );

    res.json({
      ok: true,
      summary: summarizeResult.summary,
      keyPoints: summarizeResult.keyPoints,
      structure: summarizeResult.structure,
      tokensUsed: summarizeResult.tokensUsed,
      aiProvider,
    });
  } catch (err) {
    logger.error('[PDF API] 总结失败:', err);
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdf/merge
 * 合并多个 PDF
 * Body: { files: string[], outputPath: string }
 */
router.post('/merge', async (req, res) => {
  try {
    const { files, outputPath } = req.body;

    if (!files || !Array.isArray(files) || files.length < 2) {
      res.json({ ok: false, error: '至少需要 2 个 PDF 文件才能合并' });
      return;
    }

    if (!outputPath) {
      res.json({ ok: false, error: 'outputPath is required' });
      return;
    }

    // 检查所有输入文件
    for (const filePath of files) {
      const checkResult = checkFileExists(filePath);
      if (!checkResult.exists) {
        res.json({ ok: false, error: checkResult.error });
        return;
      }
    }

    // 检查输出路径是否在允许目录
    if (!isPathAllowed(outputPath)) {
      res.json({
        ok: false,
        error: '安全限制：输出路径不在允许的目录内',
      });
      return;
    }

    const path = require('path');
    const resolvedPaths = files.map((p) => path.resolve(p));
    const resolvedOutputPath = path.resolve(outputPath);

    const options: PdfMergeOptions = {
      paths: resolvedPaths,
      outputPath: resolvedOutputPath,
    };

    const result = await mergePdfFiles(options);

    res.json({
      ok: result.success,
      outputPath: result.outputPath,
      error: result.error,
    });
  } catch (err) {
    logger.error('[PDF API] 合并失败:', err);
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdf/split
 * 拆分 PDF
 * Body: { filePath: string, ranges: { start: number, end: number }[], outputDir: string }
 */
router.post('/split', async (req, res) => {
  try {
    const { filePath, ranges, outputDir, pagesPerFile, mode = 'range' } = req.body;

    if (!filePath) {
      res.json({ ok: false, error: 'filePath is required' });
      return;
    }

    if (!outputDir) {
      res.json({ ok: false, error: 'outputDir is required' });
      return;
    }

    // 检查输入文件
    const checkResult = checkFileExists(filePath);
    if (!checkResult.exists) {
      res.json({ ok: false, error: checkResult.error });
      return;
    }

    // 检查输出目录是否在允许目录
    if (!isPathAllowed(outputDir)) {
      res.json({
        ok: false,
        error: '安全限制：输出目录不在允许的目录内',
      });
      return;
    }

    const path = require('path');
    const resolvedPath = path.resolve(filePath);
    const resolvedOutputDir = path.resolve(outputDir);

    // 构建选项
    const options: PdfSplitOptions = {
      path: resolvedPath,
      outputDir: resolvedOutputDir,
      mode: mode as any,
    };

    // 根据 mode 设置参数
    if (mode === 'range' && ranges && Array.isArray(ranges)) {
      options.ranges = parsePageRanges(ranges);
    } else if (mode === 'pages' && pagesPerFile) {
      options.pagesPerFile = Number(pagesPerFile);
    }

    const result = await splitPdfFile(options);

    res.json({
      ok: result.success,
      outputFiles: result.outputFiles,
      error: result.error,
    });
  } catch (err) {
    logger.error('[PDF API] 拆分失败:', err);
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/pdf/convert
 * 转换 PDF
 * Body: { filePath: string, format: 'txt' | 'html' | 'image', outputPath: string }
 */
router.post('/convert', async (req, res) => {
  try {
    const {
      filePath,
      format,
      outputPath,
      imageFormat = 'png',
      imageQuality = 90,
      imageDpi = 200,
      pages,
    } = req.body;

    if (!filePath) {
      res.json({ ok: false, error: 'filePath is required' });
      return;
    }

    if (!outputPath) {
      res.json({ ok: false, error: 'outputPath is required' });
      return;
    }

    if (!format || !['txt', 'html', 'image'].includes(format)) {
      res.json({ ok: false, error: 'format must be one of: txt, html, image' });
      return;
    }

    // 检查输入文件
    const checkResult = checkFileExists(filePath);
    if (!checkResult.exists) {
      res.json({ ok: false, error: checkResult.error });
      return;
    }

    // 检查输出路径是否在允许目录
    if (!isPathAllowed(outputPath)) {
      res.json({
        ok: false,
        error: '安全限制：输出路径不在允许的目录内',
      });
      return;
    }

    const path = require('path');
    const fs = require('fs');
    const resolvedPath = path.resolve(filePath);

    // 确定输出目录（outputPath 可能是文件或目录）
    const isDirectory = !path.extname(outputPath);
    const outputDir = isDirectory ? outputPath : path.dirname(outputPath);
    const resolvedOutputDir = path.resolve(outputDir);

    // 确保输出目录存在
    if (!fs.existsSync(resolvedOutputDir)) {
      fs.mkdirSync(resolvedOutputDir, { recursive: true });
    }

    // 根据格式进行转换
    if (format === 'image') {
      // 转换为图片
      const pagesStr = pages && Array.isArray(pages) && pages.length > 0
        ? pages.join(',')
        : undefined;

      const options: PdfConvertOptions = {
        path: resolvedPath,
        outputDir: resolvedOutputDir,
        format: 'images',
        imageFormat: imageFormat as any,
        imageQuality: Number(imageQuality),
        imageDpi: Number(imageDpi),
        pages: pagesStr,
      };

      const result = await convertPdfToImages(options);

      res.json({
        ok: result.success,
        outputPath: result.outputDir,
        outputFiles: result.outputFiles,
        error: result.error,
      });
    } else {
      // 转换为文本或 HTML
      const pagesStr = pages && Array.isArray(pages) && pages.length > 0
        ? pages.join(',')
        : undefined;

      const extractResult = await extractPdfText(resolvedPath, {
        path: resolvedPath,
        pages: pagesStr,
        maxChars: 50000,
      });

      if (!extractResult.success) {
        res.json({ ok: false, error: extractResult.error });
        return;
      }

      // 确定输出文件路径
      const outputFile = isDirectory
        ? path.join(resolvedOutputDir, `${path.basename(resolvedPath, '.pdf')}.${format === 'txt' ? 'txt' : 'html'}`)
        : path.resolve(outputPath);

      let content = '';

      if (format === 'txt') {
        // 纯文本格式
        content = extractResult.pages
          .map((p) => `--- 第 ${p.pageNumber} 页 ---\n${p.text || ''}`)
          .join('\n\n');
      } else {
        // HTML 格式
        content = `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8">\n<title>${extractResult.metadata?.title || path.basename(resolvedPath)}</title>\n</head>\n<body>\n`;
        content += `<h1>${extractResult.metadata?.title || path.basename(resolvedPath)}</h1>\n`;
        if (extractResult.metadata?.author) {
          content += `<p>作者：${extractResult.metadata.author}</p>\n`;
        }
        for (const page of extractResult.pages) {
          content += `<h2>第 ${page.pageNumber} 页</h2>\n`;
          content += `<div>${(page.text || '').replace(/\n/g, '<br/>')}</div>\n`;
        }
        content += `</body>\n</html>`;
      }

      fs.writeFileSync(outputFile, content, 'utf-8');

      res.json({
        ok: true,
        outputPath: outputFile,
      });
    }
  } catch (err) {
    logger.error('[PDF API] 转换失败:', err);
    res.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;