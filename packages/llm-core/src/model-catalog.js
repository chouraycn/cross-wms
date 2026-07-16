import EventEmitter from 'eventemitter3';
export class UnifiedModelCatalog extends EventEmitter {
    models = new Map();
    sources = new Map();
    addSource(source) {
        this.sources.set(source.id, source);
        for (const model of source.models) {
            if (!this.models.has(model.id)) {
                this.models.set(model.id, model);
                this.emit('model_added', model);
            }
        }
        this.emit('source_added', source);
        this.emit('catalog_updated');
    }
    removeSource(sourceId) {
        const source = this.sources.get(sourceId);
        if (!source)
            return false;
        for (const model of source.models) {
            this.models.delete(model.id);
            this.emit('model_removed', model.id);
        }
        this.sources.delete(sourceId);
        this.emit('source_removed', sourceId);
        this.emit('catalog_updated');
        return true;
    }
    addModel(model) {
        this.models.set(model.id, model);
        this.emit('model_added', model);
        this.emit('catalog_updated');
    }
    removeModel(modelId) {
        const existed = this.models.delete(modelId);
        if (existed) {
            this.emit('model_removed', modelId);
            this.emit('catalog_updated');
        }
        return existed;
    }
    getModel(modelId) {
        return this.models.get(modelId);
    }
    listModels(options = {}) {
        let results = Array.from(this.models.values());
        if (options.kind) {
            results = results.filter((m) => m.kind === options.kind);
        }
        if (options.provider) {
            results = results.filter((m) => m.provider === options.provider);
        }
        if (options.capabilities && options.capabilities.length > 0) {
            results = results.filter((m) => options.capabilities.every((cap) => m.capabilities.includes(cap)));
        }
        if (options.minContextWindow) {
            results = results.filter((m) => m.contextWindow.maxTokens >= options.minContextWindow);
        }
        if (options.deprecated !== undefined) {
            results = results.filter((m) => m.deprecated === options.deprecated);
        }
        if (options.search) {
            const q = options.search.toLowerCase();
            results = results.filter((m) => m.name.toLowerCase().includes(q) ||
                m.id.toLowerCase().includes(q) ||
                m.provider.toLowerCase().includes(q) ||
                (m.description && m.description.toLowerCase().includes(q)));
        }
        if (options.tags && options.tags.length > 0) {
            results = results.filter((m) => options.tags.some((tag) => m.tags?.includes(tag)));
        }
        return results;
    }
    listProviders() {
        const providers = new Set();
        for (const model of this.models.values()) {
            providers.add(model.provider);
        }
        return Array.from(providers).sort();
    }
    listTags() {
        const tags = new Set();
        for (const model of this.models.values()) {
            if (model.tags) {
                for (const tag of model.tags) {
                    tags.add(tag);
                }
            }
        }
        return Array.from(tags).sort();
    }
    sortModels(models, by) {
        const sorted = [...models];
        switch (by) {
            case 'name':
                sorted.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'context_window':
                sorted.sort((a, b) => b.contextWindow.maxTokens - a.contextWindow.maxTokens);
                break;
            case 'price_input':
                sorted.sort((a, b) => (a.pricing.inputPerToken ?? Infinity) - (b.pricing.inputPerToken ?? Infinity));
                break;
            case 'price_output':
                sorted.sort((a, b) => (a.pricing.outputPerToken ?? Infinity) - (b.pricing.outputPerToken ?? Infinity));
                break;
            case 'provider':
                sorted.sort((a, b) => a.provider.localeCompare(b.provider));
                break;
        }
        return sorted;
    }
    estimateCost(modelId, inputTokens, outputTokens) {
        const model = this.models.get(modelId);
        if (!model)
            return null;
        const inputCost = (model.pricing.inputPerToken ?? 0) * inputTokens;
        const outputCost = (model.pricing.outputPerToken ?? 0) * outputTokens;
        return inputCost + outputCost;
    }
    hasModel(modelId) {
        return this.models.has(modelId);
    }
    size() {
        return this.models.size;
    }
    clear() {
        this.models.clear();
        this.sources.clear();
        this.emit('catalog_updated');
    }
    export() {
        return {
            id: 'exported',
            name: 'Exported Catalog',
            models: Array.from(this.models.values()),
            lastUpdated: Date.now(),
        };
    }
}
export const unifiedModelCatalog = new UnifiedModelCatalog();
//# sourceMappingURL=model-catalog.js.map