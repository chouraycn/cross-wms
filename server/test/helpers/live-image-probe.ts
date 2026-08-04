// Test helper stub: re-exports from openclaw test helpers if available,
// otherwise returns minimal no-op implementations for type-checking only.
// Real implementations live under openclaw/test/helpers/live-image-probe.ts
// and are exercised by *.test.ts files excluded from the build.

export function renderBitmapTextPngBase64(_text: string): string {
  return "";
}

export function renderCatNoncePngBase64(_nonce: string): string {
  return "";
}

export function renderSolidColorPngBase64(_color: { r: number; g: number; b: number }): string {
  return "";
}

export function renderCatFacePngBase64(): string {
  return "";
}

export function isLiveTestEnabled(): boolean {
  return false;
}
