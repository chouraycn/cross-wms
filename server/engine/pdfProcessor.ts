/**
 * PDF Processor — PDF 深度处理核心处理器
 *
 * 集成多种 PDF 处理库：
 * - pdf-parse: 文本提取
 * - pdf-lib: PDF 操作（合并、拆分）
 * - pdf2pic: PDF 转图片
 * - 表格提取：基于 pdf-parse 扩展
 *
 * v1.0.0: 初始版本
 */

import type {
  PdfExtractResult,
  PdfExtractOptions,
  PdfMetadata,
  PdfPageInfo,
  PdfTable,
  PdfImage,
  PdfMergeResult,
  PdfMergeOptions,
  PdfSplitResult,
  PdfSplitOptions,
  PdfConvertResult,
  PdfConvertOptions,
} from './pdfTypes.js';

import { logger } from '../logger.js';

// ===================== 工具库动态加载 =====================

/**
 * 动态加载 pdf-parse 库
 * pdf-parse 用于提取 PDF 文本内容和元数据
 */
async function loadPdfParse(): Promise<any> {
  try {
    return require('pdf-parse');
  } catch (err) {
    logger.warn('[PDF Processor] pdf-parse not available:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * 动态加载 pdf-lib 库
 * pdf-lib 用于 PDF 操作（合并、拆分、修改）
 * 注意：pdf-lib 是 ESM 模块，需要特殊处理
 */
async function loadPdfLib(): Promise<any> {
  try {
    // pdf-lib 是 ESM 模块，使用动态 import
    // @ts-expect-error pdf-lib 类型声明不可用
    const pdfLib = await import('pdf-lib');
    return pdfLib;
  } catch (err) {
    logger.warn('[PDF Processor] pdf-lib not available:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ===================== PDF 文本提取 =====================

/**
 * 提取 PDF 文本内容
 * 使用 pdf-parse 库提取文本、元数据
 */
export async function extractPdfText(
  filePath: string,
  options: PdfExtractOptions = { path: '' }
): Promise<PdfExtractResult> {
  const fs = require('fs');
  const path = require('path');

  // 检查文件是否存在
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      path: filePath,
      pageCount: 0,
      pages: [],
      error: `文件不存在: ${filePath}`,
    };
  }

  // 获取文件大小
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  // 加载 pdf-parse
  const pdfParse = await loadPdfParse();
  if (!pdfParse) {
    return {
      success: false,
      path: filePath,
      pageCount: 0,
      pages: [],
      error: 'pdf-parse 库未安装，无法提取 PDF 文本',
    };
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);

    // 解析 PDF 文件
    const data = await pdfParse(dataBuffer);

    // 构建元数据
    const metadata: PdfMetadata = {
      title: data.info?.Title || undefined,
      author: data.info?.Author || undefined,
      subject: data.info?.Subject || undefined,
      creator: data.info?.Creator || undefined,
      producer: data.info?.Producer || undefined,
      creationDate: data.info?.CreationDate || undefined,
      modificationDate: data.info?.ModDate || undefined,
      pageCount: data.numpages,
      fileSize,
    };

    // 解析页码范围
    const pageNumbers = parsePageRange(options.pages, data.numpages);

    // 构建页面信息
    const pages: PdfPageInfo[] = [];

    // pdf-parse 返回的是完整文本，需要手动分页
    // 由于 pdf-parse 不提供逐页文本，这里简化处理
    // 实际项目中可以使用更高级的库如 pdf.js 实现逐页提取
    const fullText = data.text || '';

    // 简化分页：按换行符估算分页
    const linesPerPage = Math.ceil(fullText.split('\n').length / data.numpages);

    for (const pageNum of pageNumbers) {
      const startIndex = (pageNum - 1) * linesPerPage;
      const endIndex = pageNum * linesPerPage;
      const lines = fullText.split('\n');
      const pageText = lines.slice(startIndex, endIndex).join('\n');

      pages.push({
        pageNumber: pageNum,
        width: 0, // pdf-parse 不提供页面尺寸
        height: 0,
        text: pageText,
      });
    }

    // 截断文本（如果设置了 maxChars）
    const maxChars = options.maxChars || 20000;
    let totalChars = 0;
    for (const page of pages) {
      if (page.text) {
        totalChars += page.text.length;
        if (totalChars > maxChars) {
          page.text = page.text?.substring(0, maxChars - (totalChars - page.text.length));
          break;
        }
      }
    }

    return {
      success: true,
      path: filePath,
      pageCount: data.numpages,
      pages,
      metadata,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Processor] 提取文本失败:', filePath, errorMsg);
    return {
      success: false,
      path: filePath,
      pageCount: 0,
      pages: [],
      error: `PDF 文本提取失败: ${errorMsg}`,
    };
  }
}

// ===================== PDF 合并 =====================

/**
 * 合并多个 PDF 文件
 * 使用 pdf-lib 库实现 PDF 合并
 */
export async function mergePdfFiles(
  options: PdfMergeOptions
): Promise<PdfMergeResult> {
  const fs = require('fs');
  const path = require('path');

  // 检查输入文件
  for (const filePath of options.paths) {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        outputPath: options.outputPath,
        inputFiles: options.paths,
        totalPages: 0,
        fileSize: 0,
        error: `输入文件不存在: ${filePath}`,
      };
    }
  }

  // 加载 pdf-lib
  const pdfLib = await loadPdfLib();
  if (!pdfLib) {
    return {
      success: false,
      outputPath: options.outputPath,
      inputFiles: options.paths,
      totalPages: 0,
      fileSize: 0,
      error: 'pdf-lib 库未安装，无法合并 PDF',
    };
  }

  try {
    const { PDFDocument } = pdfLib;

    // 创建新的 PDF 文档
    const mergedPdf = await PDFDocument.create();

    // 设置标题
    if (options.title) {
      mergedPdf.setTitle(options.title);
    }

    // 按顺序合并每个 PDF
    const inputFiles: string[] = [];
    let totalPages = 0;

    for (const filePath of options.paths) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(dataBuffer);
      const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());

      for (const page of pages) {
        mergedPdf.addPage(page);
      }

      totalPages += pages.length;
      inputFiles.push(filePath);
    }

    // 保存合并后的 PDF
    const mergedPdfBytes = await mergedPdf.save();

    // 确保输出目录存在
    const outputDir = path.dirname(options.outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(options.outputPath, mergedPdfBytes);

    return {
      success: true,
      outputPath: options.outputPath,
      inputFiles,
      totalPages,
      fileSize: mergedPdfBytes.length,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Processor] 合并 PDF 失败:', errorMsg);
    return {
      success: false,
      outputPath: options.outputPath,
      inputFiles: options.paths,
      totalPages: 0,
      fileSize: 0,
      error: `PDF 合并失败: ${errorMsg}`,
    };
  }
}

