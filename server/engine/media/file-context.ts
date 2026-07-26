// File context helpers build user-visible context for media file references.
// Ported from openclaw/src/media/file-context.ts.
//
// Dependency adjustments:
//   - @openclaw/normalization-core/string-coerce normalizeOptionalString
//     → ./string-helpers.js (cross-wms port of the helper)
//   - ../infra/fs-safe-advanced.js sanitizeUntrustedFileName(input, fallback)
//     → cross-wms single-arg variant in ../infra/fs-safe-advanced.js. openclaw
//     accepts a fallback that is returned when the sanitized result is empty;
//     we inline that two-arg behavior here so the ported call site stays
//     semantically identical without modifying the shared infra helper.
import { normalizeOptionalString } from "./string-helpers.js";
import { sanitizeUntrustedFileName as sanitizeUntrustedFileNameSingle } from "../infra/fs-safe-advanced.js";

const XML_ESCAPE_MAP: Record<string, string> = {
  "<": "&lt;",
  ">": "&gt;",
  "&": "&amp;",
  '"': "&quot;",
  "'": "&apos;",
};

function xmlEscapeAttr(value: string): string {
  return value.replace(/[<>&"']/g, (char) => XML_ESCAPE_MAP[char] ?? char);
}

function escapeFileBlockContent(value: string): string {
  return value.replace(/<\s*\/\s*file\s*>/gi, "&lt;/file&gt;").replace(/<\s*file\b/gi, "&lt;file");
}

// openclaw's sanitizeUntrustedFileName(input, fallback) returns the sanitized
// filename or `fallback` when the sanitized result is empty. cross-wms exposes
// only the single-arg variant, so wrap it to preserve the two-arg contract.
function sanitizeUntrustedFileName(input: string, fallbackName: string): string {
  const sanitized = sanitizeUntrustedFileNameSingle(input);
  return sanitized || fallbackName;
}

function sanitizeFileName(value: string | null | undefined, fallbackName: string): string {
  const normalized =
    normalizeOptionalString(
      typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ") : undefined,
    ) ?? "";
  return sanitizeUntrustedFileName(normalized, fallbackName);
}

/** Renders sanitized attachment text as a model-visible file block without allowing file-tag injection. */
export function renderFileContextBlock(params: {
  filename?: string | null;
  fallbackName?: string;
  mimeType?: string | null;
  content: string;
  surroundContentWithNewlines?: boolean;
}): string {
  const fallbackName = normalizeOptionalString(params.fallbackName) ?? "attachment";
  const safeName = sanitizeFileName(params.filename, fallbackName);
  const safeContent = escapeFileBlockContent(params.content);
  const mimeType = normalizeOptionalString(params.mimeType);
  const attrs = [
    `name="${xmlEscapeAttr(safeName)}"`,
    mimeType ? `mime="${xmlEscapeAttr(mimeType)}"` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  if (params.surroundContentWithNewlines === false) {
    return `<file ${attrs}>${safeContent}</file>`;
  }
  return `<file ${attrs}>\n${safeContent}\n</file>`;
}
