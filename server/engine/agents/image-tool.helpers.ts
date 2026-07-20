/**
 * 移植自 openclaw/src/agents/tools/image-tool.helpers.ts
 *
 * Image tool helper utilities.
 * Simplified for cross-wms: no media reference resolution, no sandbox bridge.
 */

/** Detect image references in text and return them. */
export function detectImageReferences(prompt: string): Array<{
  raw: string;
  type: "path" | "media-uri";
  resolved: string;
}> {
  const refs: Array<{ raw: string; type: "path" | "media-uri"; resolved: string }> = [];
  const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".heic", ".heif"]);
  const promptLower = prompt.toLowerCase();

  // Pattern: file paths with image extensions
  const pathPattern = /(?:^|\s|"|'|\(|`)((?:\.\.?\/|[~/]|\/)[^\s"'`()\]]+\.(?:png|jpe?g|gif|webp|bmp|tiff?|heic?))/gi;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(prompt)) !== null) {
    const raw = match[1]?.trim();
    if (raw && IMAGE_EXTENSIONS.has(raw.slice(raw.lastIndexOf(".")).toLowerCase())) {
      refs.push({ raw, type: "path", resolved: raw });
    }
  }

  // Pattern: [media attached: media://inbound/<id>]
  const mediaUriPattern = /\[media attached:\s*media:\/\/inbound\/([^\]\s/\\]+)\]/gi;
  while ((match = mediaUriPattern.exec(prompt)) !== null) {
    const uri = `media://inbound/${match[1]}`;
    refs.push({ raw: uri, type: "media-uri", resolved: uri });
  }

  return refs;
}

/** Returns whether the model advertises native image input support. */
export function modelSupportsImages(model: { input?: string[] }): boolean {
  return model.input?.includes("image") ?? false;
}

/** Load an image from a detected reference. */
export async function loadImageFromRef(
  _ref: { raw: string; type: string; resolved: string },
  _workspaceDir: string,
  _options?: { maxBytes?: number; workspaceOnly?: boolean },
): Promise<{ type: "image"; data: string; mimeType: string } | null> {
  // Simplified: no file loading in cross-wms
  return null;
}

/** Merge prompt and attachment images following the specified order. */
export function mergePromptAttachmentImages(params: {
  existingImages?: Array<{ type: string; data: string; mimeType: string }>;
  offloadedImages?: Array<{ type: string; data: string; mimeType: string } | null>;
  promptRefImages?: Array<{ type: string; data: string; mimeType: string }>;
  imageOrder?: Array<"inline" | "offloaded" | string>;
}): Array<{ type: string; data: string; mimeType: string }> {
  const result: Array<{ type: string; data: string; mimeType: string }> = [];
  const existing = params.existingImages ?? [];
  const offloaded = params.offloadedImages ?? [];

  if (params.imageOrder && params.imageOrder.length > 0) {
    let inlineIndex = 0;
    let offloadedIndex = 0;
    for (const entry of params.imageOrder) {
      if (entry === "inline") {
        const image = existing[inlineIndex++];
        if (image) {
          result.push(image);
        }
        continue;
      }
      const image = offloaded[offloadedIndex++];
      if (image) {
        result.push(image);
      }
    }
    while (inlineIndex < existing.length) {
      result.push(existing[inlineIndex++]);
    }
    while (offloadedIndex < offloaded.length) {
      const image = offloaded[offloadedIndex++];
      if (image) {
        result.push(image);
      }
    }
  } else {
    result.push(...existing);
    for (const image of offloaded) {
      if (image) {
        result.push(image);
      }
    }
  }

  result.push(...(params.promptRefImages ?? []));
  return result;
}

/** Split prompt refs from attachment refs. */
export function splitPromptAndAttachmentRefs(params: {
  prompt: string;
  refs: Array<{ raw: string; type: string; resolved: string }>;
  existingImageCount?: number;
}): {
  promptRefs: Array<{ raw: string; type: string; resolved: string }>;
  attachmentRefs: Array<{ raw: string; type: string; resolved: string }>;
} {
  // Simplified: treat all refs as prompt refs
  return { promptRefs: params.refs, attachmentRefs: [] };
}
