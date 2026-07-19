/**
 * 阿里云通义千问适配器
 * 处理 Qwen 特有的请求和响应格式
 */
/**
 * Qwen 请求参数
 */
export interface QwenRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string | Array<unknown>;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    /** 是否启用搜索增强 */
    enable_search?: boolean;
    /** 搜索结果数 */
    search_max_results?: number;
    /** 流式输出增量模式 */
    incremental_output?: boolean;
}
/**
 * Qwen 响应
 */
export interface QwenResponse {
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
 * 转换请求为 Qwen 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    enableSearch?: boolean;
    searchMaxResults?: number;
}): QwenRequest;
/**
 * 解析 Qwen 响应
 */
export declare function transformResponse(response: QwenResponse): {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};
/**
 * 检测是否需要搜索增强
 */
export declare function shouldEnableSearch(modelId: string): boolean;
//# sourceMappingURL=alibaba.d.ts.map