/**
 * Reference 加载器 (v1.5.79)
 *
 * 加载技能目录下 references/ 子目录中的参考文档。
 * 支持 .md、.txt、.pdf 等格式，文件大小限制可配置。
 */
import * as fs from 'fs';
import path from 'path';

// ===================== 类型定义 =====================

export interface LoadedReference {
  filename: string;
  summary: string;
  content: string;
  type: 'markdown' | 'pdf' | 'text';
}

// ===================== 核心函数 =====================

/**
 * 加载技能目录下 references/ 子目录中的参考文档。
 *
 * @param skillDir - 技能目录绝对路径
 * @param maxSize - 单文件最大大小（字节），默认 1MB
 * @returns 加载的参考文档列表
 */
export function loadReferences(skillDir: string, maxSize = 1_048_576): LoadedReference[] {
  const refDir = path.join(skillDir, 'references');
  if (!fs.existsSync(refDir)) return [];

  const results: LoadedReference[] = [];

  try {
    const entries = fs.readdirSync(refDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      // 跳过隐藏文件
      if (entry.name.startsWith('.')) continue;

      const filePath = path.join(refDir, entry.name);
      const stat = fs.statSync(filePath);
      if (stat.size > maxSize) continue;

      const ext = path.extname(entry.name).toLowerCase();
      let type: LoadedReference['type'] = 'text';
      if (['.md', '.markdown'].includes(ext)) {
        type = 'markdown';
      } else if (ext === '.pdf') {
        type = 'pdf';
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const firstLine = content.split('\n')[0]?.replace(/^#+\s*/, '') || entry.name;

        results.push({
          filename: entry.name,
          summary: firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine,
          content,
          type,
        });
      } catch {
        // 无法读取（如二进制 PDF），仍记录但不含内容
        results.push({
          filename: entry.name,
          summary: entry.name,
          content: '',
          type,
        });
      }
    }
  } catch {
    // 目录读取失败
  }

  return results;
}
