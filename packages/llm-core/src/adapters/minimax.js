/**
 * MiniMax 适配器
 * 处理 MiniMax 模型特有的请求和响应格式
 */
/**
 * 转换请求为 MiniMax 格式
 */
export function transformRequest(baseRequest, options) {
    const request = {
        model: baseRequest.model,
        messages: baseRequest.messages,
        temperature: baseRequest.temperature,
        max_tokens: baseRequest.maxTokens,
        stream: baseRequest.stream,
    };
    // MiniMax 特有参数：group_id（必需）
    if (options?.groupId) {
        request.group_id = options.groupId;
    }
    if (options?.requestId) {
        request.request_id = options.requestId;
    }
    if (options?.tools) {
        request.tools = options.tools;
    }
    return request;
}
/**
 * 解析 MiniMax 响应
 */
export function transformResponse(response) {
    // 检查响应状态
    if (response.base_resp && response.base_resp.status_code !== 0) {
        throw new Error(`MiniMax API 错误: ${response.base_resp.status_msg}`);
    }
    const choice = response.choices[0];
    if (!choice) {
        throw new Error('MiniMax 响应中没有找到选择项');
    }
    // 工具调用处理
    const toolCalls = choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
    }));
    return {
        content: choice.message.content,
        toolCalls,
        usage: {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
        },
    };
}
/**
 * 构建 MiniMax API URL
 * MiniMax 需要在 URL 中包含 group_id
 */
export function buildApiUrl(baseUrl, groupId) {
    if (groupId) {
        return `${baseUrl}/text/chat?GroupId=${groupId}`;
    }
    return `${baseUrl}/text/chat`;
}
//# sourceMappingURL=minimax.js.map