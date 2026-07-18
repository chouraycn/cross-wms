/**
 * Image Style Presets — 图像风格预设
 *
 * 提供常用的图像风格预设，包括写实、动漫、插画、3D、赛博朋克等。
 */

export type ImageStyleCategory =
  | "realistic"
  | "anime"
  | "illustration"
  | "3d"
  | "cyberpunk"
  | "artistic"
  | "design";

export type ImageStylePreset = {
  id: string;
  label: string;
  category: ImageStyleCategory;
  prompt: string;
  negativePrompt?: string;
  description?: string;
  aliases?: string[];
  tags?: string[];
};

const STYLE_PRESETS: ImageStylePreset[] = [
  {
    id: "realistic-photo",
    label: "写实照片",
    category: "realistic",
    prompt: "photorealistic, ultra detailed, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3",
    negativePrompt: "cartoon, anime, illustration, painting, drawing, 3d render, cgi",
    description: "真实照片风格，高细节、高清晰度",
    aliases: ["photo", "photorealistic", "realistic", "写实", "照片"],
    tags: ["realistic", "photo", "high-detail"],
  },
  {
    id: "realistic-portrait",
    label: "写实人像",
    category: "realistic",
    prompt: "portrait photography, 85mm lens, f/1.8, beautiful lighting, sharp focus, professional photography",
    negativePrompt: "cartoon, anime, illustration, deformed, blurry, bad anatomy",
    description: "专业人像摄影风格",
    aliases: ["portrait", "人像"],
    tags: ["realistic", "portrait", "photography"],
  },
  {
    id: "realistic-landscape",
    label: "写实风景",
    category: "realistic",
    prompt: "landscape photography, golden hour, beautiful scenery, ultra detailed, wide angle, HDR",
    negativePrompt: "cartoon, anime, illustration, painting",
    description: "风景摄影风格",
    aliases: ["landscape", "风景"],
    tags: ["realistic", "landscape", "photography"],
  },
  {
    id: "anime-style",
    label: "动漫风格",
    category: "anime",
    prompt: "anime style, anime key visual, highly detailed, vibrant colors, cel shading, anime aesthetic",
    negativePrompt: "realistic, photo, 3d render, photorealistic",
    description: "标准动漫风格",
    aliases: ["anime", "manga", "动漫", "漫画"],
    tags: ["anime", "illustration", "vibrant"],
  },
  {
    id: "anime-ghibli",
    label: "吉卜力风格",
    category: "anime",
    prompt: "Studio Ghibli style, Hayao Miyazaki, whimsical, detailed background, soft lighting, warm colors, hand drawn",
    negativePrompt: "realistic, photo, 3d render, photorealistic, cgi",
    description: "吉卜力工作室风格",
    aliases: ["ghibli", "miyazaki", "吉卜力"],
    tags: ["anime", "ghibli", "whimsical"],
  },
  {
    id: "anime-cyberpunk",
    label: "赛博朋克动漫",
    category: "anime",
    prompt: "cyberpunk anime, neon lights, futuristic city, night scene, rain, reflections, anime style",
    negativePrompt: "realistic, photo, 3d render",
    description: "赛博朋克风格动漫",
    aliases: ["cyberpunk-anime"],
    tags: ["anime", "cyberpunk", "neon"],
  },
  {
    id: "illustration-flat",
    label: "扁平插画",
    category: "illustration",
    prompt: "flat illustration, vector style, clean lines, simple shapes, bold colors, minimal design",
    negativePrompt: "realistic, photo, 3d render, detailed, photorealistic",
    description: "扁平化插画风格",
    aliases: ["flat", "flat-design", "扁平", "扁平化"],
    tags: ["illustration", "flat", "minimal"],
  },
  {
    id: "illustration-watercolor",
    label: "水彩插画",
    category: "illustration",
    prompt: "watercolor painting, soft edges, translucent colors, paper texture, artistic, hand painted",
    negativePrompt: "realistic, photo, 3d render, digital",
    description: "水彩画风格",
    aliases: ["watercolor", "水彩"],
    tags: ["illustration", "watercolor", "artistic"],
  },
  {
    id: "illustration-oil-painting",
    label: "油画风格",
    category: "illustration",
    prompt: "oil painting, classical art, detailed brushwork, rich colors, masterpiece, fine art",
    negativePrompt: "realistic, photo, 3d render, digital",
    description: "古典油画风格",
    aliases: ["oil-painting", "油画"],
    tags: ["illustration", "oil-painting", "artistic"],
  },
  {
    id: "illustration-concept-art",
    label: "概念艺术",
    category: "illustration",
    prompt: "concept art, digital painting, highly detailed, dramatic lighting, epic, cinematic",
    negativePrompt: "cartoon, simple, flat",
    description: "游戏/电影概念艺术风格",
    aliases: ["concept-art", "概念设计"],
    tags: ["illustration", "concept-art", "cinematic"],
  },
  {
    id: "3d-pixar",
    label: "皮克斯 3D",
    category: "3d",
    prompt: "3d render, Pixar style, Disney style, cute characters, high quality, soft lighting, cartoon 3d",
    negativePrompt: "realistic, photo, 2d, anime",
    description: "皮克斯风格 3D 渲染",
    aliases: ["pixar", "disney-3d", "皮克斯"],
    tags: ["3d", "pixar", "cartoon"],
  },
  {
    id: "3d-realistic",
    label: "写实 3D",
    category: "3d",
    prompt: "3d render, octane render, ultra realistic, photorealistic 3d, high detail, cinematic lighting",
    negativePrompt: "cartoon, anime, 2d, illustration",
    description: "写实级 3D 渲染",
    aliases: ["3d-render", "octane", "3d渲染"],
    tags: ["3d", "realistic", "cinematic"],
  },
  {
    id: "3d-low-poly",
    label: "低多边形",
    category: "3d",
    prompt: "low poly style, low poly art, geometric shapes, minimal, simple, 3d render",
    negativePrompt: "realistic, detailed, high poly, photorealistic",
    description: "低多边形艺术风格",
    aliases: ["low-poly", "低多边形"],
    tags: ["3d", "low-poly", "minimal"],
  },
  {
    id: "3d-isometric",
    label: "等轴测 3D",
    category: "3d",
    prompt: "isometric view, 3d isometric, tiny world, detailed, diorama, cute, 3d render",
    negativePrompt: "realistic, first person, wide angle",
    description: "等轴测视图风格",
    aliases: ["isometric", "等距", "等轴测"],
    tags: ["3d", "isometric", "cute"],
  },
  {
    id: "cyberpunk-neon",
    label: "赛博朋克霓虹",
    category: "cyberpunk",
    prompt: "cyberpunk, neon lights, futuristic, dystopian, city at night, rain, reflections, holograms",
    negativePrompt: "daylight, nature, rural, simple",
    description: "经典赛博朋克霓虹风格",
    aliases: ["cyberpunk", "neon", "赛博朋克", "霓虹"],
    tags: ["cyberpunk", "neon", "futuristic"],
  },
  {
    id: "cyberpunk-synthwave",
    label: "合成波复古",
    category: "cyberpunk",
    prompt: "synthwave, retrowave, 80s aesthetic, neon grid, sunset, retro futurism, outrun style",
    negativePrompt: "modern, realistic, photo",
    description: "80 年代合成波复古风格",
    aliases: ["synthwave", "retrowave", "outrun", "合成波"],
    tags: ["cyberpunk", "synthwave", "retro"],
  },
  {
    id: "artistic-van-gogh",
    label: "梵高风格",
    category: "artistic",
    prompt: "Vincent van Gogh style, post-impressionism, swirling brushstrokes, vibrant colors, starry night style",
    negativePrompt: "realistic, photo, 3d render, photorealistic",
    description: "梵高后印象派风格",
    aliases: ["van-gogh", "梵高"],
    tags: ["artistic", "painting", "impressionism"],
  },
  {
    id: "artistic-pixel-art",
    label: "像素艺术",
    category: "artistic",
    prompt: "pixel art, 16-bit style, retro game art, sprites, detailed pixel art, nostalgic",
    negativePrompt: "realistic, photo, 3d render, high resolution",
    description: "复古像素艺术风格",
    aliases: ["pixel-art", "pixel", "像素", "像素画"],
    tags: ["artistic", "pixel", "retro"],
  },
  {
    id: "artistic-stained-glass",
    label: "彩色玻璃",
    category: "artistic",
    prompt: "stained glass style, cathedral window, colorful, intricate patterns, backlit, beautiful",
    negativePrompt: "realistic, photo, 3d render",
    description: "教堂彩色玻璃风格",
    aliases: ["stained-glass", "彩色玻璃"],
    tags: ["artistic", "stained-glass", "decorative"],
  },
  {
    id: "design-minimalist",
    label: "极简设计",
    category: "design",
    prompt: "minimalist design, clean, simple, elegant, negative space, modern design, white background",
    negativePrompt: "cluttered, busy, complex, detailed",
    description: "极简主义设计风格",
    aliases: ["minimal", "minimalist", "极简"],
    tags: ["design", "minimal", "clean"],
  },
  {
    id: "design-product-photo",
    label: "产品摄影",
    category: "design",
    prompt: "product photography, studio lighting, clean background, professional, commercial photography, high end",
    negativePrompt: "cartoon, anime, illustration, casual",
    description: "专业产品摄影风格",
    aliases: ["product-photo", "commercial", "产品摄影"],
    tags: ["design", "product", "photography"],
  },
  {
    id: "design-ui-mockup",
    label: "UI 设计稿",
    category: "design",
    prompt: "UI design, mobile app design, clean interface, modern UI, Figma style, dribbble, user interface",
    negativePrompt: "realistic, photo, messy",
    description: "现代 UI 设计风格",
    aliases: ["ui-design", "app-design", "界面设计"],
    tags: ["design", "ui", "modern"],
  },
];

