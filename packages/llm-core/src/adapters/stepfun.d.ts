/**
 * 阶跃星辰 StepFun 适配器
 * 处理 Step 模型特有的请求和响应格式
 */
/**
 * StepFun 请求参数
 */
export interface StepFunRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string | Array<unknown>;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    /** Top-K 采样参数 */
    top_k?: number;
    /** 重复惩罚 */
    repetition_penalty?: number;
}
/**
 * StepFun 响应
 */
export interface StepFunResponse {
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
 * 转换请求为 StepFun 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    topK?: number;
    repetitionPenalty?: number;
}): StepFunRequest;
/**
 * 解析 StepFun 响应
 */
export declare function transformResponse(response: StepFunResponse): {
    content: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};
/**
 * 检测是否为多模态模型
 */
export declare function isVisionModel(modelId: string): boolean;
//# sourceMappingURL=stepfun.d.ts.map