/**
 * apply-patch 工具（代码补丁应用）
 *
 * 解析 unified diff 格式的补丁内容，并将其应用到指定文件。
 * 支持 @@ hunk 头、上下文行、新增行（+）与删除行（-），
 * 适用于 agent 场景下的代码补丁应用。
 *
 * 与 openclaw/src/agents/apply-patch.ts 中 OpenAI 风格的 *** Begin Patch 包络不同，
 * 本模块聚焦于标准 unified diff 的最小化实现，不引入额外依赖。
 *
 * 参考自 openclaw/src/agents/apply-patch.ts。
 */
import fs from 'node:fs/promises';
import { logger } from '../../logger.js';

/** applyPatch 的返回结果。 */
export interface ApplyPatchResult {
  /** 是否应用成功。 */
  success: boolean;
  /** 新增的行数。 */
  linesAdded: number;
  /** 删除的行数。 */
  linesRemoved: number;
  /** 失败时的错误信息。 */
  errorMessage?: string;
}

/** 解析后的单个 hunk。 */
interface ParsedHunk {
  /** 原文件中的起始行号（1-based）。 */
  oldStart: number;
  /** 原文件中该 hunk 覆盖的行数。 */
  oldCount: number;
  /** 新文件中的起始行号（1-based）。 */
  newStart: number;
  /** 新文件中该 hunk 覆盖的行数。 */
  newCount: number;
  /** hunk 体（不含 hunk 头行）。 */
  lines: string[];
}

/** hunk 头 @@ -oldStart,oldCount +newStart,newCount @@ 的解析正则。 */
const HUNK_HEADER_RE = /^@@-(\d+)(?:,(\d+))?\+(\d+)(?:,(\d+))?@@/;

/**
 * 将补丁内容应用到指定文件。
 *
 * 支持 unified diff 格式：包含可选的 `---`/`+++` 头行，以及 `@@ ... @@` hunk 头。
 * 多个 hunk 会按原文件行号倒序应用，避免行号偏移导致的错位。
 *
 * @param patchContent unified diff 格式的补丁内容
 * @param filePath 待应用补丁的目标文件路径
 */
export async function applyPatch(
  patchContent: string,
  filePath: string,
): Promise<ApplyPatchResult> {
  if (!patchContent || typeof patchContent !== 'string') {
    return {
      success: false,
      linesAdded: 0,
      linesRemoved: 0,
      errorMessage: 'Patch content is empty.',
    };
  }
  if (!filePath || typeof filePath !== 'string') {
    return {
      success: false,
      linesAdded: 0,
      linesRemoved: 0,
      errorMessage: 'File path is required.',
    };
  }

  let originalContent = '';
  try {
    originalContent = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      // 文件不存在时视为空文件，补丁中的新增行将创建该文件
      originalContent = '';
    } else {
      return {
        success: false,
        linesAdded: 0,
        linesRemoved: 0,
        errorMessage: `Failed to read file: ${(err as Error).message}`,
      };
    }
  }

  const hunks = parseHunks(patchContent);
  if (hunks.length === 0) {
    return {
      success: false,
      linesAdded: 0,
      linesRemoved: 0,
      errorMessage: 'No valid hunks found in patch content.',
    };
  }

  // 使用 \n 切分，保留行内容；末尾换行不影响行计数
  const lines = originalContent.length > 0 ? originalContent.split('\n') : [];
  // 若原文件以换行结尾，split 会产生一个空尾元素，应用时需要还原
  const trailingNewline = originalContent.length > 0 && originalContent.endsWith('\n');

  let linesAdded = 0;
  let linesRemoved = 0;

  // 倒序应用，避免后续 hunk 的行号因前一个 hunk 的增删而失效
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);

  for (const hunk of sorted) {
    const apply = applyHunk(lines, hunk);
    if (!apply.ok) {
      return {
        success: false,
        linesAdded,
        linesRemoved,
        errorMessage: apply.error,
      };
    }
    linesAdded += apply.added;
    linesRemoved += apply.removed;
  }

  let resultContent = lines.join('\n');
  if (trailingNewline && resultContent.length > 0) {
    resultContent += '\n';
  }

  try {
    await fs.writeFile(filePath, resultContent, 'utf8');
  } catch (err) {
    return {
      success: false,
      linesAdded,
      linesRemoved,
      errorMessage: `Failed to write file: ${(err as Error).message}`,
    };
  }

  return {
    success: true,
    linesAdded,
    linesRemoved,
  };
}

