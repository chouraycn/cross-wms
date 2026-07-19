/**
 * DeepSeek 适配器
 * 处理 DeepSeek 特有的请求和响应格式
 */
/**
 * 转换请求为 DeepSeek 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // 推理模式支持
    if (options?.enableReasoning || baseRequest.enableReasoning) {
        request.enable_reasoning = true;
    }
    return request;
}
/**
 * 解析 DeepSeek 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('DeepSeek 响应中没有找到选择项');
    }
    return {
        content: choice.message.content,
        reasoning: choice.message.reasoning_content,
        usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
            reasoningTokens: response.usage.reasoning_tokens,
        },
    };
}
/**
 * DeepSeek 推理模式检测
 */
export function isReasoningModel(modelId) {
    return modelId.includes('reasoner') || modelId.includes('reasoning');
}
//# sourceMappingURL=deepseek.js.map