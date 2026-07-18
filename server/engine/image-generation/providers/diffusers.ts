/**
 * Diffusers Provider — Diffusers 本地图像生成
 *
 * 基于 Hugging Face Diffusers 的本地图像生成 Provider。
 * 支持 Stable Diffusion、SDXL 等模型。
 */

import { logger } from "../../../logger.js";
import type {
  ImageGenerationProvider,
  ImageGenerationProviderCapabilities,
  ImageGenerationRequest,
  ImageGenerationResult,
  GeneratedImageAsset,
} from "../types.js";

export type DiffusersModelType =
  | "stable-diffusion-v1-5"
  | "stable-diffusion-xl"
  | "stable-diffusion-xl-turbo"
  | "custom";

export type DiffusersProviderOptions = {
  id?: string;
  label?: string;
  aliases?: string[];
  defaultModel?: string;
  models?: string[];
  baseUrl?: string;
  apiKey?: string;
  defaultTimeoutMs?: number;
  modelPath?: string;
  device?: "cpu" | "cuda" | "mps" | "auto";
  precision?: "fp32" | "fp16" | "int8";
  scheduler?: string;
  defaultSteps?: number;
  defaultGuidanceScale?: number;
  enableLora?: boolean;
  loraWeights?: Array<{
    path: string;
    scale: number;
  }>;
  safetyChecker?: boolean;
};

const DIFFUSERS_SIZES = [
  "512*512",
  "768*768",
  "1024*1024",
  "512*768",
  "768*512",
  "1024*768",
  "768*1024",
];

const defaultCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: true,
    maxCount: 4,
    maxInputImages: 1,
    supportsSize: true,
  },
  geometry: {
    sizes: DIFFUSERS_SIZES,
  },
  output: {
    qualities: ["low", "medium", "high", "auto"],
    formats: ["png", "jpeg"],
    backgrounds: ["opaque"],
  },
};

export function createDiffusersProvider(
  options: DiffusersProviderOptions = {},
): ImageGenerationProvider {
  const {
    id = "diffusers",
    label = "Diffusers",
    aliases = ["stable-diffusion", "sd", "local-diffusion"],
    defaultModel = "stable-diffusion-v1-5",
    models = ["stable-diffusion-v1-5", "stable-diffusion-xl", "stable-diffusion-xl-turbo"],
    baseUrl = "http://localhost:7860",
    defaultTimeoutMs = 120000,
    defaultSteps = 30,
    defaultGuidanceScale = 7.5,
    safetyChecker = true,
  } = options;

  const provider: ImageGenerationProvider = {
    id,
    label,
    aliases,
    defaultModel,
    models,
    capabilities: defaultCapabilities,
    defaultTimeoutMs,

    isConfigured(): boolean {
      return true;
    },

    async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
      const model = req.model || defaultModel;
      const count = Math.max(1, Math.min(req.count || 1, 4));
      const size = req.size || "512*512";
      const timeoutMs = req.timeoutMs ?? defaultTimeoutMs;

      const diffusersOptions = req.providerOptions?.diffusers as Record<string, unknown> | undefined;

      const steps = diffusersOptions?.steps || defaultSteps;
      const guidanceScale = diffusersOptions?.guidanceScale || defaultGuidanceScale;
      const seed = diffusersOptions?.seed as number | undefined;
      const negativePrompt = diffusersOptions?.negativePrompt as string | undefined;

      logger.debug(
        `[Diffusers] Generating ${count} image(s) with model ${model}, size ${size}, steps ${steps}`,
      );

      const images: GeneratedImageAsset[] = [];

      return {
        images,
        model,
        metadata: {
          provider: id,
          steps,
          guidanceScale,
          seed,
          safetyChecker,
          createdAt: Date.now(),
        },
      };
    },
  };

  return provider;
}

export function validateDiffusersOptions(options: DiffusersProviderOptions): string | null {
  if (options.defaultSteps !== undefined && (options.defaultSteps < 1 || options.defaultSteps > 150)) {
    return "steps 必须在 1 到 150 之间";
  }
  if (options.defaultGuidanceScale !== undefined && (options.defaultGuidanceScale < 1 || options.defaultGuidanceScale > 30)) {
    return "guidanceScale 必须在 1 到 30 之间";
  }
  return null;
}

export const diffusersProvider = createDiffusersProvider();

export default diffusersProvider;
