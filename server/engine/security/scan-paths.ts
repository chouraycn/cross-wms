/** Path containment helpers re-exported for security scanners. */
export { isPathInside, isPathInsideWithRealpath } from "../infra/_fs-safe-stubs.js";

// Compat re-export: isSensitiveFilePath / scanPathForRisks were removed from
// the diagnostic surface during the refactor; the real implementations live in
// logging/diagnostic.ts as safe degradations until the security refactor lands.
export { isSensitiveFilePath, scanPathForRisks } from "../logging/diagnostic.js";

/** Return true for extension paths intentionally skipped by source scanners. */
export function extensionUsesSkippedScannerPath(entry: string): boolean {
  const segments = entry.split(/[\\/]+/).filter(Boolean);
  return segments.some(
    (segment) =>
      segment === "node_modules" ||
      (segment.startsWith(".") && segment !== "." && segment !== ".."),
  );
}
