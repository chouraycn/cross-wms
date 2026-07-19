import EventEmitter from 'eventemitter3';
/**
 * 国内模型 Provider 配置
 */
export const CHINESE_PROVIDERS = {
    deepseek: {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        capabilities: ['chat', 'streaming', 'reasoning', 'tool_calls', 'json_mode'],
        extraParams: { supports_reasoning: true },
    },
    alibaba: {
        id: 'alibaba',
        name: '阿里云通义千问',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKeyEnv: 'DASHSCOPE_API_KEY',
        capabilities: ['chat', 'streaming', 'vision', 'tool_calls', 'json_mode', 'search_grounding'],
        extraParams: { supports_search: true },
    },
    kimi: {
        id: 'kimi',
        name: 'Moonshot Kimi',
        baseUrl: 'https://api.moonshot.cn/v1',
        apiKeyEnv: 'MOONSHOT_API_KEY',
        capabilities: ['chat', 'streaming', 'file_upload', 'long_context'],
    },
    stepfun: {
        id: 'stepfun',
        name: '阶跃星辰',
        baseUrl: 'https://api.stepfun.com/v1',
        apiKeyEnv: 'STEPFUN_API_KEY',
        capabilities: ['chat', 'streaming', 'vision', 'long_context'],
    },
    doubao: {
        id: 'doubao',
        name: '字节豆包',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        apiKeyEnv: 'DOUBAO_API_KEY',
        capabilities: ['chat', 'streaming', 'tool_calls'],
        extraParams: { requires_endpoint_id: true },
    },
    yi: {
        id: 'yi',
        name: '零一万物',
        baseUrl: 'https://api.lingyiwanwu.com/v1',
        apiKeyEnv: 'YI_API_KEY',
        capabilities: ['chat', 'streaming', 'long_context'],
    },
    baichuan: {
        id: 'baichuan',
        name: '百川智能',
        baseUrl: 'https://api.baichuan-ai.com/v1',
        apiKeyEnv: 'BAICHUAN_API_KEY',
        capabilities: ['chat', 'streaming', 'tool_calls'],
    },
    minimax: {
        id: 'minimax',
        name: 'MiniMax',
        baseUrl: 'https://api.minimax.chat/v1',
        apiKeyEnv: 'MINIMAX_API_KEY',
        capabilities: ['chat', 'streaming', 'tool_calls', 'vision'],
        extraParams: { group_id_required: true },
    },
};
/**
 * 从模型 ID 前缀推断 Provider
 */
export function detectProviderByModelId(modelId) {
    const prefixMap = {
        'deepseek-': 'deepseek',
        'qwen-': 'alibaba',
        'qwen2-': 'alibaba',
        'qwen2.5-': 'alibaba',
        'kimi-': 'kimi',
        'moonshot-': 'kimi',
        'step-': 'stepfun',
        'doubao-': 'doubao',
        'yi-': 'yi',
        'baichuan': 'baichuan',
        'abab': 'minimax',
    };
    const lowerModelId = modelId.toLowerCase();
    for (const [prefix, providerId] of Object.entries(prefixMap)) {
        if (lowerModelId.startsWith(prefix)) {
            return CHINESE_PROVIDERS[providerId] || null;
        }
    }
    return null;
}
/**
 * 从 API Endpoint 域名推断 Provider
 */
export function detectProviderByEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        const hostname = url.hostname.toLowerCase();
        const domainMap = {
            'deepseek.com': 'deepseek',
            'dashscope.aliyuncs.com': 'alibaba',
            'moonshot.cn': 'kimi',
            'stepfun.com': 'stepfun',
            'ark.cn-beijing.volces.com': 'doubao',
            'lingyiwanwu.com': 'yi',
            'baichuan-ai.com': 'baichuan',
            'minimax.chat': 'minimax',
        };
        for (const [domain, providerId] of Object.entries(domainMap)) {
            if (hostname.includes(domain)) {
                return CHINESE_PROVIDERS[providerId] || null;
            }
        }
    }
    catch {
        // URL 解析失败，返回 null
    }
    return null;
}
/**
 * 综合检测 Provider
 */
export function detectProvider(modelId, endpoint) {
    // 优先从 endpoint 检测
    if (endpoint) {
        const provider = detectProviderByEndpoint(endpoint);
        if (provider)
            return provider;
    }
    // 从 modelId 检测
    return detectProviderByModelId(modelId);
}
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