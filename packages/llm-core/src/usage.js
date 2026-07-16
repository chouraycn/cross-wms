import { UsageTracker } from './streaming';
export class CostEstimator {
    pricing = new Map();
    tracker = new UsageTracker();
    setPricing(modelId, inputPerToken, outputPerToken, currency = 'USD') {
        this.pricing.set(modelId, { input: inputPerToken, output: outputPerToken, currency });
    }
    removePricing(modelId) {
        return this.pricing.delete(modelId);
    }
    getPricing(modelId) {
        return this.pricing.get(modelId);
    }
    estimate(modelId, inputTokens, outputTokens) {
        const pricing = this.pricing.get(modelId);
        if (!pricing)
            return null;
        const totalCost = inputTokens * pricing.input + outputTokens * pricing.output;
        return {
            inputTokens,
            outputTokens,
            totalCost,
            currency: pricing.currency,
            model: modelId,
        };
    }
    trackUsage(modelId, usage) {
        this.tracker.addUsage(usage);
        return this.estimate(modelId, usage.promptTokens, usage.completionTokens);
    }
    getTotalUsage() {
        return this.tracker.getTotal();
    }
    getTotalCost() {
        let total = 0;
        const usage = this.tracker.getTotal();
        for (const pricing of this.pricing.values()) {
            total += usage.promptTokens * pricing.input + usage.completionTokens * pricing.output;
        }
        return total;
    }
    reset() {
        this.tracker.reset();
    }
    formatCost(cost, currency = 'USD') {
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
//# sourceMappingURL=usage.js.map