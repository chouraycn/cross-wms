/**
 * 字节豆包适配器
 * 处理 Doubao 特有的请求和响应格式
 */
/**
 * 转换请求为 Doubao 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    return request;
}
/**
 * 解析 Doubao 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('Doubao 响应中没有找到选择项');
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
 * 构建 Doubao 认证 header
 * 字节云需要使用特定的鉴权方式
 */
export function buildAuthHeader(apiKey) {
    return {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
}
/**
 * 构建 Doubao API URL
 * 豆包需要 endpoint ID
 */
export function buildApiUrl(baseUrl, endpointId) {
    if (endpointId) {
        return `${baseUrl}/chat/completions?endpoint_id=${endpointId}`;
    }
    return `${baseUrl}/chat/completions`;
}
//# sourceMappingURL=doubao.js.map