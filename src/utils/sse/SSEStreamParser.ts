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
  data: any;
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

    // SSE 规范允许字段名后不带空格（`event:foo`）。此前只识别带空格的形式，
    // 会把无空格事件整行丢弃 —— 手写实现（client.ts / EmployeeChatPage）用的
    // 正则 /^event:\s*/ 两种都吃，收敛到本解析器前必须先补齐，否则是功能倒退。
    if (line.startsWith('event:')) {
      this.currentEvent.event = line.slice(6);
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

  /**
   * 冲刷缓冲区残留
   *
   * 后端若在最后一个事件后没有补空行就关闭连接（或末行缺 \n），该事件会一直
   * 卡在 buffer/currentEvent 里丢失。流结束时必须调用一次。
   */
  flush(): SSEEvent[] {
    const events: SSEEvent[] = [];
    // 处理最后一行没有换行符的情况
    if (this.buffer) {
      const line = this.buffer;
      this.buffer = '';
      const result = this.processLine(line);
      if (result) events.push(result);
    }
    if (this.currentEvent.data.length > 0 || this.currentEvent.event) {
      events.push(this.buildEvent());
      this.currentEvent = { data: [] };
    }
    return events;
  }

  private buildEvent(): SSEEvent {
    const dataStr = this.currentEvent.data.join('\n');
    let parsed: any = dataStr;

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
