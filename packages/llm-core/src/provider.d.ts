import EventEmitter from 'eventemitter3';
import type { LlmUsage } from './streaming';
export type ProviderType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';
export interface ProviderAuthContext {
    apiKey?: string;
    baseUrl?: string;
    organization?: string;
    extraHeaders?: Record<string, string>;
    extraParams?: Record<string, unknown>;
}
export interface ProviderAuthResult {
    success: boolean;
    token?: string;
    expiresAt?: number;
    error?: string;
}
export interface ProviderModel {
    id: string;
    name: string;
    kind: ProviderType;
    capabilities: string[];
    contextWindow?: number;
}
export interface LlmProvider {
    type: 'llm';
    id: string;
    name: string;
    models: ProviderModel[];
    complete(model: string, messages: Array<{
        role: string;
        content: string;
    }>, options?: ProviderAuthContext & Record<string, unknown>): Promise<{
        content: string;
        usage?: LlmUsage;
    }>;
    stream(model: string, messages: Array<{
        role: string;
        content: string;
    }>, options?: ProviderAuthContext & Record<string, unknown>): AsyncGenerator<{
        type: 'token' | 'start' | 'finish' | 'error';
        content?: string;
        usage?: LlmUsage;
        error?: string;
    }>;
    authenticate?(context: ProviderAuthContext): Promise<ProviderAuthResult>;
    validateAuth?(): Promise<boolean>;
    listModels?(): Promise<ProviderModel[]>;
}
export interface ProviderRegistryEvents {
    provider_registered: [provider: LlmProvider];
    provider_unregistered: [providerId: string];
    provider_error: [providerId: string, error: Error];
}
export declare class ProviderRegistry extends EventEmitter<ProviderRegistryEvents> {
    private providers;
    registerProvider(provider: LlmProvider): void;
    unregisterProvider(providerId: string): boolean;
    getProvider(providerId: string): LlmProvider | undefined;
    listProviders(): LlmProvider[];
    hasProvider(providerId: string): boolean;
    findProviderForModel(modelId: string): LlmProvider | undefined;
    listAllModels(): ProviderModel[];
    clear(): void;
    size(): number;
}
export declare const providerRegistry: ProviderRegistry;
//# sourceMappingURL=provider.d.ts.map