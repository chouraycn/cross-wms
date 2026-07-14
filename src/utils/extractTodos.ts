/**
 * extractTodos — 从 AI 助手回复内容中自动提取待办事项
 *
 * 提取规则（按优先级）：
 * 1. Markdown 任务列表：`- [ ]` / `- [x]` / `* [ ]` / `1. [ ]`
 * 2. Markdown 强调行动项：以「需要」「建议」「接下来」「应该」「务必」「请」开头的列表项
 * 3. 编号行动列表：`1. ` / `2. ` 等数字编号开头，且包含动词的行
 *
 * 仅提取明确可执行的行动项，避免误识别描述性文字。
 */

export interface ExtractedTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  /** 来源：标记为自动提取 */
  source: 'auto';
}

/** 行动触发动词关键词（出现在行首或列表标记后） */
const ACTION_VERBS = [
  '需要', '建议', '接下来', '应该', '务必', '请', '必须', '可以',
  '创建', '修改', '删除', '添加', '更新', '检查', '验证', '实现',
  '修复', '重构', '优化', '配置', '运行', '执行', '部署', '测试',
  'review', 'fix', 'add', 'update', 'create', 'delete', 'check',
  'implement', 'refactor', 'optimize', 'configure', 'run', 'test',
];

/** 判断一行文本是否包含行动动词 */
function hasActionVerb(text: string): boolean {
  const lower = text.toLowerCase();
  return ACTION_VERBS.some(verb => lower.includes(verb.toLowerCase()));
}

/** 清理待办文本：去除多余标记、空白 */
function cleanTodoText(raw: string): string {
  return raw
    .replace(/^\s*\[[ xX]\]\s*/, '') // 去除 [ ] / [x] 标记
    .replace(/^\s*\d+[.)、]\s*/, '')   // 去除编号 1. / 1) / 1、
    .replace(/^\s*[-*•]\s*/, '')       // 去除列表标记
    .replace(/\*\*(.+?)\*\*/g, '$1')   // 去除加粗
    .replace(/`(.+?)`/g, '$1')         // 去除行内代码
    .trim();
}

/**
 * 从文本内容中提取待办事项
 * @param content AI 助手回复的完整文本
 * @param maxItems 最多提取数量（默认 10）
 * @returns 提取的待办列表
 */
export function extractTodos(content: string, maxItems = 10): ExtractedTodo[] {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const todos: ExtractedTodo[] = [];
  const now = Date.now();

  for (let i = 0; i < lines.length && todos.length < maxItems; i++) {
    const line = lines[i];
    if (!line) continue;

    // 规则 1：Markdown 任务列表 - [ ] / - [x] / * [ ] / 1. [ ]
    const taskMatch = line.match(/^\s*(?:[-*•]|\d+[.)、])\s+\[([ xX])\]\s+(.+)$/);
    if (taskMatch) {
      const done = taskMatch[1].toLowerCase() === 'x';
      const text = cleanTodoText(taskMatch[2]);
      if (text && text.length >= 2 && text.length <= 200) {
        todos.push({
          id: `todo_auto_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          text,
          done,
          createdAt: now + i,
          source: 'auto',
        });
      }
      continue;
    }

    // 规则 2：列表项 + 行动动词
    const listItemMatch = line.match(/^\s*(?:[-*•]|\d+[.)、])\s+(.+)$/);
    if (listItemMatch) {
      const raw = listItemMatch[1];
      // 必须以行动动词开头或包含行动动词且行较短（< 100 字符）
      const startsWithVerb = ACTION_VERBS.some(verb =>
        raw.toLowerCase().startsWith(verb.toLowerCase())
      );
      const isShortAction = raw.length < 100 && hasActionVerb(raw) && !raw.endsWith('。');

      if (startsWithVerb || isShortAction) {
        const text = cleanTodoText(raw);
        // 过滤掉明显是描述性的（以句号结尾、包含"是"、"为"等系动词开头的描述）
        if (text && text.length >= 2 && text.length <= 200) {
          // 避免重复
          if (!todos.some(t => t.text === text)) {
            todos.push({
              id: `todo_auto_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`,
              text,
              done: false,
              createdAt: now + i,
              source: 'auto',
            });
          }
        }
      }
    }
  }

  return todos;
}

/**
 * 将自动提取的待办合并到现有待办列表（去重）
 * @param existing 现有待办
 * @param extracted 新提取的待办
 * @returns 合并后的列表（新待办插入顶部）
 */
export function mergeAutoTodos(
  existing: Array<{ id: string; text: string; done: boolean; createdAt: number; source?: 'auto' | 'manual' }>,
  extracted: ExtractedTodo[],
): Array<{ id: string; text: string; done: boolean; createdAt: number; source?: 'auto' | 'manual' }> {
  const existingTexts = new Set(existing.map(t => t.text.trim()));
  const newTodos = extracted.filter(t => !existingTexts.has(t.text.trim()));
  if (newTodos.length === 0) return existing;
  return [...newTodos, ...existing];
}
