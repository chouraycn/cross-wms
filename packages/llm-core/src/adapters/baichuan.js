/**
 * 百川智能适配器
 * 处理 Baichuan 模型特有的请求和响应格式
 */
/**
 * 转换请求为 Baichuan 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // Baichuan 特有参数
    if (options?.topP !== undefined) {
        request.top_p = options.topP;
    }
    if (options?.topK !== undefined) {
        request.top_k = options.topK;
    }
    if (options?.withSearchEnhance) {
        request.with_search_enhance = true;
    }
    return request;
}
/**
 * 解析 Baichuan 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('Baichuan 响应中没有找到选择项');
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
 * 构建 Baichuan 认证 header
 */
export function buildAuthHeader(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
}
//# sourceMappingURL=baichuan.js.map