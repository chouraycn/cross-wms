/**
 * 清理会话文件中的超大 toolCalls 数据。
 *
 * 用法:
 *   npx tsx server/scripts/cleanup-large-toolcalls.ts
 *
 * 功能:
 *   - 遍历所有会话文件 (~/.cdf-know-clow/sessions/*.jsonl)
 *   - 检测 toolCalls 字段超过阈值的消息
 *   - 截断超大 result，保留元数据
 *   - 备份原文件
 */

import * as fs from 'fs';
import * as path from 'path';

const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
const sessionsDir = path.join(homeDir, '.cdf-know-clow', 'sessions');

const MAX_RESULT_BYTES = 20 * 1024;       // 单个 tool result 最大 20KB
const MAX_TOOLCALLS_TOTAL_BYTES = 500 * 1024; // 单条消息 toolCalls 总大小 500KB
const MAX_THINKING_BYTES = 100 * 1024;    // thinking 最大 100KB

function truncateToolCallsJson(toolCallsStr: string): { result: string; truncated: boolean; origSize: number; newSize: number } {
  const origSize = Buffer.byteLength(toolCallsStr, 'utf-8');
  if (origSize <= MAX_TOOLCALLS_TOTAL_BYTES) {
    return { result: toolCallsStr, truncated: false, origSize, newSize: origSize };
  }

  try {
    const toolCalls = JSON.parse(toolCallsStr);
    if (!Array.isArray(toolCalls)) {
      return { result: toolCallsStr, truncated: false, origSize, newSize: origSize };
    }

    let totalBytes = 0;
    const truncated: unknown[] = [];

    for (const tc of toolCalls) {
      if (!tc || typeof tc !== 'object') continue;

      const result = (tc as Record<string, unknown>).result;
      if (typeof result === 'string' && Buffer.byteLength(result, 'utf-8') > MAX_RESULT_BYTES) {
        const origResultSize = Buffer.byteLength(result, 'utf-8');
        const truncatedResult = result.slice(0, MAX_RESULT_BYTES) +
          `\n\n[已截断，原大小 ${(origResultSize / 1024).toFixed(1)} KB]`;
        (tc as Record<string, unknown>).result = truncatedResult;
      }

      const entryBytes = Buffer.byteLength(JSON.stringify(tc), 'utf-8');
      if (totalBytes + entryBytes > MAX_TOOLCALLS_TOTAL_BYTES) {
        truncated.push({
          name: (tc as Record<string, unknown>).name || 'unknown',
          arguments: '{}',
          result: `[结果过大已省略，原约 ${(entryBytes / 1024).toFixed(1)} KB]`,
        });
        break;
      }

      totalBytes += entryBytes;
      truncated.push(tc);
    }

    const resultStr = JSON.stringify(truncated);
    const newSize = Buffer.byteLength(resultStr, 'utf-8');
    return { result: resultStr, truncated: true, origSize, newSize };
  } catch {
    const truncated = toolCallsStr.slice(0, MAX_TOOLCALLS_TOTAL_BYTES) + '...[truncated]';
    return { result: truncated, truncated: true, origSize, newSize: Buffer.byteLength(truncated, 'utf-8') };
  }
}

function truncateThinking(thinking: string): { result: string; truncated: boolean; origSize: number; newSize: number } {
  const origSize = Buffer.byteLength(thinking, 'utf-8');
  if (origSize <= MAX_THINKING_BYTES) {
    return { result: thinking, truncated: false, origSize, newSize: origSize };
  }
  const result = thinking.slice(0, MAX_THINKING_BYTES) +
    `\n\n[思考内容已截断，原大小 ${(origSize / 1024).toFixed(1)} KB]`;
  return { result, truncated: true, origSize, newSize: Buffer.byteLength(result, 'utf-8') };
}

function processLine(lineObj: any): { modified: boolean; freedBytes: number } {
  let modified = false;
  let freedBytes = 0;

  // 处理 { message: ... } 格式
  if (lineObj.message && typeof lineObj.message === 'object') {
    const msg = lineObj.message;

    if (msg.toolCalls && typeof msg.toolCalls === 'string') {
      const t = truncateToolCallsJson(msg.toolCalls);
      if (t.truncated) {
        msg.toolCalls = t.result;
        modified = true;
        freedBytes += t.origSize - t.newSize;
      }
    }

    if (msg.thinking && typeof msg.thinking === 'string') {
      const t = truncateThinking(msg.thinking);
      if (t.truncated) {
        msg.thinking = t.result;
        modified = true;
        freedBytes += t.origSize - t.newSize;
      }
    }
  }

  // 处理 { session: ..., messages: [...] } 格式（第一行）
  if (lineObj.session && Array.isArray(lineObj.messages)) {
    for (const msg of lineObj.messages) {
      if (msg.toolCalls && typeof msg.toolCalls === 'string') {
        const t = truncateToolCallsJson(msg.toolCalls);
        if (t.truncated) {
          msg.toolCalls = t.result;
          modified = true;
          freedBytes += t.origSize - t.newSize;
        }
      }

      if (msg.thinking && typeof msg.thinking === 'string') {
        const t = truncateThinking(msg.thinking);
        if (t.truncated) {
          msg.thinking = t.result;
          modified = true;
          freedBytes += t.origSize - t.newSize;
        }
      }
    }
  }

  return { modified, freedBytes };
}

/**
 * 尝试 JSON.parse，对超大字符串先做初步截断再 parse
 */
