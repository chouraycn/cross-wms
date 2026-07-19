/**
 * Moonshot Kimi 适配器
 * 处理 Kimi 特有的请求和响应格式
 */
/**
 * 转换请求为 Kimi 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // 文件上传支持
    if (options?.fileIds && options.fileIds.length > 0) {
        request.file_ids = options.fileIds;
    }
    return request;
}
/**
 * 解析 Kimi 响应
 */
export function transformResponse(response) {
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('Kimi 响应中没有找到选择项');
    }
    // Kimi 的 usage 字段可能不存在（在流式模式下）
    const usage = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
        }
        : undefined;
    return {
        content: choice.message.content,
        usage,
    };
}
/**
 * 构建 Kimi 文件上传 URL
 */
export function getFileUploadUrl(baseUrl) {
    return `${baseUrl}/files`;
}
//# sourceMappingURL=kimi.js.map