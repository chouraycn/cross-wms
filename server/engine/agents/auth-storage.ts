/**
 * 移植自 openclaw/src/agents/sessions/auth-storage.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type ApiKeyCredential = unknown;
export type OAuthCredential = unknown;
export type AuthCredential = unknown;
export type AuthStorageData = unknown;
export type AuthStatus = unknown;
export type AuthStorageBackend = unknown;
export class FileAuthStorageBackend {
  constructor(..._args: unknown[]) { throw new Error("FileAuthStorageBackend not implemented (openclaw stub)"); }
}
export class InMemoryAuthStorageBackend {
  constructor(..._args: unknown[]) { throw new Error("InMemoryAuthStorageBackend not implemented (openclaw stub)"); }
}
export class AuthStorage {
  constructor(..._args: unknown[]) { throw new Error("AuthStorage not implemented (openclaw stub)"); }
}
