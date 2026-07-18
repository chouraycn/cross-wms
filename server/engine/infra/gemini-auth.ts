/**
 * 共享的 Gemini 认证工具。
 *
 * 同时支持传统 API 密钥和 OAuth JSON 格式。
 */

/**
 * 解析 Gemini API 密钥并返回适当的认证头。
 *
 * OAuth 格式: `{"token": "...", "projectId": "..."}`
 *
 * @param apiKey - 传统 API 密钥字符串或 OAuth JSON
 * @returns 带有适当认证信息的 headers 对象
 */
export function parseGeminiAuth(apiKey: string): { headers: Record<string, string> } {
  // 尝试解析为 OAuth JSON 格式
  if (apiKey.startsWith("{")) {
    try {
      const parsed = JSON.parse(apiKey) as { token?: string; projectId?: string };
      if (typeof parsed.token === "string" && parsed.token) {
        return {
          headers: {
            Authorization: `Bearer ${parsed.token}`,
            "Content-Type": "application/json",
          },
        };
      }
    } catch {
      // 解析失败，回退到 API 密钥模式
    }
  }

  // 默认: 传统 API 密钥
  return {
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
  };
}
