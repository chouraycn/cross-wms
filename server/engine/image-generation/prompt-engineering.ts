/**
 * Prompt Engineering — Prompt 工程优化
 *
 * 提供中英文翻译、风格提示增强、Prompt 结构化等功能。
 */

import { logger } from "../../logger.js";
import { applyStyleToPrompt, getStylePreset } from "./style-preset.js";

export type PromptLanguage = "zh" | "en" | "auto";

export type PromptEnhanceOptions = {
  style?: string;
  targetLanguage?: PromptLanguage;
  addQualityTags?: boolean;
  addNegativePrompt?: boolean;
  customEnhancements?: string[];
};

export type EnhancedPrompt = {
  originalPrompt: string;
  enhancedPrompt: string;
  negativePrompt?: string;
  language: PromptLanguage;
  style?: string;
  enhancements: string[];
};

const QUALITY_TAGS = [
  "masterpiece",
  "best quality",
  "ultra detailed",
  "high resolution",
  "8k uhd",
];

const DEFAULT_NEGATIVE_PROMPT = [
  "low quality",
  "blurry",
  "distorted",
  "deformed",
  "bad anatomy",
  "bad proportions",
  "extra limbs",
  "watermark",
  "text",
  "signature",
];

const CHINESE_KEYWORDS = [
  "的", "是", "在", "了", "和", "与", "一", "有", "不", "人",
  "中", "大", "为", "上", "个", "国", "我", "以", "要", "他",
  "时", "来", "用", "们", "生", "到", "作", "地", "于", "出",
  "就", "分", "对", "成", "会", "可", "主", "发", "年", "动",
];

const SIMPLE_ZH_TO_EN_MAP: Record<string, string> = {
  "女孩": "girl",
  "男孩": "boy",
  "男人": "man",
  "女人": "woman",
  "猫": "cat",
  "狗": "dog",
  "花": "flower",
  "树": "tree",
  "山": "mountain",
  "水": "water",
  "海": "sea",
  "海洋": "ocean",
  "天空": "sky",
  "太阳": "sun",
  "月亮": "moon",
  "星星": "stars",
  "城市": "city",
  "森林": "forest",
  "房子": "house",
  "汽车": "car",
  "飞机": "airplane",
  "船": "boat",
  "食物": "food",
  "美丽的": "beautiful",
  "漂亮的": "pretty",
  "可爱的": "cute",
  "高大的": "tall",
  "小的": "small",
  "大的": "big",
  "红色": "red",
  "蓝色": "blue",
  "绿色": "green",
  "黄色": "yellow",
  "黑色": "black",
  "白色": "white",
  "紫色": "purple",
  "粉色": "pink",
  "长发": "long hair",
  "短发": "short hair",
  "眼睛": "eyes",
  "微笑": "smile",
  "站着": "standing",
  "坐着": "sitting",
  "跑": "running",
  "走": "walking",
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
      `[PromptEngineering] ${remainingChinese} Chinese characters remain after basic translation`,
    );
  }

  return translated;
}

export function enhancePrompt(
  prompt: string,
  options: PromptEnhanceOptions = {},
): EnhancedPrompt {
  const enhancements: string[] = [];
  let currentPrompt = prompt;
  let negativePrompt: string | undefined;

  const language = detectPromptLanguage(prompt);
  if (options.targetLanguage === "en" && language === "zh") {
    currentPrompt = translateChinesePrompt(currentPrompt);
    enhancements.push("translated to english");
  }

  if (options.style) {
    const styleResult = applyStyleToPrompt(currentPrompt, options.style);
    if (styleResult.style.id !== "none") {
      currentPrompt = styleResult.enhancedPrompt;
      negativePrompt = styleResult.negativePrompt;
      enhancements.push(`style: ${options.style}`);
    }
  }

  if (options.addQualityTags) {
    const qualityTagsStr = QUALITY_TAGS.join(", ");
    currentPrompt = `${currentPrompt}, ${qualityTagsStr}`;
    enhancements.push("quality tags added");
  }

  if (options.addNegativePrompt && !negativePrompt) {
    negativePrompt = DEFAULT_NEGATIVE_PROMPT.join(", ");
    enhancements.push("default negative prompt added");
  }

  if (options.customEnhancements && options.customEnhancements.length > 0) {
    const customStr = options.customEnhancements.join(", ");
    currentPrompt = `${currentPrompt}, ${customStr}`;
    enhancements.push("custom enhancements added");
  }

  return {
    originalPrompt: prompt,
    enhancedPrompt: currentPrompt,
    negativePrompt,
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
  mood?: string;
  details?: string[];
  quality?: string;
}): string {
  const components: string[] = [];

  if (parts.subject) components.push(parts.subject);
  if (parts.setting) components.push(parts.setting);
  if (parts.style) components.push(parts.style);
  if (parts.lighting) components.push(parts.lighting);
  if (parts.mood) components.push(parts.mood);
  if (parts.details && parts.details.length > 0) {
    components.push(parts.details.join(", "));
  }
  if (parts.quality) components.push(parts.quality);

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

  const stylePrefixes = [
    "beautiful",
    "stunning",
    "gorgeous",
    "magnificent",
    "breathtaking",
  ];

  const anglePrefixes = [
    "close-up",
    "wide angle",
    "bird's eye view",
    "low angle",
    "side view",
  ];

  const lightingSuffixes = [
    "golden hour lighting",
    "soft natural light",
    "dramatic lighting",
    "studio lighting",
    "neon lighting",
  ];

  let styleIdx = 0;
  let angleIdx = 0;
  let lightingIdx = 0;

  while (variations.length < count) {
    let variation = basePrompt;

    if (styleIdx < stylePrefixes.length && variation.length < 500) {
      variation = `${stylePrefixes[styleIdx]}, ${variation}`;
      styleIdx++;
    }

    if (angleIdx < anglePrefixes.length && variation.length < 500) {
      variation = `${variation}, ${anglePrefixes[angleIdx]}`;
      angleIdx++;
    }

    if (lightingIdx < lightingSuffixes.length && variation.length < 500) {
      variation = `${variation}, ${lightingSuffixes[lightingIdx]}`;
      lightingIdx++;
    }

    if (variation === variations[variations.length - 1]) {
      variation = `${variation}, highly detailed`;
    }

    variations.push(variation);

    if (variations.length >= count) break;
  }

  return variations.slice(0, count);
}
