/**
 * 渲染调度器 — 管理不同优先级的 UI 更新
 *
 * 正文流：高优先级 (setTimeout 16ms)
 * 思考流：低优先级 (setTimeout 50ms)
 *
 * v3.0.0: 统一用 setTimeout 渲染调度 — 彻底消除 rAF 暂停问题
 * 在 WKWebView 中，rAF 会在应用后台或某些状态下暂停，导致 UI 无法更新
 * setTimeout 不受 WKWebView rAF 暂停影响
 */

export class RenderScheduler {
  private textRafId: number | null = null;
  private thinkingRicId: number | null = null;
  private pendingText = false;
  private pendingThinking = false;

  constructor(
    private textUpdateFn: () => void,
    private thinkingUpdateFn: () => void,
  ) {}

  scheduleTextUpdate(): void {
    this.pendingText = true;
    if (this.textRafId === null) {
      this.textRafId = window.setTimeout(() => {
        this.textRafId = null;
        if (this.pendingText) {
          this.pendingText = false;
          this.textUpdateFn();
        }
      }, 16) as unknown as number;
    }
  }

  scheduleThinkingUpdate(): void {
    this.pendingThinking = true;
    if (this.thinkingRicId === null) {
      this.thinkingRicId = window.setTimeout(() => {
        this.thinkingRicId = null;
        if (this.pendingThinking) {
          this.pendingThinking = false;
          this.thinkingUpdateFn();
        }
      }, 50) as unknown as number;
    }
  }

  flushAll(): void {
    if (this.pendingText && this.textRafId !== null) {
      clearTimeout(this.textRafId);
      this.textRafId = null;
      this.pendingText = false;
      this.textUpdateFn();
    }
    if (this.pendingThinking && this.thinkingRicId !== null) {
      clearTimeout(this.thinkingRicId);
      this.thinkingRicId = null;
      this.pendingThinking = false;
      this.thinkingUpdateFn();
    }
  }

  dispose(): void {
    if (this.textRafId !== null) {
      clearTimeout(this.textRafId);
      this.textRafId = null;
    }
    if (this.thinkingRicId !== null) {
      clearTimeout(this.thinkingRicId);
      this.thinkingRicId = null;
    }
  }
}
