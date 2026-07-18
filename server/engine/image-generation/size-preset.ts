/**
 * Image Size Presets — 图像尺寸预设
 *
 * 提供常用的图像尺寸预设，包括方形、竖屏、横屏、壁纸等。
 */

export type ImageSizeCategory =
  | "square"
  | "portrait"
  | "landscape"
  | "wallpaper"
  | "social"
  | "print";

export type ImageSizePreset = {
  id: string;
  label: string;
  category: ImageSizeCategory;
  width: number;
  height: number;
  aspectRatio: string;
  description?: string;
  aliases?: string[];
};

const SIZE_PRESETS: ImageSizePreset[] = [
  {
    id: "square-512",
    label: "方形 512",
    category: "square",
    width: 512,
    height: 512,
    aspectRatio: "1:1",
    description: "标准方形小尺寸",
    aliases: ["512x512", "512*512", "small-square"],
  },
  {
    id: "square-768",
    label: "方形 768",
    category: "square",
    width: 768,
    height: 768,
    aspectRatio: "1:1",
    description: "方形中等尺寸",
    aliases: ["768x768", "768*768"],
  },
  {
    id: "square-1024",
    label: "方形 1024",
    category: "square",
    width: 1024,
    height: 1024,
    aspectRatio: "1:1",
    description: "标准方形高清尺寸",
    aliases: ["1024x1024", "1024*1024", "square", "square-hd"],
  },
  {
    id: "square-1440",
    label: "方形 1440",
    category: "square",
    width: 1440,
    height: 1440,
    aspectRatio: "1:1",
    description: "方形超清尺寸",
    aliases: ["1440x1440", "1440*1440"],
  },
  {
    id: "portrait-720x1280",
    label: "竖屏 720x1280",
    category: "portrait",
    width: 720,
    height: 1280,
    aspectRatio: "9:16",
    description: "手机竖屏标准尺寸",
    aliases: ["720*1280", "portrait", "mobile-portrait", "9:16"],
  },
  {
    id: "portrait-768x1344",
    label: "竖屏 768x1344",
    category: "portrait",
    width: 768,
    height: 1344,
    aspectRatio: "9:16",
    description: "AI 生成常用竖屏尺寸",
    aliases: ["768*1344"],
  },
  {
    id: "portrait-720x1440",
    label: "竖屏 720x1440",
    category: "portrait",
    width: 720,
    height: 1440,
    aspectRatio: "1:2",
    description: "长竖屏尺寸",
    aliases: ["720*1440", "tall-portrait"],
  },
  {
    id: "landscape-1280x720",
    label: "横屏 1280x720",
    category: "landscape",
    width: 1280,
    height: 720,
    aspectRatio: "16:9",
    description: "高清横屏标准尺寸",
    aliases: ["1280*720", "landscape", "hd", "16:9"],
  },
  {
    id: "landscape-1344x768",
    label: "横屏 1344x768",
    category: "landscape",
    width: 1344,
    height: 768,
    aspectRatio: "16:9",
    description: "AI 生成常用横屏尺寸",
    aliases: ["1344*768"],
  },
  {
    id: "landscape-1440x720",
    label: "横屏 1440x720",
    category: "landscape",
    width: 1440,
    height: 720,
    aspectRatio: "2:1",
    description: "宽横屏尺寸",
    aliases: ["1440*720", "wide-landscape"],
  },
  {
    id: "landscape-1920x1080",
    label: "横屏 1920x1080",
    category: "landscape",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    description: "全高清横屏尺寸",
    aliases: ["1920*1080", "fhd", "full-hd"],
  },
  {
    id: "wallpaper-desktop-1920x1080",
    label: "桌面壁纸 1080p",
    category: "wallpaper",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    description: "桌面壁纸标准尺寸",
    aliases: ["wallpaper", "desktop-wallpaper", "1080p"],
  },
  {
    id: "wallpaper-desktop-2560x1440",
    label: "桌面壁纸 2K",
    category: "wallpaper",
    width: 2560,
    height: 1440,
    aspectRatio: "16:9",
    description: "2K 桌面壁纸尺寸",
    aliases: ["2k-wallpaper", "qhd"],
  },
  {
    id: "wallpaper-desktop-3840x2160",
    label: "桌面壁纸 4K",
    category: "wallpaper",
    width: 3840,
    height: 2160,
    aspectRatio: "16:9",
    description: "4K 超清桌面壁纸尺寸",
    aliases: ["4k-wallpaper", "uhd"],
  },
  {
    id: "wallpaper-phone-1170x2532",
    label: "手机壁纸",
    category: "wallpaper",
    width: 1170,
    height: 2532,
    aspectRatio: "9:19.5",
    description: "手机壁纸尺寸",
    aliases: ["phone-wallpaper", "mobile-wallpaper"],
  },
  {
    id: "social-instagram-square",
    label: "Instagram 方形",
    category: "social",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    description: "Instagram 方形帖子",
    aliases: ["instagram", "ig-square"],
  },
  {
    id: "social-instagram-portrait",
    label: "Instagram 竖屏",
    category: "social",
    width: 1080,
    height: 1350,
    aspectRatio: "4:5",
    description: "Instagram 竖屏帖子",
    aliases: ["ig-portrait", "4:5"],
  },
  {
    id: "social-instagram-story",
    label: "Instagram Story",
    category: "social",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    description: "Instagram Story 尺寸",
    aliases: ["ig-story", "instagram-story"],
  },
  {
    id: "social-twitter-post",
    label: "Twitter 帖子",
    category: "social",
    width: 1200,
    height: 675,
    aspectRatio: "16:9",
    description: "Twitter/X 帖子图片",
    aliases: ["twitter", "x-post"],
  },
  {
    id: "social-wechat-moment",
    label: "朋友圈",
    category: "social",
    width: 1080,
    height: 1080,
    aspectRatio: "1:1",
    description: "微信朋友圈图片",
    aliases: ["wechat", "wechat-moment", "pengyouquan"],
  },
  {
    id: "social-xiaohongshu",
    label: "小红书",
    category: "social",
    width: 1080,
    height: 1440,
    aspectRatio: "3:4",
    description: "小红书竖版图片",
    aliases: ["xiaohongshu", "xhs", "3:4"],
  },
  {
    id: "print-a4-portrait",
    label: "A4 竖版",
    category: "print",
    width: 2480,
    height: 3508,
    aspectRatio: "1:1.414",
    description: "A4 打印尺寸 (300dpi)",
    aliases: ["a4", "a4-portrait"],
  },
  {
    id: "print-a4-landscape",
    label: "A4 横版",
    category: "print",
    width: 3508,
    height: 2480,
    aspectRatio: "1.414:1",
    description: "A4 横版打印尺寸 (300dpi)",
    aliases: ["a4-landscape"],
  },
];

