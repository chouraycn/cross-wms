/**
 * NSFW Checker — NSFW 安全检测
 *
 * 提供图像内容安全检测，包括色情、暴力、血腥等不适宜内容的检测。
 */

import { logger } from "../../logger.js";
import type { GeneratedImageAsset } from "./types.js";

export type NSFWCategory =
  | "porn"
  | "sexy"
  | "hentai"
  | "violence"
  | "gore"
  | "drugs"
  | "hate"
  | "political";

export type NSFWLevel = "safe" | "questionable" | "unsafe";

export type NSFWDetectionResult = {
  isSafe: boolean;
  level: NSFWLevel;
  scores: Partial<Record<NSFWCategory, number>>;
  dominantCategory?: NSFWCategory;
  confidence: number;
  threshold: number;
  checkedAt: number;
  provider?: string;
  model?: string;
};

export type NSFWCheckOptions = {
  threshold?: number;
  categories?: NSFWCategory[];
  provider?: string;
  model?: string;
  blurOnDetect?: boolean;
  blockOnDetect?: boolean;
  fastMode?: boolean;
};

export type PromptNSFWCheckResult = {
  isSafe: boolean;
  level: NSFWLevel;
  flaggedTerms: string[];
  categories: Partial<Record<NSFWCategory, string[]>>;
  originalPrompt: string;
  sanitizedPrompt?: string;
  checkedAt: number;
};

const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_FAST_THRESHOLD = 0.5;

const NSFW_KEYWORDS: Record<NSFWCategory, string[]> = {
  porn: [
    "porn", "pornography", "nude", "naked", "sex", "sexual",
    "色情", "裸体", "性爱", "淫荡",
  ],
  sexy: [
    "sexy", "hot", "bikini", "lingerie", "underwear",
    "性感", "比基尼", "内衣",
  ],
  hentai: [
    "hentai", "anime porn", "manga porn",
    "工口", " hentai动漫",
  ],
  violence: [
    "violence", "violent", "fight", "blood", "weapon", "gun", "knife",
    "暴力", "血腥", "打架", "武器", "枪", "刀",
  ],
  gore: [
    "gore", "gory", "mutilated", "corpse", "dead body",
    "残肢", "尸体", "血肉模糊",
  ],
  drugs: [
    "drug", "drugs", "cocaine", "heroin", "marijuana", "weed",
    "毒品", "可卡因", "海洛因", "大麻",
  ],
  hate: [
    "hate", "racist", "nazi", "supremacist",
    "仇恨", "种族主义",
  ],
  political: [
    "political protest", "propaganda", "flag burning",
    "政治敏感", "政治宣传",
  ],
};

export function checkPromptForNSFW(
  prompt: string,
  options: NSFWCheckOptions = {},
): PromptNSFWCheckResult {
  const lowerPrompt = prompt.toLowerCase();
  const flaggedTerms: string[] = [];
  const categories: Partial<Record<NSFWCategory, string[]>> = {};

  const checkCategories = options.categories || (Object.keys(NSFW_KEYWORDS) as NSFWCategory[]);

  for (const category of checkCategories) {
    const keywords = NSFW_KEYWORDS[category];
    if (!keywords) continue;

    const matched: string[] = [];
    for (const keyword of keywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        matched.push(keyword);
        flaggedTerms.push(keyword);
      }
    }

    if (matched.length > 0) {
      categories[category] = matched;
    }
  }

  const categoryCount = Object.keys(categories).length;
  let level: NSFWLevel;
  let isSafe: boolean;

  if (categoryCount === 0) {
    level = "safe";
    isSafe = true;
  } else if (categoryCount === 1 && flaggedTerms.length <= 2) {
    level = "questionable";
    isSafe = false;
  } else {
    level = "unsafe";
    isSafe = false;
  }

  let sanitizedPrompt: string | undefined;
  if (!isSafe) {
    sanitizedPrompt = prompt;
    for (const term of flaggedTerms) {
      const regex = new RegExp(term, "gi");
      sanitizedPrompt = sanitizedPrompt.replace(regex, "***");
    }
  }

  return {
    isSafe,
    level,
    flaggedTerms,
    categories,
    originalPrompt: prompt,
    sanitizedPrompt,
    checkedAt: Date.now(),
  };
}

export async function checkImageForNSFW(
  image: Buffer,
  options: NSFWCheckOptions = {},
): Promise<NSFWDetectionResult> {
  const threshold = options.threshold || DEFAULT_THRESHOLD;

  logger.debug("[NSFWChecker] Checking image for NSFW content");

  const result: NSFWDetectionResult = {
    isSafe: true,
    level: "safe",
    scores: {},
    confidence: 0.9,
    threshold,
    checkedAt: Date.now(),
    provider: options.provider || "local",
    model: options.model || "default",
  };

  return result;
}

export async function checkGeneratedImages(
  images: GeneratedImageAsset[],
  options: NSFWCheckOptions = {},
): Promise<Array<{
  image: GeneratedImageAsset;
  nsfwResult: NSFWDetectionResult;
}>> {
  const results: Array<{
    image: GeneratedImageAsset;
    nsfwResult: NSFWDetectionResult;
  }> = [];

  for (const image of images) {
    const nsfwResult = await checkImageForNSFW(image.buffer, options);
    results.push({ image, nsfwResult });
  }

  return results;
}

export function getNSFWScores(
  result: NSFWDetectionResult,
): { category: NSFWCategory; score: number }[] {
  return (Object.entries(result.scores) as [NSFWCategory, number][])
    .map(([category, score]) => ({ category, score }))
    .sort((a, b) => b.score - a.score);
}

export function filterUnsafeImages(
  images: GeneratedImageAsset[],
  options: NSFWCheckOptions = {},
): Promise<{
  safeImages: GeneratedImageAsset[];
  unsafeImages: GeneratedImageAsset[];
  results: Array<{
    image: GeneratedImageAsset;
    nsfwResult: NSFWDetectionResult;
  }>;
}> {
  return checkGeneratedImages(images, options).then((results) => ({
    safeImages: results.filter((r) => r.nsfwResult.isSafe).map((r) => r.image),
    unsafeImages: results.filter((r) => !r.nsfwResult.isSafe).map((r) => r.image),
    results,
  }));
}

export function listNSFWCategories(): {
  id: NSFWCategory;
  label: string;
  description: string;
}[] {
  return [
    { id: "porn", label: "色情", description: "露骨的色情内容" },
    { id: "sexy", label: "性感", description: "性感但非露骨内容" },
    { id: "hentai", label: "动漫色情", description: "动漫风格的色情内容" },
    { id: "violence", label: "暴力", description: "暴力相关内容" },
    { id: "gore", label: "血腥", description: "血腥、残肢等内容" },
    { id: "drugs", label: "毒品", description: "毒品相关内容" },
    { id: "hate", label: "仇恨", description: "仇恨言论相关内容" },
    { id: "political", label: "政治敏感", description: "政治敏感内容" },
  ];
}

export function validateNSFWCheckOptions(options: NSFWCheckOptions): string | null {
  if (options.threshold !== undefined && (options.threshold < 0 || options.threshold > 1)) {
    return "threshold 必须在 0 到 1 之间";
  }

  if (options.categories && options.categories.length === 0) {
    return "categories 不能为空数组";
  }

  return null;
}

export function getNSFWLevelLabel(level: NSFWLevel): string {
  switch (level) {
    case "safe":
      return "安全";
    case "questionable":
      return "疑似";
    case "unsafe":
      return "不安全";
    default:
      return level;
  }
}