export function listStylePresets(category?: ImageStyleCategory): ImageStylePreset[] {
  if (category) {
    return STYLE_PRESETS.filter((p) => p.category === category);
  }
  return [...STYLE_PRESETS];
}

export function getStylePreset(idOrAlias: string): ImageStylePreset | undefined {
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

export function applyStyleToPrompt(prompt: string, styleId: string): {
  enhancedPrompt: string;
  negativePrompt?: string;
  style: ImageStylePreset;
} {
  const style = getStylePreset(styleId);
  if (!style) {
    return { enhancedPrompt: prompt, style: {
      id: "none",
      label: "无",
      category: "design",
      prompt: "",
    }};
  }

  const enhancedPrompt = `${prompt}, ${style.prompt}`;
  return {
    enhancedPrompt,
    negativePrompt: style.negativePrompt,
    style,
  };
}

export function listStyleCategories(): { id: ImageStyleCategory; label: string; description: string }[] {
  return [
    { id: "realistic", label: "写实", description: "真实照片风格，包括人像、风景等" },
    { id: "anime", label: "动漫", description: "动漫风格，包括日本动漫、吉卜力等" },
    { id: "illustration", label: "插画", description: "插画风格，包括水彩、油画、概念艺术等" },
    { id: "3d", label: "3D", description: "3D 渲染风格，包括皮克斯、写实 3D 等" },
    { id: "cyberpunk", label: "赛博朋克", description: "赛博朋克风格，包括霓虹、合成波等" },
    { id: "artistic", label: "艺术", description: "艺术风格，包括梵高、像素艺术等" },
    { id: "design", label: "设计", description: "设计风格，包括极简、产品摄影等" },
  ];
}

export function searchStylePresets(query: string): ImageStylePreset[] {
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