/**
 * 从补丁文本中解析出所有 hunk。
 * 跳过 `---`/`+++` 头行与 diff 控制行，仅保留 `@@` hunk。
 */
function parseHunks(patchContent: string): ParsedHunk[] {
  const rawLines = patchContent.split(/\r?\n/);
  const hunks: ParsedHunk[] = [];

  let i = 0;
  // 跳过可能的 git diff 头（diff --git、index、---、+++ 等）
  while (i < rawLines.length) {
    const line = rawLines[i];
    if (HUNK_HEADER_RE.test(line)) {
      const match = HUNK_HEADER_RE.exec(line);
      if (!match) {
        i += 1;
        continue;
      }
      const oldStart = parseInt(match[1], 10);
      const oldCount = match[2] !== undefined ? parseInt(match[2], 10) : 1;
      const newStart = parseInt(match[3], 10);
      const newCount = match[4] !== undefined ? parseInt(match[4], 10) : 1;

      const body: string[] = [];
      i += 1;
      while (i < rawLines.length) {
        const bodyLine = rawLines[i];
        // 遇到下一个 hunk 头或补丁结尾则停止
        if (HUNK_HEADER_RE.test(bodyLine)) {
          break;
        }
        // 跳过 hunk 之外的控制行（如多余的头信息）
        if (bodyLine.startsWith('---') || bodyLine.startsWith('+++')) {
          i += 1;
          continue;
        }
        body.push(bodyLine);
        i += 1;
      }

      hunks.push({
        oldStart,
        oldCount,
        newStart,
        newCount,
        lines: body,
      });
    } else {
      i += 1;
    }
  }

  return hunks;
}

/** 单个 hunk 的应用结果。 */
interface ApplyHunkResult {
  ok: boolean;
  added: number;
  removed: number;
  error?: string;
}

/**
 * 将单个 hunk 应用到行数组（原地修改）。
 * @param lines 原文件的行数组（会被修改）
 * @param hunk 待应用的 hunk
 */
function applyHunk(lines: string[], hunk: ParsedHunk): ApplyHunkResult {
  // oldStart 为 1-based，0 表示空文件场景（补丁创建新文件）
  const startIdx = Math.max(hunk.oldStart - 1, 0);

  // 解析 hunk 体：区分上下文行、新增行（+）与删除行（-）
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let pureAdded = 0;
  let pureRemoved = 0;
  for (const bodyLine of hunk.lines) {
    if (bodyLine.startsWith('\\')) {
      // "\ No newline at end of file" 等元信息行，跳过
      continue;
    }
    const marker = bodyLine[0];
    const rest = bodyLine.slice(1);
    if (marker === '+') {
      newLines.push(rest);
      pureAdded += 1;
    } else if (marker === '-') {
      oldLines.push(rest);
      pureRemoved += 1;
    } else if (marker === ' ') {
      oldLines.push(rest);
      newLines.push(rest);
    } else if (bodyLine === '') {
      // 空行视为上下文行
      oldLines.push('');
      newLines.push('');
    }
  }

  // 校验原文件对应区段是否与 hunk 描述的旧行一致
  for (let j = 0; j < oldLines.length; j += 1) {
    const original = lines[startIdx + j];
    if (original === undefined) {
      // 原文件行数不足，仍允许在尾部追加（创建新文件场景）
      break;
    }
    if (original !== oldLines[j]) {
      return {
        ok: false,
        added: 0,
        removed: 0,
        error: `Context mismatch at line ${startIdx + j + 1}: expected "${oldLines[j]}", got "${original}".`,
      };
    }
  }

  // 替换 oldLines 区段为 newLines
  lines.splice(startIdx, oldLines.length, ...newLines);

  return {
    ok: true,
    added: pureAdded,
    removed: pureRemoved,
  };
}

logger.debug('[Agents:ApplyPatch] Module loaded');
