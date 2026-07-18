/** Provider OAuth flow. 移植自 openclaw/src/plugins/provider-oauth-flow.ts。
 * 降级策略：返回 undefined。 */
export type OAuthPrompt = { message: string; placeholder?: string };
export function createVpsAwareOAuthHandlers(params: unknown): unknown {
  void params;
  return undefined;
}
