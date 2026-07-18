/** Provider OpenAI ChatGPT OAuth TLS. 移植自 openclaw/src/plugins/provider-openai-chatgpt-oauth-tls.ts。
 * 降级策略：返回默认值。 */
export type OpenAIOAuthTlsPreflightResult =
  | { ok: true }
  | { ok: false; reason: string; fixHint?: string };
export function shouldRunOpenAIOAuthTlsPrerequisites(params: unknown): boolean {
  void params;
  return false;
}
export async function runOpenAIOAuthTlsPreflight(options?: unknown): Promise<OpenAIOAuthTlsPreflightResult> {
  void options;
  return { ok: true };
}
export function formatOpenAIOAuthTlsPreflightFix(params: unknown): string | undefined {
  void params;
  return undefined;
}
export async function noteOpenAIOAuthTlsPrerequisites(params: unknown): Promise<void> {
  void params;
}
