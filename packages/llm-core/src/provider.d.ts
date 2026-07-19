import EventEmitter from 'eventemitter3';
import type { LlmUsage } from './streaming';
export type ProviderType = 'llm' | 'embedding' | 'tts' | 'stt' | 'image' | 'video';
/**
 * Provider 配置信息
 */
export interface ProviderConfig {
    /** Provider ID */
    id: string;
    /** Provider 显示名称 */
    name: string;
    /** API 基础 URL */
    baseUrl: string;
    /** 环境变量中的 API Key 名称 */
    apiKeyEnv: string;
    /** 支持的能力 */
    capabilities: string[];
    /** Provider 特殊参数 */
    extraParams?: Record<string, unknown>;
}
/**
 * 国内模型 Provider 配置
 */
export declare const CHINESE_PROVIDERS: Record<string, ProviderConfig>;
/**
 * 从模型 ID 前缀推断 Provider
 */
export declare function detectProviderByModelId(modelId: string): ProviderConfig | null;
/**
 * 从 API Endpoint 域名推断 Provider
 */
export declare function detectProviderByEndpoint(endpoint: string): ProviderConfig | null;
/**
 * 综合检测 Provider
 */
export declare function detectProvider(modelId: string, endpoint?: string): ProviderConfig | null;
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