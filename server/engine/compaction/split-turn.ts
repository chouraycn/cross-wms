export const TURN_PREFIX_SUMMARIZATION_PROMPT = [
  '你正在生成一个对话轮次（Turn）开头部分的摘要。',
  '这个轮次之前的对话已经做过整体摘要，这里只需要补充当前被截断的轮次前缀信息。',
  '',
  '输出要求：',
  '1. 保留用户的初始问题或目标（Goal）',
  '2. 保留已经做出的关键决策（Key decisions）',
  '3. 保留重要的约束条件或偏好（Constraints & Preferences）',
  '4. 不要重复之前摘要中已经覆盖的内容',
  '5. 不要编造不存在的信息',
  '',
  '严格按以下 Markdown 格式输出，不要额外添加其他内容：',
  '## Turn Context (split turn)',
  '- Goal: 用户的初始问题或目标，一句话概括',
  '- Key points: 关键决策、重要约束，用分号分隔或每条独立子项',
].join('\n');

function getMessageRole(message: any): string {
  if (!message || typeof message !== 'object') return '';
  const msg = message as Record<string, any>;
  return typeof msg.role === 'string' ? msg.role : '';
}

export function isSplitTurnCut(
  messages: any[],
  cutIndex: number,
): boolean {
  if (!Array.isArray(messages) || cutIndex <= 0 || cutIndex >= messages.length) {
    return false;
  }

  const prevMsg = messages[cutIndex - 1];
  const prevRole = getMessageRole(prevMsg);

  if (prevRole === 'assistant') {
    if (prevMsg && typeof prevMsg === 'object') {
      const p = prevMsg as Record<string, any>;
      if (Array.isArray(p.tool_calls) && p.tool_calls.length > 0) {
        return true;
      }
      if (p.metadata && typeof p.metadata === 'object') {
        const meta = p.metadata as Record<string, any>;
        if (Array.isArray(meta.toolCalls) && meta.toolCalls.length > 0) {
          return true;
        }
      }
    }
  }

  if (prevRole === 'tool') {
    return true;
  }

  return false;
}

function findTurnStartIndex(
  messages: any[],
  cutIndex: number,
): number {
  let turnStart = 0;
  for (let i = cutIndex - 1; i >= 0; i--) {
    const role = getMessageRole(messages[i]);
    if (role === 'user') {
      turnStart = i;
      break;
    }
  }
  return turnStart;
}

export function extractTurnPrefixMessages(
  messages: any[],
  cutIndex: number,
  turnStartIndex?: number,
): any[] {
  if (!Array.isArray(messages) || cutIndex <= 0) {
    return [];
  }

  const startIdx = (turnStartIndex !== undefined && turnStartIndex >= 0)
    ? turnStartIndex
    : findTurnStartIndex(messages, cutIndex);

  const endIdx = Math.max(startIdx, cutIndex);
  return messages.slice(startIdx, endIdx);
}

export function appendTurnContextToSummary(
  mainSummary: string,
  turnPrefixSummary: string,
): string {
  const cleanMain = (mainSummary || '').trim();
  const cleanTurn = (turnPrefixSummary || '').trim();

  if (!cleanTurn) return cleanMain;
  if (!cleanMain) return cleanTurn;

  return `${cleanMain}\n\n${cleanTurn}`;
}
