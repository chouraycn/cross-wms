// === PENDING MIGRATION STUB ===
// Source: openclaw/src/plugin-sdk/ssrf-policy.ts (待迁移)
// Status: 结构化类型占位 stub — 类型为 SsrFPolicy 接口
// Used by: server/engine/plugins/provider-self-hosted-setup.ts
// 注：openclaw 同源 SsrFPolicy 描述 SSRF 防护策略

export interface SsrFPolicy {
  isAllowed?: (url: string) => boolean;
  hostnameAllowlist?: string[];
  allowPrivateNetwork?: boolean;
}
