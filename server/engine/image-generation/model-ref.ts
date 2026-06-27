/**
 * Parses image-generation model references into provider/model components.
 *
 * 移植自 openclaw/src/image-generation/model-ref.ts
 *
 * Image model refs share the generic media-generation provider/model grammar:
 * "provider/model" when explicit, otherwise null for default resolution.
 */

export function parseImageGenerationModelRef(
  raw: string | undefined,
): { provider: string; model: string } | null {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // provider/model 格式
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const provider = trimmed.slice(0, slashIndex).trim();
    const model = trimmed.slice(slashIndex + 1).trim();
    if (provider && model) {
      return { provider, model };
    }
  }

  // 只有 model，没有 provider
  if (!trimmed.includes("/")) {
    return { provider: "", model: trimmed };
  }

  return null;
}
