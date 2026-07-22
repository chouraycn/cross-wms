import { logger } from '../../../../logger.js';

interface PdfInfo {
  fileName: string;
  pageCount: number;
  fileSize: number;
  title: string;
  author: string;
  createdAt: string;
  modifiedAt: string;
  pdfVersion: string;
}

interface PdfMergeResult {
  success: boolean;
  outputFile: string;
  totalPages: number;
  sourceFiles: string[];
}

interface PdfSplitResult {
  success: boolean;
  outputFiles: string[];
  pageRanges: Array<{ start: number; end: number }>;
}

interface PdfTextResult {
  success: boolean;
  text: string;
  pageCount: number;
  charCount: number;
}

interface PdfImageResult {
  success: boolean;
  images: string[];
  pageCount: number;
  format: string;
}

function generateMockPages(seed: number): number {
  return 1 + (seed % 50);
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function getPdfInfo(fileName: string): PdfInfo {
  logger.debug('[nano-pdf] getPdfInfo for:', fileName);
  const seed = hashString(fileName);
  const pages = generateMockPages(seed);

  return {
    fileName,
    pageCount: pages,
    fileSize: 1024 * (50 + (seed % 500)),
    title: fileName.replace('.pdf', ''),
    author: 'Mock Author',
    createdAt: '2024-01-15T10:30:00Z',
    modifiedAt: '2024-06-20T14:45:00Z',
    pdfVersion: '1.7',
  };
}

export function mergePdfs(files: string[]): PdfMergeResult {
  logger.debug('[nano-pdf] mergePdfs files count:', files.length);
  let totalPages = 0;
  for (const file of files) {
    totalPages += generateMockPages(hashString(file));
  }

  return {
    success: true,
    outputFile: 'merged_output.pdf',
    totalPages,
    sourceFiles: files,
  };
}

export function splitPdf(file: string, startPage: number, endPage: number): PdfSplitResult {
  logger.debug('[nano-pdf] splitPdf:', file, 'pages:', startPage, '-', endPage);
  const info = getPdfInfo(file);
  const actualEnd = Math.min(endPage, info.pageCount);
  const actualStart = Math.max(1, startPage);

  const outputFiles: string[] = [];
  const pageRanges: Array<{ start: number; end: number }> = [];

  if (actualStart > 1) {
    outputFiles.push(`${file.replace('.pdf', '')}_part1.pdf`);
    pageRanges.push({ start: 1, end: actualStart - 1 });
  }

  outputFiles.push(`${file.replace('.pdf', '')}_part2.pdf`);
  pageRanges.push({ start: actualStart, end: actualEnd });

  if (actualEnd < info.pageCount) {
    outputFiles.push(`${file.replace('.pdf', '')}_part3.pdf`);
    pageRanges.push({ start: actualEnd + 1, end: info.pageCount });
  }

  return {
    success: true,
    outputFiles,
    pageRanges,
  };
}

export function extractText(file: string): PdfTextResult {
  logger.debug('[nano-pdf] extractText from:', file);
  const info = getPdfInfo(file);
  const seed = hashString(file);

  const lorem = `这是 ${file} 的示例文本内容。\n\n第 1 页：这是 PDF 文档的第一页内容，包含了一些示例文本用于演示。\n\n第 2 页：第二页继续展示文档内容，包括段落、标题等格式。\n\n第 3 页：最后一页包含文档的总结和附录信息。`;

  const text = lorem.repeat(Math.ceil(info.pageCount / 3)).slice(0, info.pageCount * 500);

  return {
    success: true,
    text,
    pageCount: info.pageCount,
    charCount: text.length,
  };
}

export function pdfToImages(file: string, format: string = 'png'): PdfImageResult {
  logger.debug('[nano-pdf] pdfToImages:', file, 'format:', format);
  const info = getPdfInfo(file);
  const images: string[] = [];

  for (let i = 1; i <= info.pageCount; i++) {
    images.push(`${file.replace('.pdf', '')}_page_${i}.${format}`);
  }

  return {
    success: true,
    images,
    pageCount: info.pageCount,
    format,
  };
}

export default {
  name: 'nano-pdf',
  description: 'PDF 合并、分割、提取文本、转换',
  tools: [
    {
      name: 'pdf_info',
      description: '获取 PDF 文件信息',
      handler: (args: { file: string }) => getPdfInfo(args.file),
    },
    {
      name: 'pdf_merge',
      description: '合并多个 PDF 文件',
      handler: (args: { files: string[] }) => mergePdfs(args.files),
    },
    {
      name: 'pdf_split',
      description: '分割 PDF 文件',
      handler: (args: { file: string; startPage: number; endPage: number }) =>
        splitPdf(args.file, args.startPage, args.endPage),
    },
    {
      name: 'pdf_extractText',
      description: '提取 PDF 文本内容',
      handler: (args: { file: string }) => extractText(args.file),
    },
    {
      name: 'pdf_toImages',
      description: 'PDF 转图片',
      handler: (args: { file: string; format?: string }) => pdfToImages(args.file, args.format),
    },
  ],
};
