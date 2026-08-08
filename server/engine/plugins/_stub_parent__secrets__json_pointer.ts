// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/secrets/json-pointer.ts
// Status: 完整移植（encode + decode + read）
// Used by: server/engine/plugins/provider-auth-ref.ts, secrets/resolve.ts
// 注：原本是纯类型占位 stub，现已替换为 openclaw 完整实现

import { parseConfigPathArrayIndex } from "../shared/path-array-index.js";

function isRecord(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function failOrUndefined(params: { onMissing: "throw" | "undefined"; message: string }): undefined {
  if (params.onMissing === "throw") {
    throw new Error(params.message);
  }
  return undefined;
}

/**
 * Encodes one JSON Pointer path token using RFC 6901 escaping.
 * Reference: https://datatracker.ietf.org/doc/html/rfc6901
 */
export function encodeJsonPointerToken(token: string): string {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Decodes one JSON Pointer path token using RFC 6901 escaping.
 */
export function decodeJsonPointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Reads a value from a JSON-like document using an absolute JSON Pointer.
 * Missing segments throw by default; `onMissing: "undefined"` is for optional probes.
 */
export function readJsonPointer(
  root: any,
  pointer: string,
  options: { onMissing?: "throw" | "undefined" } = {},
): any {
  const onMissing = options.onMissing ?? "throw";
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) {
    return failOrUndefined({
      onMissing,
      message:
        'File-backed secret ids must be absolute JSON pointers (for example: "/providers/openai/apiKey").',
    });
  }

  const tokens = pointer
    .slice(1)
    .split("/")
    .map((token) => decodeJsonPointerToken(token));

  let current: any = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      const index = parseConfigPathArrayIndex(token);
      if (index === undefined || index >= current.length) {
        return failOrUndefined({
          onMissing,
          message: `JSON pointer segment "${token}" is out of bounds.`,
        });
      }
      current = current[index];
      continue;
    }
    if (!isRecord(current)) {
      return failOrUndefined({
        onMissing,
        message: `JSON pointer segment "${token}" does not exist.`,
      });
    }
    if (!Object.hasOwn(current, token)) {
      return failOrUndefined({
        onMissing,
        message: `JSON pointer segment "${token}" does not exist.`,
      });
    }
    current = current[token];
  }
  return current;
}
