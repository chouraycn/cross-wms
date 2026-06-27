/**
 * Image Generation Tool — 图片生成工具
 *
 * 移植自 openclaw/src/agents/tools/image-generate-tool.ts
 *
 * 提供 image_generate 工具，支持三种 action：
 *   - generate: 生成图片（默认）
 *   - list: 列出可用的 Provider 和模型
 *   - status: 查看生成任务状态（当前同步生成，预留扩展）
 */

import type { ToolDefinition } from "../aiClient.js";
import type { ToolHandler } from "./toolTypes.js";
import { logger } from "../logger.js";
import {
  generateImage,
  listRuntimeImageGenerationProviders,
} from "./image-generation/runtime.js";
import { saveGeneratedImages } from "./image-generation/image-assets.js";

// 导入内置 Provider 以确保它们被注册到注册表中
// 国产 Provider 优先注册（优先级 5-7），然后是国际 Provider（优先级 10+）
import "./image-generation/chinese-providers.js";
import type {
  ImageGenerationBackground,
  ImageGenerationOutputFormat,
  ImageGenerationQuality,
  ImageGenerationResolution,
} from "./image-generation/types.js";

// ==================== 常量 ====================

const DEFAULT_COUNT = 1;
const MAX_COUNT = 4;
const DEFAULT_RESOLUTION: ImageGenerationResolution = "1K";
const SUPPORTED_ACTIONS = ["generate", "list", "status"] as const;
const SUPPORTED_QUALITIES = ["low", "medium", "high", "auto"] as const;
const SUPPORTED_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
const SUPPORTED_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;
const SUPPORTED_RESOLUTIONS = ["1K", "2K", "4K"] as const;

const SUPPORTED_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "4:3",
  "3:4",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
  "9:21",
];

const SUPPORTED_SIZES = [
  "256x256",
  "512x512",
  "768x768",
  "1024x1024",
  "1792x1024",
  "1024x1792",
  "1280x720",
  "720x1280",
];

// ==================== 安全：允许的目录 ====================

function getAllowedDirs(): string[] {
  const os = require("os");
  const path = require("path");
  const homeDir = os.homedir();
  return [
    path.join(homeDir, "Desktop"),
    path.join(homeDir, "Documents"),
    path.join(homeDir, "Downloads"),
    path.join(homeDir, "Pictures"),
    "/tmp",
    "/private/tmp",
  ];
}

function isPathAllowed(filePath: string): boolean {
  const path = require("path");
  const resolvedPath = path.resolve(filePath);
  const allowedDirs = getAllowedDirs();
  return allowedDirs.some(
    (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep),
  );
}

// ==================== 工具定义 ====================

