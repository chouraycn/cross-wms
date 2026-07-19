/**
 * 阶跃星辰 StepFun 适配器
 * 处理 Step 模型特有的请求和响应格式
 */
/**
 * 转换请求为 StepFun 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // Step 模型特有参数
    if (options?.topK !== undefined) {
        request.top_k = options.topK;
    }
    if (options?.repetitionPenalty !== undefined) {
        request.repetition_penalty = options.repetitionPenalty;
    }
    return request;
}
/**
 * 解析 StepFun 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('StepFun 响应中没有找到选择项');
    }
    return {
        content: choice.message.content,
        usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
        },
    };
}
/**
 * 检测是否为多模态模型
 */
export function isVisionModel(modelId) {
    return modelId.includes('1v') || modelId.includes('vision');
}
//# sourceMappingURL=stepfun.js.map