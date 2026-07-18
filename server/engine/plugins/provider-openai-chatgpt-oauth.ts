/** Provider OpenAI ChatGPT OAuth. 移植自 openclaw/src/plugins/provider-openai-chatgpt-oauth.ts。
 * 降级策略：抛出 not implemented。 */
export async function loginOpenAICodexOAuth(params: unknown): Promise<unknown> {
  void params;
  throw new Error("not implemented: loginOpenAICodexOAuth");
}
