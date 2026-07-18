/**
 * Image Generation (图像生成) 类型定义
 *
 * 从 src/services/api.ts 提取的图像生成相关类型，集中管理以便复用。
 * services/api.ts 通过 re-export 保持向后兼容。
 */

/** 图像生成 Provider 能力描述 */
export interface ImageGenerationProvider {
  id: string;
  label: string;
  aliases: string[];
  available: boolean;
  default_model: string;
  models: string[];
  default_timeout_ms: number;
  capabilities: {
    generate: {
      max_count: number;
      supports_size: boolean;
      supports_aspect_ratio: boolean;
      supports_resolution: boolean;
    };
    edit: {
      enabled: boolean;
      max_input_images: number;
    };
    supported_sizes: string[];
    supported_sizes_by_model: Record<string, string[]>;
    supported_aspect_ratios: string[];
    supported_resolutions: string[];
    supported_qualities: string[];
    supported_formats: string[];
    supported_backgrounds: string[];
  };
}

/** 图像生成全局配置 */
export interface ImageGenerationConfig {
  defaultModel?: string;
  defaultSize?: string;
  defaultQuality?: string;
  defaultCount?: number;
  defaultOutputFormat?: string;
  providers?: Record<string, { apiKey?: string; baseUrl?: string }>;
}

/** 单张生成图像 */
export interface GeneratedImage {
  url: string;
  b64_json?: string;
  revised_prompt?: string;
  width?: number;
  height?: number;
}

/** 图像生成请求参数 */
export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  quality?: string;
  count?: number;
  outputFormat?: string;
  background?: string;
}

/** 图像生成结果 */
export interface ImageGenerationResult {
  images: GeneratedImage[];
}
