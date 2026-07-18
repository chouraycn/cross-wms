import type { TUIMessage } from '../types.js';
import type { MarkdownTheme } from '../theme/theme.js';
import { UserMessageComponent } from './user-message.js';
import { AssistantMessageComponent } from './assistant-message.js';
import { theme } from '../theme/theme.js';

export interface ChatLogOptions {
  messages: TUIMessage[];
  theme: MarkdownTheme;
  width: number;
  height: number;
  scrollOffset: number;
  showTools?: boolean;
  showThinking?: boolean;
}

export function renderChatLog(options: ChatLogOptions): {
  lines: string[];
  totalLines: number;
  visibleStart: number;
  visibleEnd: number;
} {
  const { messages, theme: mdTheme, width, height, scrollOffset, showTools, showThinking } =
    options;

  const allLines: string[] = [];
  const messageLineOffsets: number[] = [];

  for (const msg of messages) {
    messageLineOffsets.push(allLines.length);
    const msgLines = renderMessage(msg, mdTheme, width, showTools, showThinking);
    allLines.push(...msgLines);
  }

  const totalLines = allLines.length;
  const maxOffset = Math.max(0, totalLines - height);
  const actualOffset = Math.min(Math.max(0, scrollOffset), maxOffset);
  const visibleLines = allLines.slice(actualOffset, actualOffset + height);

  return {
    lines: visibleLines,
    totalLines,
    visibleStart: actualOffset,
    visibleEnd: Math.min(actualOffset + height, totalLines),
  };
}

function renderMessage(
  message: TUIMessage,
  mdTheme: MarkdownTheme,
  width: number,
  showTools?: boolean,
  showThinking?: boolean,
): string[] {
  switch (message.role) {
    case 'user': {
      const comp = new UserMessageComponent(message, mdTheme);
      return comp.render(width);
    }
    case 'assistant': {
      const comp = new AssistantMessageComponent(message, mdTheme, { showTools, showThinking });
      return comp.render(width);
    }
    case 'system': {
      return renderSystemMessage(message, width);
    }
    default:
      return [];
  }
}

function renderSystemMessage(message: TUIMessage, width: number): string[] {
  const lines: string[] = [];
  const contentLines = message.content.split('\n');
  for (const line of contentLines) {
    lines.push(theme.system(line));
  }
  lines.push('');
  return lines;
}

export class ChatLog {
  private messages: TUIMessage[];
  private mdTheme: MarkdownTheme;
  private scrollOffset: number = 0;
  private showTools: boolean = true;
  private showThinking: boolean = false;

  constructor(messages: TUIMessage[], mdTheme: MarkdownTheme) {
    this.messages = messages;
    this.mdTheme = mdTheme;
  }

  setMessages(messages: TUIMessage[]): void {
    this.messages = messages;
  }

  addMessage(message: TUIMessage): void {
    this.messages.push(message);
  }

  scrollUp(lines: number = 1): void {
    this.scrollOffset = Math.max(0, this.scrollOffset - lines);
  }

  scrollDown(lines: number = 1): void {
    this.scrollOffset += lines;
  }

  scrollToTop(): void {
    this.scrollOffset = 0;
  }

  scrollToBottom(): void {
    this.scrollOffset = Infinity;
  }

  setShowTools(show: boolean): void {
    this.showTools = show;
  }

  setShowThinking(show: boolean): void {
    this.showThinking = show;
  }

  render(width: number, height: number): string[] {
    const result = renderChatLog({
      messages: this.messages,
      theme: this.mdTheme,
      width,
      height,
      scrollOffset: this.scrollOffset,
      showTools: this.showTools,
      showThinking: this.showThinking,
    });
    this.scrollOffset = result.visibleStart;
    return result.lines;
  }

  getScrollOffset(): number {
    return this.scrollOffset;
  }

  getMessageCount(): number {
    return this.messages.length;
  }

  getMessages(): TUIMessage[] {
    return [...this.messages];
  }
}
