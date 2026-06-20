import { promises as fsp } from 'fs';

// 动态 require（用于可选依赖 pdf-parse/mammoth/xlsx）
declare function require(id: string): any;

// ===================== File Content Extraction =====================

async function extractFileContent(filePath: string, ext: string, fileName: string): Promise<string> {
  const MAX_SIZE = 100000;

  function buildTruncatedNotice(originalLen: number, truncatedLen: number, fileType: string): string {
    const originalKB = (originalLen / 1024).toFixed(1);
    const truncatedKB = (truncatedLen / 1024).toFixed(1);
    return (
      `\n\n` +
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║  ⚠️  ${fileType}内容超出限制（${originalKB}KB > ${truncatedKB}KB）          ║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  仅展示了前 ${truncatedKB}KB 的内容，后续部分已被截断。            ║\n` +
      `║  如需分析完整内容，建议：                                      ║\n` +
      `║    1. 将文件拆分为多个小文件后分别上传                         ║\n` +
      `║    2. 或先提取关键章节/段落，再粘贴到对话中                    ║\n` +
      `╚══════════════════════════════════════════════════════════════╝`
    );
  }

  const textExts = new Set([
    'txt', 'csv', 'json', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs',
    'cpp', 'c', 'h', 'hpp', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm',
    'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1',
    'css', 'scss', 'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm', 'log', 'tsv',
    'html', 'htm',
  ]);

  if (textExts.has(ext)) {
    const content = await fsp.readFile(filePath, 'utf-8');
    const isTruncated = content.length > MAX_SIZE;
    const truncated = isTruncated
      ? content.slice(0, MAX_SIZE) + buildTruncatedNotice(content.length, MAX_SIZE, '文本文件')
      : content;
    return `\n---\n[附件: ${fileName}]\n\`\`\`${ext}\n${truncated}\n\`\`\`\n---\n`;
  }

  if (ext === 'pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fsp.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text || '';
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'PDF')
        : text;
      return `\n---\n[附件: ${fileName} (PDF, ${pdfData.numpages} 页)]\n${truncated}\n---\n`;
    } catch {
      return `\n---\n[附件: ${fileName} (PDF)]\n注: 无法提取 PDF 文本内容（请安装 pdf-parse: npm install pdf-parse）\n---\n`;
    }
  }

  if (ext === 'docx' || ext === 'doc') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value || '';
      const warnings = result.messages || [];
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'Word 文档')
        : text;
      const warningNote = warnings.length > 0
        ? `\n⚠️ 提取警告: ${warnings.map((w: { message: string }) => w.message).join('; ')}\n`
        : '';
      return `\n---\n[附件: ${fileName} (Word 文档)]\n${warningNote}${truncated}\n---\n`;
    } catch {
      const formatLabel = ext === 'doc' ? 'DOC (旧版 Word)' : 'DOCX (新版 Word)';
      return `\n---\n[附件: ${fileName} (${formatLabel})]\n注: 无法提取 Word 文档文本内容（请安装 mammoth: npm install mammoth）\n---\n`;
    }
  }

  if (ext === 'xlsx') {
    try {
      const xlsx = require('@e965/xlsx');
      const workbook = xlsx.readFile(filePath);
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        text += `\n=== 工作表: ${sheetName} ===\n${csv}\n`;
      }
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'Excel 表格')
        : text;
      return `\n---\n[附件: ${fileName} (Excel 表格)]\n${truncated}\n---\n`;
    } catch {
      return `\n---\n[附件: ${fileName} (XLSX)]\n注: 无法提取 Excel 表格内容（请安装 xlsx: npm install xlsx）\n---\n`;
    }
  }

  if (ext === 'pptx') {
    return `\n---\n[附件: ${fileName} (PPT 演示文稿)]\n注: PPT 文件暂不支持内容提取，请转换为 PDF 后上传\n---\n`;
  }

  const stats = await fsp.stat(filePath);
  return `\n---\n[附件: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)]\n注: 此文件类型暂不支持内容预览\n---\n`;
}

export { extractFileContent };
