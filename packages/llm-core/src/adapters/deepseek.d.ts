/**
 * DeepSeek 适配器
 * 处理 DeepSeek 特有的请求和响应格式
 */
/**
 * DeepSeek 请求参数
 */
export interface DeepSeekRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    /** 是否启用推理模式 */
    enable_reasoning?: boolean;
}
/**
 * DeepSeek 响应
 */
export interface DeepSeekResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
            /** 推理内容（仅在推理模式下） */
            reasoning_content?: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        /** 推理 token 数（仅在推理模式下） */
        reasoning_tokens?: number;
    };
}
/**
 * 转换请求为 DeepSeek 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    enableReasoning?: boolean;
}): DeepSeekRequest;
/**
 * 解析 DeepSeek 响应
 */
export declare function transformResponse(response: DeepSeekResponse): {
    content: string;
    reasoning?: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        reasoningTokens?: number;
    };
};
/**
 * DeepSeek 推理模式检测
 */
export declare function isReasoningModel(modelId: string): boolean;
//# sourceMappingURL=deepseek.d.ts.map