/**
 * Built-in image-generation providers.
 *
 * 内置图片生成 Provider：OpenAI DALL-E 系列
 */

import { createOpenAiCompatibleImageProvider } from "./openai-compatible-image-provider.js";
import { registerImageGenerationProvider } from "./provider-registry.js";
import type {
  ImageGenerationProviderCapabilities,
  ImageGenerationQuality,
} from "./types.js";

// ==================== OpenAI DALL-E ====================

const DALL_E_3_SIZES = ["1024x1024", "1792x1024", "1024x1792"];
const DALL_E_2_SIZES = ["256x256", "512x512", "1024x1024"];

const openaiDalleCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 10,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: [...DALL_E_3_SIZES, ...DALL_E_2_SIZES],
    sizesByModel: {
      "dall-e-3": DALL_E_3_SIZES,
      "dall-e-2": DALL_E_2_SIZES,
    },
  },
  output: {
    qualities: ["low", "medium", "high", "auto"] as ImageGenerationQuality[],
    formats: ["png"],
    backgrounds: ["opaque", "auto"],
  },
};

const openaiDalleProvider = createOpenAiCompatibleImageProvider({
  id: "openai",
  label: "OpenAI DALL-E",
  aliases: ["dall-e", "dalle", "openai-dalle"],
  defaultModel: "dall-e-3",
  models: ["dall-e-3", "dall-e-2"],
  capabilities: openaiDalleCapabilities,
  defaultBaseUrl: "https://api.openai.com",
  defaultTimeoutMs: 60000,
  apiKeyEnvVar: "OPENAI_API_KEY",
  baseUrlEnvVar: "OPENAI_BASE_URL",

  buildGenerateBody({ req, model, count }) {
    const body: Record<string, unknown> = {
      model,
      prompt: req.prompt,
      n: model === "dall-e-3" ? 1 : count,
      response_format: "b64_json",
    };

    // Size
    if (req.size) {
      body.size = req.size;
    } else if (model === "dall-e-3") {
      body.size = "1024x1024";
    } else {
      body.size = "512x512";
    }

    // Quality (DALL-E 3 only)
    if (model === "dall-e-3" && req.quality) {
      // high -> hd, others -> standard
      body.quality = req.quality === "high" ? "hd" : "standard";
    }

    // OpenAI-specific options
    if (req.providerOptions?.openai) {
      const openaiOpts = req.providerOptions.openai;
      if (openaiOpts.user) {
        body.user = openaiOpts.user;
      }
    }

    return body;
  },

  validateRequest(req) {
    const model = req.model || "dall-e-3";
    if (model === "dall-e-3" && (req.count || 1) > 1) {
      return "DALL-E 3 only supports generating 1 image at a time";
    }
    return undefined;
  },
});

// 注册到全局注册表（优先级 10，在国产 Provider 之后）
registerImageGenerationProvider(openaiDalleProvider, 10);

export { openaiDalleProvider };
export default openaiDalleProvider;
