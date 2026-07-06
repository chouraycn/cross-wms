import { UsageTracker, type LlmUsage } from './streaming';

export interface CostEstimation {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  currency: string;
  model: string;
}

export class CostEstimator {
  private pricing: Map<string, { input: number; output: number; currency: string }> = new Map();
  private tracker: UsageTracker = new UsageTracker();

  setPricing(modelId: string, inputPerToken: number, outputPerToken: number, currency = 'USD'): void {
    this.pricing.set(modelId, { input: inputPerToken, output: outputPerToken, currency });
  }

  removePricing(modelId: string): boolean {
    return this.pricing.delete(modelId);
  }

  getPricing(modelId: string): { input: number; output: number; currency: string } | undefined {
    return this.pricing.get(modelId);
  }

  estimate(modelId: string, inputTokens: number, outputTokens: number): CostEstimation | null {
    const pricing = this.pricing.get(modelId);
    if (!pricing) return null;

    const totalCost = inputTokens * pricing.input + outputTokens * pricing.output;

    return {
      inputTokens,
      outputTokens,
      totalCost,
      currency: pricing.currency,
      model: modelId,
    };
  }

  trackUsage(modelId: string, usage: LlmUsage): CostEstimation | null {
    this.tracker.addUsage(usage);
    return this.estimate(modelId, usage.promptTokens, usage.completionTokens);
  }

  getTotalUsage(): LlmUsage {
    return this.tracker.getTotal();
  }

  getTotalCost(): number {
    let total = 0;
    const usage = this.tracker.getTotal();

    for (const pricing of this.pricing.values()) {
      total += usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
    }

    return total;
  }

  reset(): void {
    this.tracker.reset();
  }

  formatCost(cost: number, currency = 'USD'): string {
    if (cost < 0.01) {
      return `$${(cost * 1000000).toFixed(2)} / 1M tokens`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 4,
    }).format(cost);
  }
}

export const costEstimator = new CostEstimator();
