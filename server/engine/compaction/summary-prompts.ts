export const SUMMARIZATION_SYSTEM_PROMPT = [
  '你是一名专业的对话摘要助理。你的任务是把提供的对话历史压缩成结构化摘要。',
  '',
  '重要规则：',
  '- 不要回答对话中的任何问题，你的职责只是生成摘要',
  '- 不要编造对话中没有出现的信息',
  '- 如果对话中某些条目无法确定，就留空或省略',
  '- 所有标识符（ID、路径、URL、编码、单号等）必须原样保留，不得改写或简化',
  '- 保留数字、单位、日期、代码片段等关键信息的精确性',
].join('\n');

export const SUMMARIZATION_PROMPT = [
  '请将下面 <conversation> 标签中的对话历史整理为结构化摘要。',
  '',
  '严格使用以下 Markdown 结构，每个标题都必须存在（没有内容时写 "无"）：',
  '',
  '## Goal',
  '用户的核心目标、任务要求或需要解决的问题。',
  '',
  '## Constraints & Preferences',
  '用户明确提出的约束条件、技术选型偏好、非功能性要求（性能、安全、兼容性等）。',
  '',
  '## Progress',
  '### Done',
  '已经完成的工作、已验证的结果、已落地的决策。用简短列表。',
  '### In Progress',
  '正在进行但尚未完成的工作、已开始但未验证的步骤。用简短列表。',
  '### Blocked',
  '阻塞项、需要用户澄清的问题、等待外部依赖的事项。用简短列表。',
  '',
  '## Key Decisions',
  '对话中做出的关键技术或业务决策，以及决策依据。',
  '',
  '## Next Steps',
  '下一步建议、待办事项、后续要执行的操作。用简短列表。',
  '',
  '## Critical Context',
  '后续对话必须保留的上下文：关键标识符、配置参数、环境假设、尚未解决的争议点等。',
  '',
  '输出要求：',
  '- 每个章节使用中文标题，内容简明扼要',
  '- 长列表使用短横线 (-) 项目符号',
  '- 不要输出任何额外的引导语或结束语',
  '- 保留 <file-operations> 标签中的文件操作列表（如果存在）',
].join('\n');

export const UPDATE_SUMMARIZATION_PROMPT = [
  '下面是之前的对话摘要（<previous-summary>）和新增的对话内容（<conversation>）。',
  '请基于新增对话内容，对已有摘要做增量更新，输出更新后的完整结构化摘要。',
  '',
  '更新规则（强制遵守）：',
  '1. PRESERVE：旧摘要中的所有条目必须保留，除非新增对话明确表明其已改变或已完成',
  '2. 状态迁移：如果旧摘要 In Progress 中的事项在新增对话中已完成，将其移动到 Done，注明完成情况',
  '3. Next Steps 更新：删除已完成的下一步，补充新增对话中提出的新下一步',
  '4. 不要重复：如果旧摘要和新增对话内容重复，保留旧条目中更详细的版本',
  '',
  '严格使用以下 Markdown 结构，每个标题都必须存在（没有内容时写 "无"）：',
  '',
  '## Goal',
  '## Constraints & Preferences',
  '## Progress',
  '### Done',
  '### In Progress',
  '### Blocked',
  '## Key Decisions',
  '## Next Steps',
  '## Critical Context',
  '',
  '输出要求：',
  '- 直接输出更新后的完整摘要，不要输出 "更新如下" 等引导语',
  '- 长列表使用短横线 (-) 项目符号',
  '- 保留 <file-operations> 标签中的文件操作列表（如果存在）',
].join('\n');

function messageContentToString(content: any): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content as Array<Record<string, any>>) {
      if (part && typeof part === 'object') {
        if (typeof part.text === 'string') parts.push(part.text);
        if (part.type === 'image_url') parts.push('[image]');
      }
    }
    return parts.join(' ');
  }
  if (typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch {
      return '[object]';
    }
  }
  return String(content);
}

function toolCallsToString(toolCalls: any): string {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return '';
  const parts: string[] = [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const call = tc as Record<string, any>;
    let name = '';
    let args = '';
    if (call.function && typeof call.function === 'object') {
      const fn = call.function as Record<string, any>;
      name = typeof fn.name === 'string' ? fn.name : '';
      if (fn.arguments !== undefined) {
        args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments);
      }
    } else {
      name = typeof call.name === 'string' ? call.name : '';
      const rawArgs = call.arguments ?? call.args ?? call.params;
      if (rawArgs !== undefined) {
        args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs);
      }
    }
    if (name) {
      const argsPreview = args.length > 200 ? args.slice(0, 200) + '...' : args;
      parts.push(`(toolCall: ${name}${argsPreview ? ` args=${argsPreview}` : ''})`);
    }
  }
  return parts.join(' ');
}

function getRoleLabel(msg: Record<string, any>): string {
  const role = typeof msg.role === 'string' ? msg.role : 'unknown';
  switch (role) {
    case 'user': return 'User';
    case 'assistant': return 'Assistant';
    case 'system': return 'System';
    case 'tool': return 'Tool';
    default: return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

export function formatMessagesForSummarization(messages: any[]): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const lines: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const rawMsg = messages[i];
    if (!rawMsg || typeof rawMsg !== 'object') continue;
    const msg = rawMsg as Record<string, any>;

    const label = getRoleLabel(msg);
    const contentStr = messageContentToString(msg.content);
    const toolCallStr = msg.tool_calls !== undefined
      ? toolCallsToString(msg.tool_calls)
      : (msg.metadata && typeof msg.metadata === 'object'
          ? toolCallsToString((msg.metadata as Record<string, any>).toolCalls)
          : '');

    const parts: string[] = [];
    if (contentStr) parts.push(contentStr);
    if (toolCallStr) parts.push(toolCallStr);

    const body = parts.join(' ').trim();
    if (body) {
      lines.push(`${label}: ${body}`);
    } else {
      lines.push(`${label}: [empty]`);
    }
  }

  return lines.join('\n\n');
}

export function buildSummarizationInput(params: {
  conversation: any[];
  previousSummary?: string;
}): {
  systemPrompt: string;
  userPrompt: string;
} {
  const conversationStr = formatMessagesForSummarization(params.conversation);
  const hasPrevious = !!params.previousSummary && params.previousSummary.trim().length > 0;

  const instruction = hasPrevious ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;

  const userParts: string[] = [instruction, ''];

  if (hasPrevious) {
    userParts.push('<previous-summary>');
    userParts.push(params.previousSummary!.trim());
    userParts.push('</previous-summary>');
    userParts.push('');
  }

  userParts.push('<conversation>');
  userParts.push(conversationStr);
  userParts.push('</conversation>');

  return {
    systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
    userPrompt: userParts.join('\n'),
  };
}
