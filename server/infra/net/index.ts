/**
 * Network Infrastructure — 网络基础设施模块
 *
 * 提供 SSRF 防护、安全 fetch 等网络安全相关功能。
 *
 * 模块结构：
 * - ssrf.ts        SSRF 策略核心（IP 检测、DNS 解析、策略管理）
 * - fetch-guard.ts 带 SSRF 防护的 fetch 封装
 *
 * 使用示例：
 *   import { isPrivateIP, fetchWithSsrFGuard } from '../infra/net/index.js';
 */

// SSRF 核心
export {
  type SsrfPolicy,
  type SsrfCheckResult,
  type DnsResolutionResult,
  SsrfBlockedError,
  DEFAULT_SSRF_POLICY,
  isPrivateIP,
  resolveHostname,
  isHostnameAllowed,
  checkSsrf,
  ssrfPolicyFromHttpBaseUrl,
} from './ssrf.js';

// Fetch 防护
export {
  type GuardedFetchOptions,
  type GuardedFetchResult,
  type GuardedFetchMode,
  fetchWithSsrFGuard,
  withStrictGuardedFetchMode,
  withTrustedEnvProxyGuardedFetchMode,
  withSelfHostedGuardedFetchMode,
} from './fetch-guard.js';