// ===================== PDF 拆分 =====================

/**
 * 拆分 PDF 文件
 * 使用 pdf-lib 库实现 PDF 拆分
 */
export async function splitPdfFile(
  options: PdfSplitOptions
): Promise<PdfSplitResult> {
  const fs = require('fs');
  const path = require('path');

  // 检查输入文件
  if (!fs.existsSync(options.path)) {
    return {
      success: false,
      outputDir: options.outputDir,
      outputFiles: [],
      totalFiles: 0,
      error: `输入文件不存在: ${options.path}`,
    };
  }

  // 加载 pdf-lib
  const pdfLib = await loadPdfLib();
  if (!pdfLib) {
    return {
      success: false,
      outputDir: options.outputDir,
      outputFiles: [],
      totalFiles: 0,
      error: 'pdf-lib 库未安装，无法拆分 PDF',
    };
  }

  try {
    const { PDFDocument } = pdfLib;

    // 加载源 PDF
    const dataBuffer = fs.readFileSync(options.path);
    const sourcePdf = await PDFDocument.load(dataBuffer);
    const totalPages = sourcePdf.getPageCount();

    // 确保输出目录存在
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    const outputFiles: Array<{
      path: string;
      pages: number;
      startPage: number;
      endPage: number;
    }> = [];

    // 根据拆分模式处理
    const mode = options.mode || 'pages';
    const namingPattern = options.namingPattern || '{index}';

    if (mode === 'pages' && options.pagesPerFile) {
      // 按页数拆分
      const pagesPerFile = options.pagesPerFile;
      const fileCount = Math.ceil(totalPages / pagesPerFile);

      for (let i = 0; i < fileCount; i++) {
        const startPage = i * pagesPerFile;
        const endPage = Math.min((i + 1) * pagesPerFile, totalPages);

        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(
          sourcePdf,
          Array.from({ length: endPage - startPage }, (_, j) => startPage + j)
        );
        pages.forEach((page: any) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        const fileName = namingPattern
          .replace('{index}', String(i + 1))
          .replace('{page}', String(startPage + 1));
        const outputPath = path.join(options.outputDir, `${fileName}.pdf`);

        fs.writeFileSync(outputPath, pdfBytes);

        outputFiles.push({
          path: outputPath,
          pages: endPage - startPage,
          startPage: startPage + 1,
          endPage,
        });
      }
    } else if (mode === 'range' && options.ranges) {
      // 按范围拆分
      const ranges = parseRanges(options.ranges);

      for (let i = 0; i < ranges.length; i++) {
        const [start, end] = ranges[i];
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(
          sourcePdf,
          Array.from({ length: end - start + 1 }, (_, j) => start - 1 + j)
        );
        pages.forEach((page: any) => newPdf.addPage(page));

        const pdfBytes = await newPdf.save();
        const fileName = namingPattern
          .replace('{index}', String(i + 1))
          .replace('{page}', String(start));
        const outputPath = path.join(options.outputDir, `${fileName}.pdf`);

        fs.writeFileSync(outputPath, pdfBytes);

        outputFiles.push({
          path: outputPath,
          pages: end - start + 1,
          startPage: start,
          endPage: end,
        });
      }
    } else {
      // 默认：每页一个文件
      for (let i = 0; i < totalPages; i++) {
        const newPdf = await PDFDocument.create();
        const [page] = await newPdf.copyPages(sourcePdf, [i]);
        newPdf.addPage(page);

        const pdfBytes = await newPdf.save();
        const fileName = namingPattern
          .replace('{index}', String(i + 1))
          .replace('{page}', String(i + 1));
        const outputPath = path.join(options.outputDir, `${fileName}.pdf`);

        fs.writeFileSync(outputPath, pdfBytes);

        outputFiles.push({
          path: outputPath,
          pages: 1,
          startPage: i + 1,
          endPage: i + 1,
        });
      }
    }

    return {
      success: true,
      outputDir: options.outputDir,
      outputFiles,
      totalFiles: outputFiles.length,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Processor] 拆分 PDF 失败:', errorMsg);
    return {
      success: false,
      outputDir: options.outputDir,
      outputFiles: [],
      totalFiles: 0,
      error: `PDF 拆分失败: ${errorMsg}`,
    };
  }
}

// ===================== PDF 转图片 =====================

/**
 * PDF 转换为图片
 * 注意：pdf2pic 需要 GraphicsMagick 或 ImageMagick 支持
 * 如果没有安装，返回错误提示
 */
export async function convertPdfToImages(
  options: PdfConvertOptions
): Promise<PdfConvertResult> {
  const fs = require('fs');
  const path = require('path');

  // 检查输入文件
  if (!fs.existsSync(options.path)) {
    return {
      success: false,
      outputDir: options.outputDir,
      format: 'images',
      outputFiles: [],
      totalFiles: 0,
      error: `输入文件不存在: ${options.path}`,
    };
  }

  // 检查 pdf2pic 是否可用
  try {
    require.resolve('pdf2pic');
  } catch {
    return {
      success: false,
      outputDir: options.outputDir,
      format: 'images',
      outputFiles: [],
      totalFiles: 0,
      error: 'pdf2pic 库未安装，无法将 PDF 转换为图片。请安装 pdf2pic 和 GraphicsMagick/ImageMagick',
    };
  }

  try {
    const pdf2pic = require('pdf2pic');
    const pdfParse = await loadPdfParse();

    // 获取 PDF 页数
    const dataBuffer = fs.readFileSync(options.path);
    const pdfData = pdfParse ? await pdfParse(dataBuffer) : null;
    const totalPages = pdfData?.numpages || 1;

    // 解析页码范围
    const pageNumbers = parsePageRange(options.pages, totalPages);

    // 确保输出目录存在
    if (!fs.existsSync(options.outputDir)) {
      fs.mkdirSync(options.outputDir, { recursive: true });
    }

    // 配置 pdf2pic
    const dpi = options.imageDpi || 200;
    const quality = options.imageQuality || 90;
    const imageFormat = options.imageFormat || 'png';

    const convert = pdf2pic.fromPath(options.path, {
      density: dpi,
      saveFilename: 'page',
      savePath: options.outputDir,
      format: imageFormat,
      width: 2000,
      height: 2000,
    });

    const outputFiles: Array<{
      path: string;
      pageNumber: number;
      size: number;
    }> = [];

    // 转换指定页面
    for (const pageNum of pageNumbers) {
      const result = await convert(pageNum, { responseType: 'image' });

      if (result && result.path) {
        const stat = fs.statSync(result.path);
        outputFiles.push({
          path: result.path,
          pageNumber: pageNum,
          size: stat.size,
        });
      }
    }

    return {
      success: true,
      outputDir: options.outputDir,
      format: 'images',
      outputFiles,
      totalFiles: outputFiles.length,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error('[PDF Processor] PDF 转图片失败:', errorMsg);
    return {
      success: false,
      outputDir: options.outputDir,
      format: 'images',
      outputFiles: [],
      totalFiles: 0,
      error: `PDF 转图片失败: ${errorMsg}`,
    };
  }
}

// ===================== 辅助函数 =====================

/**
 * 解析页码范围字符串
 * 例如：'1-5,8,10-15' → [1, 2, 3, 4, 5, 8, 10, 11, 12, 13, 14, 15]
 */
function parsePageRange(rangeStr?: string, maxPages: number = 100): number[] {
  if (!rangeStr) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pages: number[] = [];
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((s) => parseInt(s.trim(), 10));
      if (start && end && start <= end) {
        for (let i = start; i <= end && i <= maxPages; i++) {
          pages.push(i);
        }
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (pageNum && pageNum <= maxPages) {
        pages.push(pageNum);
      }
    }
  }

  return pages.sort((a, b) => a - b);
}

/**
 * 解析范围字符串为范围数组
 * 例如：'1-5,6-10' → [[1, 5], [6, 10]]
 */
function parseRanges(rangeStr: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const parts = rangeStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map((s) => parseInt(s.trim(), 10));
      if (start && end && start <= end) {
        ranges.push([start, end]);
      }
    } else {
      const pageNum = parseInt(trimmed, 10);
      if (pageNum) {
        ranges.push([pageNum, pageNum]);
      }
    }
  }

  return ranges;
}

