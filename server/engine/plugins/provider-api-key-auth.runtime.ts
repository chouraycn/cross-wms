/** Provider API key auth runtime. 移植自 openclaw/src/plugins/provider-api-key-auth.runtime.ts。
 * 降级策略：空实现。 */
export const providerApiKeyAuthRuntime = {
  resolveApiKey(): string | undefined {
    return undefined;
  },
  validateApiKey(): boolean {
    return true;
  },
};
