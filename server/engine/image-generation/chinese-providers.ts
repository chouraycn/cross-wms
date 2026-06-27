/**
 * Built-in Chinese Image Generation Providers — 国产图片生成 Provider
 *
 * 内置国产图片生成 Provider：
 * 1. 通义万相（wanx）— 阿里云 DashScope
 * 2. 混元（Hunyuan）— 腾讯混元
 * 3. 文心一格（ERNIE-ViLG）— 百度文心
 * 4. 智谱（Zhipu）— 智谱 AI GLM
 */

import { createOpenAiCompatibleImageProvider } from "./openai-compatible-image-provider.js";
import { registerImageGenerationProvider } from "./provider-registry.js";
import type {
  ImageGenerationProviderCapabilities,
  ImageGenerationQuality,
} from "./types.js";

// ==================== 通义万相（wanx）— 阿里云 DashScope ====================

const WANX_SIZES = [
  "1024*1024",
  "720*1280",
  "1280*720",
  "768*1344",
  "1344*768",
  "1440*1440",
  "1440*720",
  "720*1440",
];

const wanxCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 6,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: WANX_SIZES,
  },
  output: {
    qualities: ["auto"] as ImageGenerationQuality[],
    formats: ["png"],
    backgrounds: ["opaque", "auto"],
  },
};

const wanxProvider = createOpenAiCompatibleImageProvider({
  id: "wanx",
  label: "通义万相",
  aliases: ["dashscope", "aliyun", "tongyi"],
  defaultModel: "wanx-v1",
  models: ["wanx-v1"],
  capabilities: wanxCapabilities,
  defaultBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
  defaultTimeoutMs: 120000,
  apiKeyEnvVar: "DASHSCOPE_API_KEY",
  baseUrlEnvVar: "DASHSCOPE_BASE_URL",

  buildGenerateBody({ req, model, count }) {
    const wanxOptions = req.providerOptions?.wanx as Record<string, unknown> | undefined;
    return {
      model,
      input: {
        prompt: req.prompt,
      },
      parameters: {
        n: count,
        size: req.size || "1024*1024",
        ...(wanxOptions?.ref_image ? { ref_image: wanxOptions.ref_image } : {}),
      },
    };
  },

  validateRequest(req) {
    if (!req.prompt || req.prompt.trim().length === 0) {
      return "提示词不能为空";
    }
    return undefined;
  },
});

// 注册到全局注册表（优先级 5，国产优先）
registerImageGenerationProvider(wanxProvider);

// ==================== 混元（Hunyuan）— 腾讯混元 ====================

const HUNYUAN_SIZES = [
  "768:768",
  "768:1024",
  "1024:768",
  "1024:1024",
];

const hunyuanCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: HUNYUAN_SIZES,
  },
  output: {
    qualities: ["auto"] as ImageGenerationQuality[],
    formats: ["png", "jpeg"],
    backgrounds: ["opaque", "auto"],
  },
};

const hunyuanProvider = createOpenAiCompatibleImageProvider({
  id: "hunyuan",
  label: "混元",
  aliases: ["tencent", "tencentcloud"],
  defaultModel: "hunyuan-v1",
  models: ["hunyuan-v1"],
  capabilities: hunyuanCapabilities,
  defaultBaseUrl: "https://api.hunyuan.cloud.tencent.com",
  defaultTimeoutMs: 120000,
  apiKeyEnvVar: "HUNYUAN_API_KEY",
  baseUrlEnvVar: "HUNYUAN_BASE_URL",

  buildGenerateBody({ req, model, count }) {
    // 腾讯混元使用不同的请求格式
    // 需要将尺寸转换为 width 和 height
    const size = req.size || "1024:1024";
    const [width, height] = size.split(":").map((s) => parseInt(s, 10));

    return {
      model,
      prompt: req.prompt,
      width,
      height,
      n: count,
      response_format: "base64",
    };
  },

  validateRequest(req) {
    if (!req.prompt || req.prompt.trim().length === 0) {
      return "提示词不能为空";
    }
    return undefined;
  },
});

// 注册到全局注册表（优先级 6）
registerImageGenerationProvider(hunyuanProvider);

// ==================== 文心一格（ERNIE-ViLG）— 百度文心 ====================

const ERNIE_SIZES = ["512*512", "1024*1024"];

const ernieCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 2,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: ERNIE_SIZES,
  },
  output: {
    qualities: ["auto"] as ImageGenerationQuality[],
    formats: ["png", "jpeg"],
    backgrounds: ["opaque", "auto"],
  },
};

const ernieProvider = createOpenAiCompatibleImageProvider({
  id: "ernie",
  label: "文心一格",
  aliases: ["baidu", "wenxin"],
  defaultModel: "ernie-vilg-v1",
  models: ["ernie-vilg-v1"],
  capabilities: ernieCapabilities,
  defaultBaseUrl: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/image",
  defaultTimeoutMs: 120000,
  apiKeyEnvVar: "BAIDU_API_KEY",
  baseUrlEnvVar: "BAIDU_ERNIE_BASE_URL",

  buildGenerateBody({ req, model, count }) {
    // 百度文心使用特定的请求格式
    return {
      prompt: req.prompt,
      image_num: count,
      resolution: req.size === "1024*1024" ? "1024*1024" : "512*512",
    };
  },

  validateRequest(req) {
    if (!req.prompt || req.prompt.trim().length === 0) {
      return "提示词不能为空";
    }
    return undefined;
  },
});

// 注册到全局注册表（优先级 7）
registerImageGenerationProvider(ernieProvider, 7);

// ==================== 智谱（Zhipu）— 智谱 AI GLM ====================

const ZHIPU_SIZES = [
  "1024:1024",
  "768:1024",
  "1024:768",
  "720:1280",
  "1280:720",
];

const zhipuCapabilities: ImageGenerationProviderCapabilities = {
  generate: {
    maxCount: 4,
    supportsSize: true,
    supportsAspectRatio: false,
    supportsResolution: false,
  },
  edit: {
    enabled: false,
  },
  geometry: {
    sizes: ZHIPU_SIZES,
  },
  output: {
    qualities: ["auto"] as ImageGenerationQuality[],
    formats: ["png"],
    backgrounds: ["opaque", "auto"],
  },
};

const zhipuProvider = createOpenAiCompatibleImageProvider({
  id: "zhipu",
  label: "智谱",
  aliases: ["glm", "zhipuai"],
  defaultModel: "cogview-3",
  models: ["cogview-3", "cogview-3-plus"],
  capabilities: zhipuCapabilities,
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  defaultTimeoutMs: 120000,
  apiKeyEnvVar: "ZHIPU_API_KEY",
  baseUrlEnvVar: "ZHIPU_BASE_URL",

  buildGenerateBody({ req, model, count }) {
    // 智谱使用标准 OpenAI 格式
    return {
      model,
      prompt: req.prompt,
      size: req.size || "1024:1024",
      n: count,
      response_format: "b64_json",
    };
  },

  validateRequest(req) {
    if (!req.prompt || req.prompt.trim().length === 0) {
      return "提示词不能为空";
    }
    return undefined;
  },
});

// 注册到全局注册表（优先级 4，智谱优先于其他国产模型）
registerImageGenerationProvider(zhipuProvider, 4);

// ==================== 导出 ====================

export { wanxProvider, hunyuanProvider, ernieProvider, zhipuProvider };
