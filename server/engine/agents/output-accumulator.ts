/**
 * 移植自 openclaw/src/agents/sessions/tools/output-accumulator.ts
 *
 * 降级实现：提供可构造的 OutputAccumulator，不再抛出 stub 错误。
 */

export class OutputAccumulator {
  private chunks: string[] = [];

  append(text: string): void {
    this.chunks.push(text);
  }

  getOutput(): string {
    return this.chunks.join("");
  }

  reset(): void {
    this.chunks = [];
  }
}
