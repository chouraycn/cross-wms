import type { TUIMessage, TUIToolCall } from '../types.js';
import type { MarkdownTheme } from '../theme/theme.js';
import { theme } from '../theme/theme.js';
import { HyperlinkMarkdown } from './hyperlink-markdown.js';
import { ToolExecution } from './tool-execution.js';
import { formatTimestamp } from '../tui-formatters.js';

export interface AssistantMessageOptions {
  message: TUIMessage;
  theme: MarkdownTheme;
  width: number;
  showTools?: boolean;
  showThinking?: boolean;
}

export function renderAssistantMessage(options: AssistantMessageOptions): string[] {
  const { message, theme: mdTheme, width, showTools = true, showThinking = false } = options;
  const result: string[] = [];

  const header = renderAssistantHeader(message, width);
  result.push(...header);

  let content = message.content;
  if (showThinking && message.thinking) {
    content = `[thinking]\n${message.thinking}\n\n${content}`;
  }

  if (content) {
    const md = new HyperlinkMarkdown(content, mdTheme);
    const contentLines = md.render(width - 4);
    for (const line of contentLines) {
      result.push('  ' + line);
    }
  }

  if (showTools && message.toolCalls && message.toolCalls.length > 0) {
    result.push('');
    for (const toolCall of message.toolCalls) {
      const toolLines = renderToolCall(toolCall, width - 4);
      for (const line of toolLines) {
        result.push('  ' + line);
      }
      result.push('');
    }
  }

  if (message.status === 'streaming') {
    result.push('  ' + theme.dim('▊'));
  }

  result.push('');
  return result;
}

function renderAssistantHeader(message: TUIMessage, _width: number): string[] {
  const time = formatTimestamp(message.timestamp);
  let label = 'Assistant';
  if (message.status === 'streaming') {
    label += ' (typing...)';
  } else if (message.status === 'error') {
    label += ' (error)';
  }
  const header = theme.bold(theme.accent(label)) + ' ' + theme.dim(time);
  return [header];
}

function renderToolCall(toolCall: TUIToolCall, width: number): string[] {
  const tool = new ToolExecution(toolCall, theme);
  return tool.render(width);
}

export class AssistantMessageComponent {
  private message: TUIMessage;
  private mdTheme: MarkdownTheme;
  private showTools: boolean;
  private showThinking: boolean;

  constructor(
    message: TUIMessage,
    mdTheme: MarkdownTheme,
    options?: { showTools?: boolean; showThinking?: boolean },
  ) {
    this.message = message;
    this.mdTheme = mdTheme;
    this.showTools = options?.showTools ?? true;
    this.showThinking = options?.showThinking ?? false;
  }

  setMessage(message: TUIMessage): void {
    this.message = message;
  }

  setShowTools(show: boolean): void {
    this.showTools = show;
  }

  setShowThinking(show: boolean): void {
    this.showThinking = show;
  }

  render(width: number): string[] {
    return renderAssistantMessage({
      message: this.message,
      theme: this.mdTheme,
      width,
      showTools: this.showTools,
      showThinking: this.showThinking,
    });
  }
}
