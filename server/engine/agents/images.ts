/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/images.ts
 *
 * Image detection and loading for prompt turns.
 * Simplified for cross-wms: reuses image-tool.helpers, no sandbox/bridge.
 */

import {
  detectImageReferences,
  loadImageFromRef,
  mergePromptAttachmentImages,
  modelSupportsImages,
  splitPromptAndAttachmentRefs,
} from "./image-tool.helpers.js";

export {
  detectImageReferences,
  loadImageFromRef,
  mergePromptAttachmentImages,
  modelSupportsImages,
  splitPromptAndAttachmentRefs,
};

type ImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

/** Detect, load, order, and sanitize images for one prompt turn. */
export async function detectAndLoadPromptImages(params: {
  prompt: string;
  workspaceDir: string;
  model: { input?: string[] };
  existingImages?: ImageContent[];
  maxBytes?: number;
}): Promise<{
  images: ImageContent[];
  detectedRefs: Array<{ raw: string; type: string; resolved: string }>;
  loadedCount: number;
  skippedCount: number;
}> {
  if (!modelSupportsImages(params.model)) {
    return { images: [], detectedRefs: [], loadedCount: 0, skippedCount: 0 };
  }

  const allRefs = detectImageReferences(params.prompt);
  if (allRefs.length === 0) {
    return {
      images: params.existingImages ?? [],
      detectedRefs: [],
      loadedCount: 0,
      skippedCount: 0,
    };
  }

  const { promptRefs } = splitPromptAndAttachmentRefs({
    prompt: params.prompt,
    refs: allRefs,
    existingImageCount: params.existingImages?.length,
  });

  const promptRefImages: ImageContent[] = [];
  let loadedCount = 0;
  let skippedCount = 0;

  for (const ref of promptRefs) {
    const image = await loadImageFromRef(ref, params.workspaceDir, {
      maxBytes: params.maxBytes,
    });
    if (image) {
      promptRefImages.push(image);
      loadedCount++;
    } else {
      skippedCount++;
    }
  }

  const images = mergePromptAttachmentImages({
    existingImages: params.existingImages,
    promptRefImages,
  });

  return { images, detectedRefs: allRefs, loadedCount, skippedCount };
}
