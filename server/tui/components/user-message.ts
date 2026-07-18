import type { TUIMessage } from '../types.js';
import type { MarkdownTheme } from '../theme/theme.js';
import { theme } from '../theme/theme.js';
import { HyperlinkMarkdown } from './hyperlink-markdown.js';
import { formatTimestamp, wordWrap } from '../tui-formatters.js';

export interface UserMessageOptions {
  message: TUIMessage;
  theme: MarkdownTheme;
  width: number;
}

export function renderUserMessage(options: UserMessageOptions): string[] {
  const { message, theme: mdTheme, width } = options;
  const result: string[] = [];

  const header = renderUserHeader(message, width);
  result.push(...header);

  const content = message.content;
  const md = new HyperlinkMarkdown(content, mdTheme);
  const contentLines = md.render(width - 4);
  for (const line of contentLines) {
    result.push('  ' + line);
  }

  result.push('');
  return result;
}

function renderUserHeader(message: TUIMessage, width: number): string[] {
  const time = formatTimestamp(message.timestamp);
  const label = 'You';
  const header = theme.bold(theme.userText(label)) + ' ' + theme.dim(time);
  return [header];
}

export class UserMessageComponent {
  private message: TUIMessage;
  private mdTheme: MarkdownTheme;

  constructor(message: TUIMessage, mdTheme: MarkdownTheme) {
    this.message = message;
    this.mdTheme = mdTheme;
  }

  setMessage(message: TUIMessage): void {
    this.message = message;
  }

  render(width: number): string[] {
    return renderUserMessage({
      message: this.message,
      theme: this.mdTheme,
      width,
    });
  }
}
