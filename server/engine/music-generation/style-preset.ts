/**
 * Music Style Presets — 音乐风格预设
 *
 * 提供常用音乐风格预设（古典/流行/电子/爵士/民族等）。
 */

import type { MusicMood, MusicStyle, MusicTempo } from "./types.js";

export type MusicStylePreset = {
  id: string;
  label: string;
  category: MusicStyle;
  prompt: string;
  defaultMood?: MusicMood;
  defaultTempo?: MusicTempo;
  defaultInstruments?: string[];
  description?: string;
  aliases?: string[];
  tags?: string[];
};

const STYLE_PRESETS: MusicStylePreset[] = [
  {
    id: "classical-orchestral",
    label: "古典管弦乐",
    category: "classical",
    prompt: "classical orchestral, symphony, strings, woodwinds, brass, grand, elegant",
    defaultMood: "epic",
    defaultTempo: "medium",
    defaultInstruments: ["violin", "cello", "piano", "flute", "trumpet"],
    description: "宏大优雅的古典管弦乐",
    aliases: ["classical", "orchestral", "古典", "管弦"],
    tags: ["classical", "orchestral", "elegant"],
  },
  {
    id: "classical-piano-solo",
    label: "古典钢琴独奏",
    category: "classical",
    prompt: "classical piano solo, melodic, expressive, romantic era, soft dynamics",
    defaultMood: "relaxed",
    defaultTempo: "slow",
    defaultInstruments: ["piano"],
    description: "浪漫主义风格的钢琴独奏",
    aliases: ["piano", "钢琴", "独奏"],
    tags: ["classical", "piano", "solo"],
  },
  {
    id: "pop-mainstream",
    label: "主流流行",
    category: "pop",
    prompt: "pop, catchy melody, verse-chorus structure, modern production, radio friendly",
    defaultMood: "happy",
    defaultTempo: "medium",
    defaultInstruments: ["vocals", "guitar", "bass", "drums", "synthesizer"],
    description: "电台友好型主流流行曲风",
    aliases: ["pop", "主流", "流行"],
    tags: ["pop", "mainstream", "catchy"],
  },
  {
    id: "pop-ballad",
    label: "流行抒情",
    category: "pop",
    prompt: "pop ballad, slow tempo, emotional vocals, piano accompaniment, dramatic build",
    defaultMood: "romantic",
    defaultTempo: "slow",
    defaultInstruments: ["vocals", "piano", "strings"],
    description: "情感饱满的流行抒情曲",
    aliases: ["ballad", "抒情", "ballad-pop"],
    tags: ["pop", "ballad", "emotional"],
  },
  {
    id: "electronic-edm",
    label: "电子舞曲",
    category: "electronic",
    prompt: "electronic dance music, EDM, four on the floor, heavy bass, synth lead, festival drop",
    defaultMood: "energetic",
    defaultTempo: "fast",
    defaultInstruments: ["synthesizer", "drum-machine", "bass-synth"],
    description: "高能量的电子舞曲",
    aliases: ["edm", "dance", "电子舞曲"],
    tags: ["electronic", "edm", "energetic"],
  },
  {
    id: "electronic-ambient",
    label: "电子环境",
    category: "electronic",
    prompt: "ambient electronic, atmospheric pads, minimal beat, ethereal, dreamy, soundscape",
    defaultMood: "relaxed",
    defaultTempo: "slow",
    defaultInstruments: ["synthesizer", "pad", "reverb"],
    description: "梦幻氛围的环境电子乐",
    aliases: ["ambient", "环境", "ambient-electronic"],
    tags: ["electronic", "ambient", "atmospheric"],
  },
  {
    id: "jazz-swing",
    label: "爵士摇摆",
    category: "jazz",
    prompt: "jazz swing, walking bass, brush drums, swing rhythm, brass section, improvisation",
    defaultMood: "happy",
    defaultTempo: "medium",
    defaultInstruments: ["saxophone", "trumpet", "double-bass", "drums", "piano"],
    description: "经典摇摆爵士",
    aliases: ["swing", "jazz-swing", "爵士", "摇摆"],
    tags: ["jazz", "swing", "classic"],
  },
  {
    id: "jazz-smooth",
    label: "柔和爵士",
    category: "jazz",
    prompt: "smooth jazz, mellow saxophone, soft groove, late night vibe, easy listening",
    defaultMood: "relaxed",
    defaultTempo: "medium",
    defaultInstruments: ["saxophone", "electric-piano", "bass", "drums"],
    description: "深夜柔和爵士",
    aliases: ["smooth-jazz", "柔和爵士"],
    tags: ["jazz", "smooth", "mellow"],
  },
  {
    id: "folk-chinese",
    label: "中国民族",
    category: "folk",
    prompt: "chinese folk, traditional instruments, pentatonic scale, erhu, guzheng, dizi, oriental",
    defaultMood: "relaxed",
    defaultTempo: "slow",
    defaultInstruments: ["erhu", "guzheng", "dizi", "pipa"],
    description: "中国传统民族音乐",
    aliases: ["chinese-folk", "民族", "中国风"],
    tags: ["folk", "chinese", "traditional"],
  },
  {
    id: "folk-acoustic",
    label: "民谣吉他",
    category: "folk",
    prompt: "acoustic folk, fingerstyle guitar, warm vocals, storytelling, intimate",
    defaultMood: "romantic",
    defaultTempo: "medium",
    defaultInstruments: ["acoustic-guitar", "vocals"],
    description: "温暖叙事的吉他民谣",
    aliases: ["acoustic", "folk-acoustic", "民谣"],
    tags: ["folk", "acoustic", "intimate"],
  },
  {
    id: "rock-alternative",
    label: "另类摇滚",
    category: "rock",
    prompt: "alternative rock, distorted guitar, steady drums, powerful vocals, energetic chorus",
    defaultMood: "energetic",
    defaultTempo: "fast",
    defaultInstruments: ["electric-guitar", "bass", "drums", "vocals"],
    description: "高能另类摇滚",
    aliases: ["rock", "alternative", "摇滚"],
    tags: ["rock", "alternative", "energetic"],
  },
  {
    id: "cinematic-epic",
    label: "电影史诗",
    category: "cinematic",
    prompt: "cinematic epic, trailer music, huge percussion, soaring strings, heroic, dramatic",
    defaultMood: "epic",
    defaultTempo: "medium",
    defaultInstruments: ["orchestra", "percussion", "choir", "brass"],
    description: "电影预告片级别的史诗配乐",
    aliases: ["cinematic", "epic", "电影", "史诗"],
    tags: ["cinematic", "epic", "trailer"],
  },
];

export function listStylePresets(category?: MusicStyle): MusicStylePreset[] {
  if (category) {
    return STYLE_PRESETS.filter((p) => p.category === category);
  }
  return [...STYLE_PRESETS];
}

export function getStylePreset(idOrAlias: string): MusicStylePreset | undefined {
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
  style: MusicStylePreset;
} {
  const style = getStylePreset(styleId);
  if (!style) {
    return {
      enhancedPrompt: prompt,
      style: {
        id: "none",
        label: "无",
        category: "ambient",
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
  id: MusicStyle;
  label: string;
  description: string;
}[] {
  return [
    { id: "classical", label: "古典", description: "古典管弦、钢琴独奏等" },
    { id: "pop", label: "流行", description: "主流流行与抒情曲" },
    { id: "electronic", label: "电子", description: "EDM、Ambient 等电子曲风" },
    { id: "jazz", label: "爵士", description: "摇摆、柔和爵士" },
    { id: "folk", label: "民族", description: "中国民族、吉他民谣" },
    { id: "rock", label: "摇滚", description: "另类摇滚等" },
    { id: "cinematic", label: "影视", description: "电影史诗配乐" },
  ];
}

export function searchStylePresets(query: string): MusicStylePreset[] {
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
