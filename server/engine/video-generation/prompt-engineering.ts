/**
 * Video Prompt Engineering — 视频 Prompt 工程
 *
 * 参考图像生成 prompt-engineering 模式，提供视频结构化 Prompt 增强。
 */

import { logger } from "../../logger.js";
import { applyStyleToPrompt } from "./style-preset.js";

export type PromptLanguage = "zh" | "en" | "auto";

export type VideoPromptEnhanceOptions = {
  style?: string;
  targetLanguage?: PromptLanguage;
  addQualityTags?: boolean;
  addCameraTags?: boolean;
  addMotionTags?: boolean;
  customEnhancements?: string[];
};

export type EnhancedVideoPrompt = {
  originalPrompt: string;
  enhancedPrompt: string;
  language: PromptLanguage;
  style?: string;
  enhancements: string[];
};

const QUALITY_TAGS = [
  "high quality",
  "ultra detailed",
  "8k uhd",
  "professional grade",
];

const CAMERA_TAGS = [
  "smooth camera movement",
  "cinematic composition",
  "stable shot",
  "professional cinematography",
];

const MOTION_TAGS = [
  "natural motion",
  "fluid animation",
  "realistic physics",
  "lifelike movement",
];

const SIMPLE_ZH_TO_EN_MAP: Record<string, string> = {
  "城市": "city",
  "森林": "forest",
  "海洋": "ocean",
  "山": "mountain",
  "天空": "sky",
  "女孩": "girl",
  "男孩": "boy",
  "飞": "flying",
  "跑": "running",
  "美丽的": "beautiful",
  "壮丽的": "magnificent",
  "电影感": "cinematic",
  "动画": "animation",
  "写实": "realistic",
};

export function detectPromptLanguage(prompt: string): PromptLanguage {
  if (!prompt || typeof prompt !== "string") return "en";

  let chineseCount = 0;
  for (const char of prompt) {
    if (char >= "\u4e00" && char <= "\u9fff") {
      chineseCount++;
    }
  }

  const chineseRatio = chineseCount / prompt.length;
  if (chineseRatio > 0.2) {
    return "zh";
  }

  return "en";
}

export function translateChinesePrompt(prompt: string): string {
  if (!prompt) return prompt;
  const lang = detectPromptLanguage(prompt);
  if (lang === "en") return prompt;

  let translated = prompt;
  const sortedEntries = Object.entries(SIMPLE_ZH_TO_EN_MAP).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [zh, en] of sortedEntries) {
    const regex = new RegExp(zh, "g");
    translated = translated.replace(regex, en);
  }

  const remainingChinese = [...translated].filter(
    (c) => c >= "\u4e00" && c <= "\u9fff",
  ).length;

  if (remainingChinese > 0) {
    logger.debug(
      `[VideoPromptEngineering] ${remainingChinese} Chinese characters remain after basic translation`,
    );
  }

  return translated;
}

export function enhancePrompt(
  prompt: string,
  options: VideoPromptEnhanceOptions = {},
): EnhancedVideoPrompt {
  const enhancements: string[] = [];
  let currentPrompt = prompt;

  const language = detectPromptLanguage(prompt);
  if (options.targetLanguage === "en" && language === "zh") {
    currentPrompt = translateChinesePrompt(currentPrompt);
    enhancements.push("translated to english");
  }

  if (options.style) {
    const styleResult = applyStyleToPrompt(currentPrompt, options.style);
    if (styleResult.style.id !== "none") {
      currentPrompt = styleResult.enhancedPrompt;
      enhancements.push(`style: ${options.style}`);
    }
  }

  if (options.addQualityTags) {
    currentPrompt = `${currentPrompt}, ${QUALITY_TAGS.join(", ")}`;
    enhancements.push("quality tags added");
  }

  if (options.addCameraTags) {
    currentPrompt = `${currentPrompt}, ${CAMERA_TAGS.join(", ")}`;
    enhancements.push("camera tags added");
  }

  if (options.addMotionTags) {
    currentPrompt = `${currentPrompt}, ${MOTION_TAGS.join(", ")}`;
    enhancements.push("motion tags added");
  }

  if (options.customEnhancements && options.customEnhancements.length > 0) {
    currentPrompt = `${currentPrompt}, ${options.customEnhancements.join(", ")}`;
    enhancements.push("custom enhancements added");
  }

  return {
    originalPrompt: prompt,
    enhancedPrompt: currentPrompt,
    language,
    style: options.style,
    enhancements,
  };
}

export function buildPromptFromParts(parts: {
  subject?: string;
  style?: string;
  setting?: string;
  lighting?: string;
  camera?: string;
  motion?: string;
}): string {
  const components: string[] = [];

  if (parts.subject) components.push(parts.subject);
  if (parts.setting) components.push(parts.setting);
  if (parts.style) components.push(parts.style);
  if (parts.lighting) components.push(parts.lighting);
  if (parts.camera) components.push(parts.camera);
  if (parts.motion) components.push(parts.motion);

  return components.join(", ");
}

export function sanitizePrompt(prompt: string): string {
  if (!prompt) return "";

  let sanitized = prompt.trim();
  sanitized = sanitized.replace(/[,，]{2,}/g, ",");
  sanitized = sanitized.replace(/\s+/g, " ");
  sanitized = sanitized.replace(/\s*[,，]\s*/g, ", ");
  sanitized = sanitized.replace(/^[,，\s]+|[,，\s]+$/g, "");

  return sanitized;
}

export function truncatePrompt(prompt: string, maxLength: number): string {
  if (!prompt || prompt.length <= maxLength) return prompt;

  const truncated = prompt.slice(0, maxLength);
  const lastComma = truncated.lastIndexOf(",");
  if (lastComma > maxLength * 0.8) {
    return truncated.slice(0, lastComma).trim() + "...";
  }

  return truncated + "...";
}

export function mergePrompts(prompts: string[], separator: string = ", "): string {
  const filtered = prompts.filter((p) => p && p.trim().length > 0);
  return filtered.join(separator);
}

export function extractPromptKeywords(prompt: string): string[] {
  if (!prompt) return [];

  const clean = prompt.replace(/[，。！？、；：]/g, ",");
  const parts = clean.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

  const stopWords = new Set([
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "with",
    "and", "or", "but", "is", "are", "was", "were", "be", "been",
    "的", "是", "在", "了", "和", "与",
  ]);

  const keywords = parts.filter((p) => {
    const lower = p.toLowerCase();
    return !stopWords.has(lower) && lower.length > 1;
  });

  return [...new Set(keywords)].slice(0, 20);
}

export function createPromptVariations(
  prompt: string,
  count: number = 3,
): string[] {
  if (!prompt) return [];
  if (count <= 0) return [];

  const variations: string[] = [];
  const basePrompt = sanitizePrompt(prompt);
  variations.push(basePrompt);

  const cameraAngles = [
    "close-up shot",
    "wide angle shot",
    "aerial view",
    "tracking shot",
    "low angle shot",
  ];

  let idx = 0;
  while (variations.length < count) {
    let variation = basePrompt;
    if (idx < cameraAngles.length) {
      variation = `${variation}, ${cameraAngles[idx]}`;
      idx++;
    } else {
      variation = `${variation}, cinematic detail`;
    }
    variations.push(variation);
    if (variations.length >= count) break;
  }

  return variations.slice(0, count);
}
