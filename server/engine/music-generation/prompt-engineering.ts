/**
 * Music Prompt Engineering — 音乐 Prompt 工程
 *
 * 提供风格/情绪/乐器/节奏等结构化 Prompt 增强。
 */

import { logger } from "../../logger.js";
import { applyStyleToPrompt } from "./style-preset.js";
import type { MusicMood, MusicTempo } from "./types.js";

export type PromptLanguage = "zh" | "en" | "auto";

export type MusicPromptEnhanceOptions = {
  style?: string;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
  targetLanguage?: PromptLanguage;
  addQualityTags?: boolean;
  customEnhancements?: string[];
};

export type EnhancedMusicPrompt = {
  originalPrompt: string;
  enhancedPrompt: string;
  language: PromptLanguage;
  style?: string;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
  enhancements: string[];
};

const QUALITY_TAGS = [
  "high quality production",
  "professional mix",
  "mastered",
  "studio quality",
];

const MOOD_PROMPTS: Record<MusicMood, string> = {
  happy: "happy, uplifting, bright",
  sad: "sad, melancholic, emotional",
  epic: "epic, grand, heroic",
  relaxed: "relaxed, calm, peaceful",
  energetic: "energetic, driving, powerful",
  dark: "dark, ominous, tense",
  romantic: "romantic, tender, warm",
  mysterious: "mysterious, enigmatic, atmospheric",
};

const TEMPO_BPM: Record<MusicTempo, string> = {
  slow: "slow tempo around 70 bpm",
  medium: "medium tempo around 100 bpm",
  fast: "fast tempo around 130 bpm",
  "very-fast": "very fast tempo around 160 bpm",
};

const SIMPLE_ZH_TO_EN_MAP: Record<string, string> = {
  "钢琴": "piano",
  "吉他": "guitar",
  "小提琴": "violin",
  "大提琴": "cello",
  "鼓": "drums",
  "萨克斯": "saxophone",
  "电子": "electronic",
  "流行": "pop",
  "古典": "classical",
  "爵士": "jazz",
  "民谣": "folk",
  "摇滚": "rock",
  "悲伤": "sad",
  "快乐": "happy",
  "史诗": "epic",
  "舒缓": "relaxed",
  "激昂": "energetic",
  "浪漫": "romantic",
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
      `[MusicPromptEngineering] ${remainingChinese} Chinese characters remain after basic translation`,
    );
  }

  return translated;
}

export function enhancePrompt(
  prompt: string,
  options: MusicPromptEnhanceOptions = {},
): EnhancedMusicPrompt {
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

  const mood = options.mood || options.style
    ? undefined
    : undefined;
  if (options.mood) {
    const moodStr = MOOD_PROMPTS[options.mood];
    if (moodStr) {
      currentPrompt = `${currentPrompt}, ${moodStr}`;
      enhancements.push(`mood: ${options.mood}`);
    }
  }

  if (options.tempo) {
    const tempoStr = TEMPO_BPM[options.tempo];
    if (tempoStr) {
      currentPrompt = `${currentPrompt}, ${tempoStr}`;
      enhancements.push(`tempo: ${options.tempo}`);
    }
  }

  if (options.instruments && options.instruments.length > 0) {
    const instrStr = options.instruments.join(", ");
    currentPrompt = `${currentPrompt}, featuring ${instrStr}`;
    enhancements.push("instruments added");
  }

  if (options.addQualityTags) {
    currentPrompt = `${currentPrompt}, ${QUALITY_TAGS.join(", ")}`;
    enhancements.push("quality tags added");
  }

  if (options.customEnhancements && options.customEnhancements.length > 0) {
    currentPrompt = `${currentPrompt}, ${options.customEnhancements.join(", ")}`;
    enhancements.push("custom enhancements added");
  }

  // mood is captured but unused above to keep API surface clean
  void mood;

  return {
    originalPrompt: prompt,
    enhancedPrompt: currentPrompt,
    language,
    style: options.style,
    mood: options.mood,
    tempo: options.tempo,
    instruments: options.instruments,
    enhancements,
  };
}

export function buildPromptFromParts(parts: {
  subject?: string;
  style?: string;
  mood?: MusicMood;
  tempo?: MusicTempo;
  instruments?: string[];
  setting?: string;
}): string {
  const components: string[] = [];

  if (parts.subject) components.push(parts.subject);
  if (parts.setting) components.push(parts.setting);
  if (parts.style) components.push(parts.style);
  if (parts.mood && MOOD_PROMPTS[parts.mood]) {
    components.push(MOOD_PROMPTS[parts.mood]);
  }
  if (parts.tempo && TEMPO_BPM[parts.tempo]) {
    components.push(TEMPO_BPM[parts.tempo]);
  }
  if (parts.instruments && parts.instruments.length > 0) {
    components.push(`featuring ${parts.instruments.join(", ")}`);
  }

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

  const moodPrefixes: MusicMood[] = [
    "happy",
    "epic",
    "relaxed",
    "energetic",
    "romantic",
  ];

  let idx = 0;
  while (variations.length < count) {
    let variation = basePrompt;

    if (idx < moodPrefixes.length) {
      const mood = moodPrefixes[idx];
      variation = `${MOOD_PROMPTS[mood]}, ${variation}`;
      idx++;
    } else {
      variation = `${variation}, professional production`;
    }

    variations.push(variation);

    if (variations.length >= count) break;
  }

  return variations.slice(0, count);
}