// ===================== 表格提取（简化版） =====================

/**
 * 提取 PDF 表格数据（简化实现）
 * 注意：完整的表格提取需要专门的库如 pdf-table-extractor 或 Camelot
 */
export async function extractPdfTables(filePath: string): Promise<PdfTable[]> {
  // 简化实现：基于 pdf-parse 的文本解析
  // 实际项目中应使用专门的表格提取库
  const fs = require('fs');

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const pdfParse = await loadPdfParse();
  if (!pdfParse) {
    return [];
  }

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    const text = data.text || '';

    // 简单的表格检测：查找连续的分隔符（制表符或多列对齐）
    const tables: PdfTable[] = [];
    const lines = text.split('\n');

    // 简化处理：将连续有制表符的行识别为表格行
    const tableLines: string[] = [];
    for (const line of lines) {
      if (line.includes('\t') || line.split(/\s{2,}/).length > 2) {
        tableLines.push(line);
      }
    }

    if (tableLines.length > 0) {
      const rows = tableLines.map((line) =>
        line.split(/\t|\s{2,}/).map((cell) => cell.trim())
      );

      tables.push({
        pageNumber: 1, // 简化：假设在第一页
        rows: rows,
        rowCount: rows.length,
        columnCount: rows[0]?.length || 0,
      });
    }

    return tables;
  } catch (err) {
    logger.error('[PDF Processor] 表格提取失败:', err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ===================== 导出 =====================

export {
  loadPdfParse,
  loadPdfLib,
  parsePageRange,
  parseRanges,
};