/**
 * 字节豆包适配器
 * 处理 Doubao 特有的请求和响应格式
 */
/**
 * Doubao 请求参数
 */
export interface DoubaoRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}
/**
 * Doubao 响应
 */
export interface DoubaoResponse {
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
 * 转换请求为 Doubao 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    endpointId?: string;
}): DoubaoRequest;
/**
 * 解析 Doubao 响应
 */
export declare function transformResponse(response: DoubaoResponse): {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};
/**
 * 构建 Doubao 认证 header
 * 字节云需要使用特定的鉴权方式
 */
export declare function buildAuthHeader(apiKey: string): Record<string, string>;
/**
 * 构建 Doubao API URL
 * 豆包需要 endpoint ID
 */
export declare function buildApiUrl(baseUrl: string, endpointId?: string): string;
//# sourceMappingURL=doubao.d.ts.map