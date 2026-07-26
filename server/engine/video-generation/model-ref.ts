// Video model ref helpers parse provider-qualified video generation model ids.
import { parseGenerationModelRef } from "@cdf-know/media-generation-core/model-ref";

// Video model refs share the generic media-generation provider/model grammar:
// "provider/model" when explicit, otherwise null for default resolution.
export function parseVideoGenerationModelRef(
  raw: string | undefined,
): { provider: string; model: string } | null {
  return parseGenerationModelRef(raw);
}
