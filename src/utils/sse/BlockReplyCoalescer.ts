/**
 * Block Reply Coalescer — 完全复制 OpenClaw 的设计
 *
 * 将多个小的流式片段合并为更少的输出块，减少渲染次数。
 * 特点：
 * - minChars: 达到最小字符数后才开始计时
 * - maxChars: 达到最大字符数立即刷新
 * - idleMs: 空闲时间后刷新
 * - isReasoning: 思考标记，思考和正文不能合并
 */

export interface CoalescerConfig {
  minChars: number;
  maxChars: number;
  idleMs: number;
}

export class BlockReplyCoalescer {
  private bufferText = '';
  private bufferIsReasoning = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;
  private firstChunk = true;

  constructor(
    private config: CoalescerConfig,
    private onFlush: (text: string, isReasoning: boolean) => void,
  ) {}

  enqueue(text: string, isReasoning: boolean): void {
    if (this.aborted) return;
    if (!text) return;

    if (this.firstChunk) {
      this.firstChunk = false;
      this.bufferIsReasoning = isReasoning;
    }

    if (isReasoning !== this.bufferIsReasoning) {
      this.flush({ force: true });
      this.bufferIsReasoning = isReasoning;
    }

    this.bufferText += text;

    if (this.bufferText.length >= this.config.maxChars) {
      this.flush({ force: true });
      return;
    }

    this.scheduleIdleFlush();
  }

  private scheduleIdleFlush(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.bufferText.length < this.config.minChars) {
      this.idleTimer = setTimeout(() => {
        this.flush({ force: false });
      }, this.config.idleMs * 1.5);
    } else {
      this.idleTimer = setTimeout(() => {
        this.flush({ force: false });
      }, this.config.idleMs);
    }
  }

  flush(options?: { force?: boolean }): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.aborted) {
      this.bufferText = '';
      return;
    }

    if (!this.bufferText) {
      return;
    }

    if (!options?.force && this.bufferText.length < this.config.minChars) {
      this.scheduleIdleFlush();
      return;
    }

    const text = this.bufferText;
    const isReasoning = this.bufferIsReasoning;
    this.bufferText = '';

    this.onFlush(text, isReasoning);
  }

  hasBuffered(): boolean {
    return this.bufferText.length > 0;
  }

  stop(): void {
    this.aborted = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.bufferText = '';
  }

  dispose(): void {
    this.flush({ force: true });
    this.stop();
  }
}
