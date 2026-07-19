/**
 * 百川智能适配器
 * 处理 Baichuan 模型特有的请求和响应格式
 */
/**
 * Baichuan 请求参数
 */
export interface BaichuanRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    /** Top-P 采样参数 */
    top_p?: number;
    /** Top-K 采样参数 */
    top_k?: number;
    /** 是否启用搜索 */
    with_search_enhance?: boolean;
}
/**
 * Baichuan 响应
 */
export interface BaichuanResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
/**
 * 转换请求为 Baichuan 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    topP?: number;
    topK?: number;
    withSearchEnhance?: boolean;
}): BaichuanRequest;
/**
 * 解析 Baichuan 响应
 */
export declare function transformResponse(response: BaichuanResponse): {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};
/**
 * 构建 Baichuan 认证 header
 */
export declare function buildAuthHeader(apiKey: string): Record<string, string>;
//# sourceMappingURL=baichuan.d.ts.map