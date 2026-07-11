/**
 * SSE 流解析器 — 逐行解析，处理跨 chunk 边界
 *
 * 完全复制 OpenClaw 的 robust 解析器设计。
 *
 * 功能：
 * - 缓冲跨 chunk 的不完整行
 * - 处理 `event:` / `data:` / `data: ` / 注释行（`:`开头）
 * - 多行 `data:` 用 `\n` 连接
 * - 自动 JSON 解析（失败则保留原始字符串）
 * - 空行触发事件分发
 */

export interface SSEEvent {
  event?: string;
  data: unknown;
}

export class SSEStreamParser {
  private buffer = '';
  private currentEvent: { event?: string; data: string[] } = { data: [] };

  feed(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];

    let lineEnd = this.buffer.indexOf('\n');
    while (lineEnd !== -1) {
      const line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 1);

      const result = this.processLine(line);
      if (result) {
        events.push(result);
      }

      lineEnd = this.buffer.indexOf('\n');
    }

    return events;
  }

  private processLine(line: string): SSEEvent | null {
    if (line === '') {
      if (this.currentEvent.data.length > 0 || this.currentEvent.event) {
        const event = this.buildEvent();
        this.currentEvent = { data: [] };
        return event;
      }
      return null;
    }

    if (line.startsWith(':')) {
      return null;
    }

    if (line.startsWith('event: ')) {
      this.currentEvent.event = line.slice(7);
      return null;
    }

    if (line.startsWith('data: ')) {
      this.currentEvent.data.push(line.slice(6));
      return null;
    }

    if (line.startsWith('data:')) {
      this.currentEvent.data.push(line.slice(5));
      return null;
    }

    return null;
  }

  private buildEvent(): SSEEvent {
    const dataStr = this.currentEvent.data.join('\n');
    let parsed: unknown = dataStr;

    try {
      parsed = JSON.parse(dataStr);
    } catch {
      // 不是 JSON，保留原始字符串
    }

    return {
      event: this.currentEvent.event,
      data: parsed,
    };
  }

  reset(): void {
    this.buffer = '';
    this.currentEvent = { data: [] };
  }
}