const imageGenerateToolDef: ToolDefinition = {
  type: "function",
  function: {
    name: "image_generate",
    description:
      "Generate images from text prompts. Supports multiple providers (OpenAI DALL-E, etc.) and models.\n" +
      "\nActions:\n" +
      "  - generate (default): Generate images from a text prompt\n" +
      "  - list: List available providers, models, and capabilities\n" +
      "  - status: Check background generation task status\n" +
      "\nGenerated images are automatically saved to the Downloads folder or a specified path.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            'Action to perform: "generate" (default), "list" providers/models, "status" of active tasks.',
          enum: SUPPORTED_ACTIONS as unknown as string[],
          default: "generate",
        },
        prompt: {
          type: "string",
          description:
            "Image generation prompt (required for 'generate' action). English works best.",
        },
        model: {
          type: "string",
          description:
            'Model to use, in "provider/model" format (e.g., "openai/dall-e-3"). ' +
            "If omitted, uses the default configured model.",
        },
        count: {
          type: "number",
          description: `Number of images to generate (1-${MAX_COUNT}, default ${DEFAULT_COUNT}).`,
          default: DEFAULT_COUNT,
          minimum: 1,
          maximum: MAX_COUNT,
        },
        size: {
          type: "string",
          description:
            'Image size (e.g., "1024x1024", "1792x1024", "512x512"). ' +
            "Takes precedence over aspect_ratio and resolution.",
          enum: SUPPORTED_SIZES,
        },
        aspect_ratio: {
          type: "string",
          description:
            'Aspect ratio (e.g., "1:1", "16:9", "9:16", "4:3"). ' +
            "Ignored when size is specified.",
          enum: SUPPORTED_ASPECT_RATIOS,
        },
        resolution: {
          type: "string",
          description:
            'Resolution level: "1K", "2K", "4K". ' +
            "Ignored when size or aspect_ratio is specified.",
          enum: SUPPORTED_RESOLUTIONS,
        },
        quality: {
          type: "string",
          description:
            'Image quality: "low", "medium", "high" (hd for DALL-E 3), "auto" (default).',
          enum: SUPPORTED_QUALITIES,
          default: "auto",
        },
        output_format: {
          type: "string",
          description: 'Output image format: "png", "jpeg", "webp" (default: png).',
          enum: SUPPORTED_OUTPUT_FORMATS,
          default: "png",
        },
        background: {
          type: "string",
          description:
            'Background mode: "transparent", "opaque", "auto" (default).',
          enum: SUPPORTED_BACKGROUNDS,
          default: "auto",
        },
        save_path: {
          type: "string",
          description:
            "Path to save generated images. Can be a directory or a file path. " +
            "If omitted, saves to Downloads folder. " +
            "Only allowed in Desktop, Documents, Downloads, Pictures, and /tmp.",
        },
        filename: {
          type: "string",
          description:
            "Base filename for generated images (without extension). " +
            "If omitted, auto-generated names are used.",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 60000 = 1 minute).",
          default: 60000,
        },
        style_preset: {
          type: "string",
          description:
            "(Stability AI) Style preset: 3d-model, analog-film, anime, " +
            "cinematic, comic-book, digital-art, enhance, fantasy-art, " +
            "isometric, line-art, low-poly, neon-punk, origami, photographic, " +
            "pixel-art, tile-texture",
        },
      },
      required: [],
    },
  },
};

// ==================== Action: list ====================

function handleListAction(): string {
  const providers = listRuntimeImageGenerationProviders({
    includeUnavailable: true,
  });

  const providerList = providers.map((p) => ({
    id: p.id,
    label: p.label || p.id,
    available: p.isConfigured ? p.isConfigured() : true,
    default_model: p.defaultModel || "",
    models: p.models || [],
    capabilities: {
      generate: {
        max_count: p.capabilities.generate.maxCount || 1,
        supports_size: p.capabilities.generate.supportsSize || false,
        supports_aspect_ratio: p.capabilities.generate.supportsAspectRatio || false,
        supports_resolution: p.capabilities.generate.supportsResolution || false,
      },
      edit: {
        enabled: p.capabilities.edit.enabled,
        max_input_images: p.capabilities.edit.maxInputImages || 0,
      },
      supported_sizes: p.capabilities.geometry?.sizes || [],
      supported_qualities: p.capabilities.output?.qualities || [],
      supported_formats: p.capabilities.output?.formats || [],
      supported_backgrounds: p.capabilities.output?.backgrounds || [],
    },
  }));

  return JSON.stringify({
    action: "list",
    success: true,
    providers: providerList,
    total_providers: providerList.length,
    available_count: providerList.filter((p) => p.available).length,
  });
}

// ==================== Action: status ====================

function handleStatusAction(): string {
  return JSON.stringify({
    action: "status",
    success: true,
    status: "idle",
    message:
      "Image generation runs synchronously in the current implementation. " +
      "Use the 'generate' action to create images.",
    active_tasks: [],
  });
}

// ==================== Action: generate ====================

