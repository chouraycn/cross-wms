import { MarkdownMessage } from './markdown-message.js';
import type { MarkdownTheme } from '../theme/theme.js';
import { extractUrls, addOsc8Hyperlinks } from '../osc8-hyperlinks.js';

export class HyperlinkMarkdown {
  private markdownMessage: MarkdownMessage;
  private urls: string[];

  constructor(text: string, theme: MarkdownTheme) {
    this.markdownMessage = new MarkdownMessage(text, theme);
    this.urls = extractUrls(text);
  }

  setText(text: string): void {
    this.markdownMessage.setText(text);
    this.urls = extractUrls(text);
  }

  render(width: number): string[] {
    const lines = this.markdownMessage.render(width);
    if (this.urls.length === 0) {
      return lines;
    }
    return addOsc8Hyperlinks(lines, this.urls);
  }

  getUrls(): string[] {
    return [...this.urls];
  }

  getText(): string {
    return this.markdownMessage.getText();
  }
}
