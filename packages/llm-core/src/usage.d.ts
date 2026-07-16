import { type LlmUsage } from './streaming';
export interface CostEstimation {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
    currency: string;
    model: string;
}
export declare class CostEstimator {
    private pricing;
    private tracker;
    setPricing(modelId: string, inputPerToken: number, outputPerToken: number, currency?: string): void;
    removePricing(modelId: string): boolean;
    getPricing(modelId: string): {
        input: number;
        output: number;
        currency: string;
    } | undefined;
    estimate(modelId: string, inputTokens: number, outputTokens: number): CostEstimation | null;
    trackUsage(modelId: string, usage: LlmUsage): CostEstimation | null;
    getTotalUsage(): LlmUsage;
    getTotalCost(): number;
    reset(): void;
    formatCost(cost: number, currency?: string): string;
}
export declare const costEstimator: CostEstimator;
//# sourceMappingURL=usage.d.ts.map