// Anthropic Foundry Bearer 认证检测与脱敏
type AnthropicAuthModel = {
  provider?: string;
  authHeader?: boolean;
  headers?: Record<string, string>;
};

/** 检测模型是否使用 Microsoft Foundry 的 Bearer 认证 */
export function usesFoundryBearerAuth(model: AnthropicAuthModel): boolean {
  return (
    model.provider === "microsoft-foundry" &&
    (model.authHeader === true || hasBearerAuthorizationHeader(model.headers))
  );
}

function hasBearerAuthorizationHeader(headers?: Record<string, string>): boolean {
  if (!headers) {
    return false;
  }
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === "authorization" && /^bearer\s+\S+/i.test(value.trim()),
  );
}

/** 剥除 Foundry Bearer 凭证头，返回剩余头（无剩余则返回 undefined） */
export function omitFoundryBearerCredentialHeaders(
  headers?: Record<string, string>,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "authorization" || lower === "x-api-key" || lower === "api-key") {
      continue;
    }
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}