export function listSizePresets(category?: ImageSizeCategory): ImageSizePreset[] {
  if (category) {
    return SIZE_PRESETS.filter((p) => p.category === category);
  }
  return [...SIZE_PRESETS];
}

export function getSizePreset(idOrAlias: string): ImageSizePreset | undefined {
  if (!idOrAlias) return undefined;
  const normalized = idOrAlias.trim().toLowerCase();

  for (const preset of SIZE_PRESETS) {
    if (preset.id.toLowerCase() === normalized) {
      return preset;
    }
    if (preset.aliases?.some((a) => a.toLowerCase() === normalized)) {
      return preset;
    }
  }

  return undefined;
}

export function parseSizeString(size: string): { width: number; height: number } | null {
  if (!size || typeof size !== "string") return null;

  const trimmed = size.trim().toLowerCase();

  const preset = getSizePreset(trimmed);
  if (preset) {
    return { width: preset.width, height: preset.height };
  }

  const patterns = [
    /^(\d+)\s*[xX*]\s*(\d+)$/,
    /^(\d+)\s*[:]\s*(\d+)$/,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const width = parseInt(match[1], 10);
      const height = parseInt(match[2], 10);
      if (width > 0 && height > 0) {
        return { width, height };
      }
    }
  }

  return null;
}

export function formatSizeString(width: number, height: number, separator: string = "*"): string {
  return `${width}${separator}${height}`;
}

export function getAspectRatio(width: number, height: number): string {
  function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
  }

  const divisor = gcd(width, height);
  const w = width / divisor;
  const h = height / divisor;

  return `${w}:${h}`;
}

export function getClosestSizePreset(
  width: number,
  height: number,
  category?: ImageSizeCategory,
): ImageSizePreset | undefined {
  const presets = listSizePresets(category);
  if (presets.length === 0) return undefined;

  let closest: ImageSizePreset | undefined;
  let minDiff = Infinity;

  for (const preset of presets) {
    const diff = Math.abs(preset.width - width) + Math.abs(preset.height - height);
    if (diff < minDiff) {
      minDiff = diff;
      closest = preset;
    }
  }

  return closest;
}

export function listSizeCategories(): { id: ImageSizeCategory; label: string; description: string }[] {
  return [
    { id: "square", label: "方形", description: "正方形图片，适合头像、图标等" },
    { id: "portrait", label: "竖屏", description: "竖屏图片，适合手机阅读" },
    { id: "landscape", label: "横屏", description: "横屏图片，适合网页、演示" },
    { id: "wallpaper", label: "壁纸", description: "桌面和手机壁纸尺寸" },
    { id: "social", label: "社交媒体", description: "各社交平台推荐尺寸" },
    { id: "print", label: "打印", description: "打印输出标准尺寸" },
  ];
}
