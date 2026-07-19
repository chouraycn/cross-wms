/**
 * 零一万物 Yi 适配器
 * 处理 Yi 模型特有的请求和响应格式
 */
/**
 * 转换请求为 Yi 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // Yi 特有参数
    if (options?.topP !== undefined) {
        request.top_p = options.topP;
    }
    if (options?.frequencyPenalty !== undefined) {
        request.frequency_penalty = options.frequencyPenalty;
    }
    return request;
}
/**
 * 解析 Yi 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('Yi 响应中没有找到选择项');
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
//# sourceMappingURL=yi.js.map