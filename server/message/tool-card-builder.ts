/**
 * CDFKnow 四层对话架构 — 工具卡片构造器
 *
 * 区分内置 Skill（绿色） / MCP 外部工具（橙色），
 * 注入 Markdown 特殊分割块，前端识别渲染独立折叠卡片。
 */

// ===================== 工具函数 =====================

/**
 * 将任意值序列化为安全的 Markdown 字符串
 */
function safeStringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ===================== 导出函数 =====================

/**
 * 构建 Skill 卡片 Markdown
 *
 * 生成格式：
 * <!-- skill:toolName -->
 * **Input:**
 * ```json
 * { ... }
 * ```
 * **Result:**
 * ```
 * ...
 * ```
 * <!-- /skill -->
 */
export function buildSkillCard(toolName: string, input: unknown, result?: unknown): string {
  const inputStr = safeStringify(input);
  const resultStr = result !== undefined ? safeStringify(result) : '';

  let body = `**Input:**\n\`\`\`json\n${inputStr}\n\`\`\`\n`;
  if (resultStr) {
    body += `**Result:**\n\`\`\`\n${resultStr}\n\`\`\`\n`;
  }

  return `<!-- skill:${toolName} -->\n${body}<!-- /skill -->\n`;
}

/**
 * 构建 MCP 卡片 Markdown
 *
 * 生成格式：
 * <!-- mcp:serverName -->
 * **Input:**
 * ```json
 * { ... }
 * ```
 * **Result:** (或 **Error:**)
 * ```
 * ...
 * ```
 * <!-- /mcp -->
 */
export function buildMCPCard(serverName: string, input: unknown, err?: string): string {
  const inputStr = safeStringify(input);

  let body = `**Input:**\n\`\`\`json\n${inputStr}\n\`\`\`\n`;
  if (err) {
    body += `**Error:**\n\`\`\`\n${err}\n\`\`\`\n`;
  }

  return `<!-- mcp:${serverName} -->\n${body}<!-- /mcp -->\n`;
}

/**
 * 从 Markdown 中提取工具卡片信息
 *
 * 解析 <!-- skill:name -->...<!-- /skill --> 和 <!-- mcp:name -->...<!-- /mcp --> 块，
 * 返回结构化的工具卡片数组。
 */
export function extractToolCards(markdown: string): Array<{
  type: 'skill' | 'mcp';
  name: string;
  input: unknown;
  result?: unknown;
  error?: string;
}> {
  const results: Array<{
    type: 'skill' | 'mcp';
    name: string;
    input: unknown;
    result?: unknown;
    error?: string;
  }> = [];

  // 匹配工具卡片容器块
  const pattern = /<!--\s*(skill|mcp):(\S+?)\s*-->\n([\s\S]*?)<!--\s*\/\1\s*-->/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) !== null) {
    const cardType = match[1] as 'skill' | 'mcp';
    const cardName = match[2];
    const body = match[3];

    // 尝试从 **Input:** 后的代码块中提取 JSON
    let input: unknown = {};
    const inputMatch = body.match(/\*\*Input:\*\*\s*\n```(?:json)?\s*\n([\s\S]*?)```/);
    if (inputMatch) {
      try {
        input = JSON.parse(inputMatch[1].trim());
      } catch {
        input = inputMatch[1].trim();
      }
    }

    // 尝试从 **Result:** 后的代码块中提取结果
    const resultMatch = body.match(/\*\*Result:\*\*\s*\n```\s*\n([\s\S]*?)```/);
    if (resultMatch) {
      try {
        results.push({ type: cardType, name: cardName, input, result: JSON.parse(resultMatch[1].trim()) });
        continue;
      } catch {
        results.push({ type: cardType, name: cardName, input, result: resultMatch[1].trim() });
        continue;
      }
    }

    // 尝试从 **Error:** 后的代码块中提取错误
    const errorMatch = body.match(/\*\*Error:\*\*\s*\n```\s*\n([\s\S]*?)```/);
    if (errorMatch) {
      results.push({ type: cardType, name: cardName, input, error: errorMatch[1].trim() });
      continue;
    }

    // 没有结果也没有错误
    results.push({ type: cardType, name: cardName, input });
  }

  return results;
}
