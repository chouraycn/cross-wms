/**
 * Video Style Presets — 视频风格预设
 *
 * 提供常用视频风格预设（写实/动画/电影/短视频等）。
 */

import type { VideoStyle } from "./types.js";

export type VideoStylePreset = {
  id: string;
  label: string;
  category: VideoStyle;
  prompt: string;
  description?: string;
  aliases?: string[];
  tags?: string[];
};

const STYLE_PRESETS: VideoStylePreset[] = [
  {
    id: "realistic-cinematic",
    label: "写实电影",
    category: "realistic",
    prompt: "cinematic, photorealistic, 8k, dslr, shallow depth of field, film grain",
    description: "电影质感的写实风格",
    aliases: ["cinematic", "电影", "写实电影"],
    tags: ["realistic", "cinematic", "photorealistic"],
  },
  {
    id: "realistic-documentary",
    label: "写实纪录片",
    category: "realistic",
    prompt: "documentary style, natural lighting, handheld camera, realistic, observational",
    description: "纪录片风格的写实画面",
    aliases: ["documentary", "纪录片"],
    tags: ["realistic", "documentary"],
  },
  {
    id: "animation-3d-cartoon",
    label: "3D 卡通动画",
    category: "animation",
    prompt: "3d animation, Pixar style, vibrant colors, cartoon characters, smooth motion",
    description: "皮克斯风格的 3D 卡通动画",
    aliases: ["3d-cartoon", "卡通", "3d-animation"],
    tags: ["animation", "3d", "cartoon"],
  },
  {
    id: "animation-2d",
    label: "2D 动画",
    category: "animation",
    prompt: "2d animation, hand drawn, anime aesthetic, cel shading, vibrant colors",
    description: "2D 手绘动画风格",
    aliases: ["2d", "2d-animation"],
    tags: ["animation", "2d", "hand-drawn"],
  },
  {
    id: "cinematic-blockbuster",
    label: "商业大片",
    category: "cinematic",
    prompt: "epic cinematic blockbuster, dramatic lighting, sweeping camera, action movie, IMAX",
    description: "史诗级别的商业电影感",
    aliases: ["blockbuster", "大片"],
    tags: ["cinematic", "epic", "blockbuster"],
  },
  {
    id: "cinematic-noir",
    label: "黑色电影",
    category: "cinematic",
    prompt: "film noir, black and white, dramatic shadows, smoke, vintage, mystery",
    description: "经典黑色电影风格",
    aliases: ["noir", "黑色"],
    tags: ["cinematic", "noir", "vintage"],
  },
  {
    id: "short-video-tiktok",
    label: "短视频",
    category: "short-video",
    prompt: "vertical short video, fast cuts, dynamic, mobile-first, energetic, trending",
    description: "适合 TikTok/抖音的竖屏短视频",
    aliases: ["tiktok", "短视频", "vertical"],
    tags: ["short-video", "vertical", "fast"],
  },
  {
    id: "short-video-product",
    label: "产品短视频",
    category: "short-video",
    prompt: "product showcase, rotating, studio lighting, clean background, commercial",
    description: "产品展示类短视频",
    aliases: ["product", "产品"],
    tags: ["short-video", "product", "commercial"],
  },
  {
    id: "anime-japanese",
    label: "日漫风格",
    category: "anime",
    prompt: "japanese anime, anime key visual, highly detailed, vibrant, cel shading",
    description: "标准日式动漫风格",
    aliases: ["anime", "日漫", "manga"],
    tags: ["anime", "japanese"],
  },
  {
    id: "3d-realistic-render",
    label: "写实 3D",
    category: "3d",
    prompt: "3d render, octane render, photorealistic 3d, ultra detailed, cinematic lighting",
    description: "写实级 3D 渲染",
    aliases: ["3d-realistic", "3d-render"],
    tags: ["3d", "realistic", "render"],
  },
  {
    id: "artistic-watercolor",
    label: "水彩动画",
    category: "artistic",
    prompt: "watercolor animation, flowing paint, soft edges, artistic, hand painted",
    description: "水彩画风动画",
    aliases: ["watercolor", "水彩"],
    tags: ["artistic", "watercolor"],
  },
];

export function listStylePresets(category?: VideoStyle): VideoStylePreset[] {
  if (category) {
    return STYLE_PRESETS.filter((p) => p.category === category);
  }
  return [...STYLE_PRESETS];
}

export function getStylePreset(idOrAlias: string): VideoStylePreset | undefined {
  if (!idOrAlias) return undefined;
  const normalized = idOrAlias.trim().toLowerCase();

  for (const preset of STYLE_PRESETS) {
    if (preset.id.toLowerCase() === normalized) {
      return preset;
    }
    if (preset.aliases?.some((a) => a.toLowerCase() === normalized)) {
      return preset;
    }
  }

  return undefined;
}

export function applyStyleToPrompt(
  prompt: string,
  styleId: string,
): {
  enhancedPrompt: string;
  style: VideoStylePreset;
} {
  const style = getStylePreset(styleId);
  if (!style) {
    return {
      enhancedPrompt: prompt,
      style: {
        id: "none",
        label: "无",
        category: "realistic",
        prompt: "",
      },
    };
  }

  const enhancedPrompt = style.prompt ? `${prompt}, ${style.prompt}` : prompt;
  return {
    enhancedPrompt,
    style,
  };
}

export function listStyleCategories(): {
  id: VideoStyle;
  label: string;
  description: string;
}[] {
  return [
    { id: "realistic", label: "写实", description: "电影/纪录片风格的写实画面" },
    { id: "animation", label: "动画", description: "2D/3D 动画风格" },
    { id: "cinematic", label: "电影", description: "商业大片与黑色电影风格" },
    { id: "short-video", label: "短视频", description: "短视频/产品展示风格" },
    { id: "anime", label: "动漫", description: "日式动漫风格" },
    { id: "3d", label: "3D", description: "3D 渲染风格" },
    { id: "artistic", label: "艺术", description: "艺术化风格" },
  ];
}

export function searchStylePresets(query: string): VideoStylePreset[] {
  if (!query) return listStylePresets();
  const normalized = query.trim().toLowerCase();

  return STYLE_PRESETS.filter((preset) => {
    if (preset.id.toLowerCase().includes(normalized)) return true;
    if (preset.label.toLowerCase().includes(normalized)) return true;
    if (preset.aliases?.some((a) => a.toLowerCase().includes(normalized))) return true;
    if (preset.tags?.some((t) => t.toLowerCase().includes(normalized))) return true;
    if (preset.description?.toLowerCase().includes(normalized)) return true;
    return false;
  });
}
