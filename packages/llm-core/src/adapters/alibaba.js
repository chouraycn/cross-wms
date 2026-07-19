/**
 * 阿里云通义千问适配器
 * 处理 Qwen 特有的请求和响应格式
 */
/**
 * 转换请求为 Qwen 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // 搜索增强支持
    if (options?.enableSearch || baseRequest.enableSearch) {
        request.enable_search = true;
        if (options?.searchMaxResults) {
            request.search_max_results = options.searchMaxResults;
        }
    }
    // 流式输出增量模式
    if (request.stream) {
        request.incremental_output = true;
    }
    return request;
}
/**
 * 解析 Qwen 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('Qwen 响应中没有找到选择项');
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
 * 检测是否需要搜索增强
 */
export function shouldEnableSearch(modelId) {
    // qwen-max 和 qwen-plus 默认支持搜索增强
    return modelId.includes('qwen-max') || modelId.includes('qwen-plus');
}
//# sourceMappingURL=alibaba.js.map