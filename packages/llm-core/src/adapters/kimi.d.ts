/**
 * Moonshot Kimi 适配器
 * 处理 Kimi 特有的请求和响应格式
 */
/**
 * Kimi 请求参数
 */
export interface KimiRequest {
    model: string;
    messages: Array<{
        role: string;
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    /** 关联的文件 ID */
    file_ids?: string[];
}
/**
 * Kimi 响应
 */
export interface KimiResponse {
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
    /** Kimi 特有的 usage 字段名 */
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
/**
 * 文件上传响应
 */
export interface KimiFileUploadResponse {
    id: string;
    object: string;
    bytes: number;
    created_at: number;
    filename: string;
    purpose: string;
}
/**
 * 转换请求为 Kimi 格式
 */
export declare function transformRequest(baseRequest: Record<string, unknown>, options?: {
    fileIds?: string[];
}): KimiRequest;
/**
 * 解析 Kimi 响应
 */
export declare function transformResponse(response: KimiResponse): {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};
/**
 * 构建 Kimi 文件上传 URL
 */
export declare function getFileUploadUrl(baseUrl: string): string;
//# sourceMappingURL=kimi.d.ts.map