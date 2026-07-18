/**
 * 构造 provider 负载时使用的小型 API-family 谓词。
 *
 * 这里定义的集合编码的是传输层兼容性，而非 provider 身份。
 */
const GPT_PARALLEL_TOOL_CALLS_APIS = new Set([
  "openai-completions",
  "openai-responses",
  "openai-chatgpt-responses",
  "azure-openai-responses",
]);

/** 判断某个 provider API 是否接受 GPT parallel-tool-call 负载设置。 */
export function supportsGptParallelToolCallsPayload(api: unknown): boolean {
  return typeof api === "string" && GPT_PARALLEL_TOOL_CALLS_APIS.has(api);
}
