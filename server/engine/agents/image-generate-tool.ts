/**
 * 移植自 openclaw/src/agents/tools/image-generate-tool.ts
 *
 * Image generation tool.
 * In cross-wms the image generation infrastructure is not available,
 * so resolveImageGenerationModelConfigForTool returns undefined and
 * createImageGenerateTool returns a stub tool.
 */

/** Resolve image generation model config (returns undefined in cross-wms). */
export function resolveImageGenerationModelConfigForTool(..._args: unknown[]): undefined {
  return undefined;
}

/** Create the image generate tool (returns stub in cross-wms). */
export function createImageGenerateTool(..._args: unknown[]): unknown {
  return {
    label: "Image Generate",
    name: "image_generate",
    description: "Generate images (stub - not fully implemented in cross-wms).",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string" },
      },
    },
    execute: async () => ({
      type: "text" as const,
      text: JSON.stringify({ status: "error", error: "Image generation not available in cross-wms" }),
    }),
  };
}