async function handleGenerateAction(
  args: Record<string, unknown>,
): Promise<string> {
  const os = require("os");
  const path = require("path");

  const prompt = String(args.prompt || "").trim();
  const modelArg = args.model ? String(args.model) : undefined;
  const count = Math.min(
    Math.max(Number(args.count || DEFAULT_COUNT), 1),
    MAX_COUNT,
  );
  const size = args.size ? String(args.size) : undefined;
  const aspectRatio = args.aspect_ratio ? String(args.aspect_ratio) : undefined;
  const resolution = args.resolution
    ? (String(args.resolution).toUpperCase() as ImageGenerationResolution)
    : undefined;
  const quality = args.quality
    ? (String(args.quality).toLowerCase() as ImageGenerationQuality)
    : undefined;
  const outputFormat = args.output_format
    ? (String(args.output_format).toLowerCase() as ImageGenerationOutputFormat)
    : undefined;
  const background = args.background
    ? (String(args.background).toLowerCase() as ImageGenerationBackground)
    : undefined;
  const savePathArg = args.save_path ? String(args.save_path) : undefined;
  const filename = args.filename ? String(args.filename) : undefined;
  const timeoutMs = Number(args.timeout_ms || 60000);
  const stylePreset = args.style_preset ? String(args.style_preset) : undefined;

  if (!prompt) {
    return JSON.stringify({
      action: "generate",
      success: false,
      error: "prompt is required for 'generate' action",
    });
  }

  // Check if any providers are available
  const availableProviders = listRuntimeImageGenerationProviders();
  if (availableProviders.length === 0) {
    return JSON.stringify({
      action: "generate",
      success: false,
      error:
        "No image generation providers are configured. " +
        "Set one of the following environment variables:\n" +
        "  - OPENAI_API_KEY (for OpenAI DALL-E)",
    });
  }

  try {
    // Generate images
    const result = await generateImage({
      prompt,
      modelOverride: modelArg,
      count,
      size,
      aspectRatio,
      resolution,
      quality,
      outputFormat,
      background,
      timeoutMs,
      autoProviderFallback: true,
      providerOptions: {
        ...(stylePreset ? { stability: { stylePreset } } : {}),
      },
    });

    // Determine save directory
    let saveDir: string;
    let baseName: string;
    const downloadsDir = path.join(os.homedir(), "Downloads");

    if (savePathArg) {
      const fs = require("fs");
      const resolvedPath = path.resolve(savePathArg);

      // Security check
      if (!isPathAllowed(resolvedPath)) {
        const homeDir = os.homedir();
        const displayDirs = getAllowedDirs()
          .map((d) => d.replace(homeDir, "~"))
          .join(", ");
        return JSON.stringify({
          action: "generate",
          success: false,
          error: `Security: can only save to these directories: ${displayDirs}`,
        });
      }

      // Check if it's a directory or file path
      if (
        fs.existsSync(resolvedPath) &&
        fs.statSync(resolvedPath).isDirectory()
      ) {
        saveDir = resolvedPath;
        baseName = filename || "generated_image";
      } else {
        saveDir = path.dirname(resolvedPath);
        baseName =
          filename || path.basename(resolvedPath, path.extname(resolvedPath));
      }
    } else {
      saveDir = downloadsDir;
      baseName = filename || "generated_image";
    }

    // Save images
    const savedPaths = saveGeneratedImages(result.images, saveDir, baseName);

    return JSON.stringify({
      action: "generate",
      success: true,
      provider: result.provider,
      model: result.model,
      prompt,
      image_count: result.images.length,
      saved_paths: savedPaths,
      save_dir: saveDir,
      attempts: result.attempts,
      ignored_overrides: result.ignoredOverrides,
      normalization: result.normalization,
      revised_prompts: result.images
        .map((img) => img.revisedPrompt)
        .filter(Boolean),
      metadata: result.metadata,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[ImageGenerateTool] generation failed:", errorMsg);
    return JSON.stringify({
      action: "generate",
      success: false,
      error: errorMsg,
      available_providers: availableProviders.map((p) => ({
        id: p.id,
        label: p.label || p.id,
        default_model: p.defaultModel,
      })),
    });
  }
}

// ==================== 主处理器 ====================

const handleImageGenerate: ToolHandler = async (
  args: Record<string, unknown>,
): Promise<string> => {
  const action = (String(args.action || "generate").toLowerCase() ||
    "generate") as "generate" | "list" | "status";

  switch (action) {
    case "list":
      return handleListAction();
    case "status":
      return handleStatusAction();
    case "generate":
    default:
      return handleGenerateAction(args);
  }
};

// ==================== 导出 ====================

export function getImageToolDefinitions(): ToolDefinition[] {
  return [imageGenerateToolDef];
}

export function getImageToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();
  handlers.set(imageGenerateToolDef.function.name, handleImageGenerate);
  return handlers;
}
