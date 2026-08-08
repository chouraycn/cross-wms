/** Provider OpenAI ChatGPT OAuth TLS. 移植自 openclaw/src/plugins/provider-openai-chatgpt-oauth-tls.ts。
 * 降级策略：返回默认值。 */
export type OpenAIOAuthTlsPreflightResult =
  | { ok: true }
  | { ok: false; reason: string; fixHint?: string };
export function shouldRunOpenAIOAuthTlsPrerequisites(params: any): boolean {
  void params;
  return false;
}
export async function runOpenAIOAuthTlsPreflight(options?: any): Promise<OpenAIOAuthTlsPreflightResult> {
  void options;
  return { ok: true };
}
export function formatOpenAIOAuthTlsPreflightFix(params: any): string | undefined {
  void params;
  return undefined;
}
export async function noteOpenAIOAuthTlsPrerequisites(params: any): Promise<void> {
  void params;
}
