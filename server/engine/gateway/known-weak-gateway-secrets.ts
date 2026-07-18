// Gateway 已知弱凭据守卫。
// 在 gateway 启动前拒绝已发布的占位 auth 值。
// 移植自 openclaw/src/gateway/known-weak-gateway-secrets.ts。
// 依赖调整：./auth.js 的 ResolvedGatewayAuth → 本地 _openclaw-stubs.ts（目标 auth.ts 未导出此类型）。
import type { ResolvedGatewayAuth } from "./_openclaw-stubs.js";

export const KNOWN_WEAK_GATEWAY_TOKEN_PLACEHOLDERS = [
  "change-me-to-a-long-random-token",
  "change-me-now",
] as const;

export const KNOWN_WEAK_GATEWAY_PASSWORD_PLACEHOLDERS = ["change-me-to-a-strong-password"] as const;

/**
 * 曾在 `.env.example` 中发布或被 onboarding 文档作为复制示例的占位凭据。
 * 一旦其中任意一个成为已解析的 gateway 凭据，就拒绝它。运维几乎肯定是逐字复制了
 * 示例文件而未替换哨兵值，否则 gateway 将被一个公开已知的凭据保护。
 */
const KNOWN_WEAK_GATEWAY_TOKENS: ReadonlySet<string> = new Set(
  KNOWN_WEAK_GATEWAY_TOKEN_PLACEHOLDERS,
);

const KNOWN_WEAK_GATEWAY_PASSWORDS: ReadonlySet<string> = new Set(
  KNOWN_WEAK_GATEWAY_PASSWORD_PLACEHOLDERS,
);

export function assertGatewayAuthNotKnownWeak(auth: ResolvedGatewayAuth): void {
  if (auth.mode === "token") {
    // token/password 检查保持分离，因为 auth 模式互斥且错误文本应点名运维必须轮换的凭据。
    const token = auth.token?.trim() ?? "";
    if (token && KNOWN_WEAK_GATEWAY_TOKENS.has(token)) {
      throw new Error(
        "Invalid config: gateway auth token is set to a published example placeholder " +
          "from docs or .env.example. Generate a real secret (e.g. `openssl rand -hex 32`) " +
          "and set OPENCLAW_GATEWAY_TOKEN or gateway.auth.token before starting " +
          "the gateway.",
      );
    }
    return;
  }
  if (auth.mode === "password") {
    const password = auth.password?.trim() ?? "";
    if (password && KNOWN_WEAK_GATEWAY_PASSWORDS.has(password)) {
      throw new Error(
        "Invalid config: gateway auth password is set to the example placeholder " +
          "from .env.example. Choose a real password and set OPENCLAW_GATEWAY_PASSWORD " +
          "or gateway.auth.password before starting the gateway.",
      );
    }
  }
}
