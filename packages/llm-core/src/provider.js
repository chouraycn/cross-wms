import EventEmitter from 'eventemitter3';
export class ProviderRegistry extends EventEmitter {
    providers = new Map();
    registerProvider(provider) {
        if (this.providers.has(provider.id)) {
            throw new Error(`Provider ${provider.id} already registered`);
        }
        this.providers.set(provider.id, provider);
        this.emit('provider_registered', provider);
    }
    unregisterProvider(providerId) {
        const existed = this.providers.delete(providerId);
        if (existed) {
            this.emit('provider_unregistered', providerId);
        }
        return existed;
    }
    getProvider(providerId) {
        return this.providers.get(providerId);
    }
    listProviders() {
        return Array.from(this.providers.values());
    }
    hasProvider(providerId) {
        return this.providers.has(providerId);
    }
    findProviderForModel(modelId) {
        for (const provider of this.providers.values()) {
            if (provider.models.some((m) => m.id === modelId || m.name === modelId)) {
                return provider;
            }
        }
        return undefined;
    }
    listAllModels() {
        const models = [];
        for (const provider of this.providers.values()) {
            models.push(...provider.models);
        }
        return models;
    }
    clear() {
        this.providers.clear();
    }
    size() {
        return this.providers.size;
    }
}
export const providerRegistry = new ProviderRegistry();
//# sourceMappingURL=provider.js.map