function safeParseLine(line: string): any {
  const MAX_PARSE_LEN = 200 * 1024 * 1024; // 200MB 以上先尝试截断
  if (line.length > MAX_PARSE_LEN) {
    // 查找 toolCalls 字段的起始位置并截断其内容
    const tcMatch = line.indexOf('"toolCalls":"');
    if (tcMatch >= 0) {
      const start = tcMatch + '"toolCalls":"'.length;
      // 找到结尾（考虑转义）
      let end = start;
      let inEscape = false;
      while (end < line.length && end - start < MAX_TOOLCALLS_TOTAL_BYTES * 2) {
        const ch = line[end];
        if (inEscape) {
          inEscape = false;
        } else if (ch === '\\') {
          inEscape = true;
        } else if (ch === '"') {
          break;
        }
        end++;
      }
      // 截断 toolCalls 内容
      const before = line.slice(0, start);
      const after = line.slice(end);
      const truncated = '[truncated - too large]';
      line = before + truncated + after;
    }
  }
  return JSON.parse(line);
}

/**
 * 直接在 Buffer 级别查找并截断 toolCalls 字段内容。
 * 用于超大文件无法整行 JSON.parse 的情况。
 */
function truncateToolCallsInBuffer(buf: Buffer): { result: Buffer; truncated: boolean; savedBytes: number } {
  const marker = Buffer.from('"toolCalls":"');
  let totalSaved = 0;
  let anyTruncated = false;
  let result = buf;

  let pos = 0;
  while (pos < result.length) {
    const idx = result.indexOf(marker, pos);
    if (idx < 0) break;

    const valueStart = idx + marker.length;

    // 找到结束的引号（考虑转义）
    let endPos = valueStart;
    let inEscape = false;
    while (endPos < result.length) {
      const byte = result[endPos];
      if (inEscape) {
        inEscape = false;
      } else if (byte === 0x5c /* \ */) {
        inEscape = true;
      } else if (byte === 0x22 /* " */) {
        break;
      }
      endPos++;
    }

    if (endPos >= result.length) break;

    const valueLen = endPos - valueStart;
    if (valueLen > MAX_TOOLCALLS_TOTAL_BYTES) {
      // 需要截断
      const replacement = Buffer.from('[truncated - too large]');
      const before = result.slice(0, valueStart);
      const after = result.slice(endPos);
      result = Buffer.concat([before, replacement, after]);
      totalSaved += valueLen - replacement.length;
      anyTruncated = true;
      pos = valueStart + replacement.length;
    } else {
      pos = endPos + 1;
    }
  }

  return { result, truncated: anyTruncated, savedBytes: totalSaved };
}

function processSessionFile(filePath: string): { freedBytes: number; modified: boolean } {
  let totalFreed = 0;
  let anyModified = false;

  const fileSize = fs.statSync(filePath).size;

  // 小文件（< 100MB）：常规方式处理
  if (fileSize < 100 * 1024 * 1024) {
    const outputLines: string[] = [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) {
        outputLines.push(line);
        continue;
      }

      try {
        const obj = safeParseLine(line);
        const { modified, freedBytes } = processLine(obj);
        if (modified) {
          anyModified = true;
          totalFreed += freedBytes;
        }
        outputLines.push(JSON.stringify(obj));
      } catch (e) {
        outputLines.push(line);
        console.warn(`    第 ${i + 1} 行解析失败，保留原样: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (anyModified) {
      const backupPath = filePath + '.bak';
      fs.copyFileSync(filePath, backupPath);
      fs.writeFileSync(filePath, outputLines.join('\n'), 'utf-8');
    }

    return { freedBytes: totalFreed, modified: anyModified };
  }

  // 大文件：Buffer 级别处理，直接截断 toolCalls
  console.log(`    [大文件处理] ${(fileSize / 1024 / 1024).toFixed(1)} MB，使用 Buffer 级别截断`);
  const buf = fs.readFileSync(filePath);
  const { result, truncated, savedBytes } = truncateToolCallsInBuffer(buf);

  if (truncated) {
    const backupPath = filePath + '.bak';
    fs.copyFileSync(filePath, backupPath);
    fs.writeFileSync(filePath, result);
    anyModified = true;
    totalFreed = savedBytes;
  }

  return { freedBytes: totalFreed, modified: anyModified };
}

function main(): void {
  if (!fs.existsSync(sessionsDir)) {
    console.log(`会话目录不存在: ${sessionsDir}`);
    return;
  }

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.jsonl'));
  console.log(`找到 ${files.length} 个会话文件，目录: ${sessionsDir}`);
  console.log('');

  let totalFreed = 0;
  let modifiedCount = 0;

  for (const file of files) {
    const filePath = path.join(sessionsDir, file);
    try {
      const { freedBytes, modified } = processSessionFile(filePath);
      if (modified) {
        modifiedCount++;
        totalFreed += freedBytes;
        console.log(`  ✓ ${file}  释放 ${(freedBytes / 1024 / 1024).toFixed(2)} MB`);
      }
    } catch (e) {
      console.error(`  ✗ ${file}  处理失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log('');
  console.log(`处理完成：修改了 ${modifiedCount} 个文件，共释放 ${(totalFreed / 1024 / 1024).toFixed(2)} MB`);
  if (modifiedCount > 0) {
    console.log('备份文件以 .bak 结尾保存在同目录下，确认无误后可手动删除。');
  }
}

main();
