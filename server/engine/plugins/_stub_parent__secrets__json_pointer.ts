// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/secrets/json-pointer.ts (line 19-21)
// Status: 已移植 openclaw 同源实现（RFC 6901 编码）
// Used by: server/engine/plugins/provider-auth-ref.ts
// 注：原本是纯类型占位 stub，现已替换为 openclaw encodeJsonPointerToken 的真实实现

/**
 * Encodes one JSON Pointer path token using RFC 6901 escaping.
 * Reference: https://datatracker.ietf.org/doc/html/rfc6901
 */
export function encodeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}
