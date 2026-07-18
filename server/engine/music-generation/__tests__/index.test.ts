/**
 * Music Generation 模块测试
 */

import { describe, it, expect, beforeEach } from "vitest";

import * as stylePreset from "../style-preset.js";
import * as promptEngineering from "../prompt-engineering.js";
import * as providerRegistry from "../provider-registry.js";
import * as audioMixer from "../audio-mixer.js";
import * as generator from "../generator.js";
import {
  createSunoProvider,
  createUdioProvider,
  createTencentMusicProvider,
  createStableAudioProvider,
} from "../providers/index.js";
import type {
  GeneratedMusicAsset,
  MusicGenerationProvider,
  MusicRequest,
  MusicResult,
} from "../types.js";

// ==================== Style Preset 测试 ====================
describe("music-generation / style-preset", () => {
  const {
    listStylePresets,
    getStylePreset,
    applyStyleToPrompt,
    listStyleCategories,
    searchStylePresets,
  } = stylePreset;

  describe("listStylePresets", () => {
    it("应该返回所有音乐风格预设", () => {
      const presets = listStylePresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it("应该按分类过滤音乐风格预设", () => {
      const classical = listStylePresets("classical");
      expect(classical.length).toBeGreaterThan(0);
      for (const preset of classical) {
        expect(preset.category).toBe("classical");
      }
    });
  });

  describe("getStylePreset", () => {
    it("应该通过 id 找到音乐风格预设", () => {
      const preset = getStylePreset("classical-orchestral");
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("classical-orchestral");
      expect(preset?.category).toBe("classical");
    });

    it("应该通过别名找到音乐风格预设", () => {
      const preset = getStylePreset("古典");
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("classical-orchestral");
    });

    it("找不到时返回 undefined", () => {
      expect(getStylePreset("non-existent")).toBeUndefined();
    });

    it("空输入返回 undefined", () => {
      expect(getStylePreset("")).toBeUndefined();
    });
  });

  describe("applyStyleToPrompt", () => {
    it("应该把风格附加到 prompt", () => {
      const result = applyStyleToPrompt("uplifting melody", "pop-mainstream");
      expect(result.enhancedPrompt).toContain("uplifting melody");
      expect(result.style.id).toBe("pop-mainstream");
    });

    it("无效风格不修改 prompt", () => {
      const result = applyStyleToPrompt("uplifting melody", "invalid");
      expect(result.enhancedPrompt).toBe("uplifting melody");
      expect(result.style.id).toBe("none");
    });
  });

  describe("listStyleCategories", () => {
    it("应该返回所有风格分类", () => {
      const cats = listStyleCategories();
      expect(cats.length).toBeGreaterThan(0);
      for (const c of cats) {
        expect(c).toHaveProperty("id");
        expect(c).toHaveProperty("label");
      }
    });
  });

  describe("searchStylePresets", () => {
    it("应该按关键词搜索", () => {
      const results = searchStylePresets("jazz");
      expect(results.length).toBeGreaterThan(0);
    });

    it("空查询返回全部", () => {
      const results = searchStylePresets("");
      expect(results.length).toBe(listStylePresets().length);
    });
  });
});

// ==================== Prompt Engineering 测试 ====================
describe("music-generation / prompt-engineering", () => {
  const {
    detectPromptLanguage,
    translateChinesePrompt,
    enhancePrompt,
    buildPromptFromParts,
    sanitizePrompt,
    truncatePrompt,
    mergePrompts,
    extractPromptKeywords,
    createPromptVariations,
  } = promptEngineering;

  describe("detectPromptLanguage", () => {
    it("应该检测英文", () => {
      expect(detectPromptLanguage("uplifting melody")).toBe("en");
    });

    it("应该检测中文", () => {
      expect(detectPromptLanguage("一首悲伤的钢琴曲")).toBe("zh");
    });

    it("空输入返回英文", () => {
      expect(detectPromptLanguage("")).toBe("en");
    });
  });

  describe("translateChinesePrompt", () => {
    it("英文不翻译", () => {
      expect(translateChinesePrompt("piano melody")).toBe("piano melody");
    });

    it("应该翻译简单中文词", () => {
      const result = translateChinesePrompt("钢琴");
      expect(result).toContain("piano");
    });
  });

  describe("enhancePrompt", () => {
    it("应该附加 quality tags", () => {
      const result = enhancePrompt("melody", { addQualityTags: true });
      expect(result.enhancedPrompt).toContain("melody");
      expect(result.enhancements).toContain("quality tags added");
    });

    it("应该应用风格", () => {
      const result = enhancePrompt("melody", { style: "jazz-swing" });
      expect(result.style).toBe("jazz-swing");
    });

    it("应该附加 mood", () => {
      const result = enhancePrompt("melody", { mood: "epic" });
      expect(result.enhancedPrompt).toContain("epic");
    });

    it("应该附加 tempo", () => {
      const result = enhancePrompt("melody", { tempo: "fast" });
      expect(result.enhancedPrompt).toContain("130 bpm");
    });

    it("应该附加 instruments", () => {
      const result = enhancePrompt("melody", { instruments: ["piano", "violin"] });
      expect(result.enhancedPrompt).toContain("piano");
      expect(result.enhancedPrompt).toContain("violin");
    });
  });

  describe("buildPromptFromParts", () => {
    it("应该按字段组合 prompt", () => {
      const prompt = buildPromptFromParts({
        subject: "epic melody",
        style: "cinematic",
        mood: "epic",
      });
      expect(prompt).toContain("epic melody");
      expect(prompt).toContain("cinematic");
      expect(prompt).toContain("epic");
    });
  });

  describe("sanitizePrompt", () => {
    it("应该清理多余空格与逗号", () => {
      expect(sanitizePrompt("  a,,, b ")).toBe("a, b");
    });
  });

  describe("truncatePrompt", () => {
    it("短 prompt 不截断", () => {
      expect(truncatePrompt("melody", 100)).toBe("melody");
    });

    it("长 prompt 应该截断", () => {
      const long = "a".repeat(200);
      const result = truncatePrompt(long, 100);
      expect(result.length).toBeLessThanOrEqual(103);
    });
  });

  describe("mergePrompts", () => {
    it("应该合并 prompt", () => {
      expect(mergePrompts(["a", "b"])).toBe("a, b");
    });

    it("应该过滤空字符串", () => {
      expect(mergePrompts(["a", "", "b"])).toBe("a, b");
    });
  });

  describe("extractPromptKeywords", () => {
    it("应该提取关键词", () => {
      const kws = extractPromptKeywords("epic cinematic melody, beautiful");
      expect(kws.length).toBeGreaterThan(0);
    });
  });

  describe("createPromptVariations", () => {
    it("应该创建变体", () => {
      const v = createPromptVariations("melody", 3);
      expect(v.length).toBe(3);
      expect(v[0]).toBe("melody");
    });

    it("count 为 0 返回空数组", () => {
      expect(createPromptVariations("melody", 0)).toEqual([]);
    });
  });
});

// ==================== Provider Registry 测试 ====================
describe("music-generation / provider-registry", () => {
  const {
    registerMusicProvider,
    unregisterMusicProvider,
    listMusicProviders,
    listConfiguredMusicProviders,
    getMusicProvider,
    getDefaultMusicProvider,
    clearMusicProviders,
  } = providerRegistry;

  function makeProvider(id: string, configured: boolean = true): MusicGenerationProvider {
    return {
      id,
      aliases: [`${id}-alias`],
      capabilities: {},
      isConfigured: () => configured,
      generateMusic: async () => ({ tracks: [] }),
    };
  }

  beforeEach(() => {
    clearMusicProviders();
  });

  it("应该注册并读取 Provider", () => {
    registerMusicProvider(makeProvider("alpha"));
    expect(listMusicProviders().length).toBe(1);
    expect(getMusicProvider("alpha")).toBeDefined();
  });

  it("应该通过 alias 获取 Provider", () => {
    registerMusicProvider(makeProvider("beta"));
    expect(getMusicProvider("beta-alias")).toBeDefined();
  });

  it("应该按优先级排序", () => {
    registerMusicProvider(makeProvider("low"), 200);
    registerMusicProvider(makeProvider("high"), 50);
    const configured = listConfiguredMusicProviders();
    expect(configured[0].id).toBe("high");
  });

  it("未配置的 Provider 应被过滤", () => {
    registerMusicProvider(makeProvider("unconfigured", false));
    expect(listConfiguredMusicProviders().length).toBe(0);
    expect(getDefaultMusicProvider()).toBeUndefined();
  });

  it("应该注销 Provider", () => {
    registerMusicProvider(makeProvider("gamma"));
    expect(unregisterMusicProvider("gamma")).toBe(true);
    expect(getMusicProvider("gamma")).toBeUndefined();
  });

  it("注册时 id 为空应抛错", () => {
    expect(() =>
      registerMusicProvider({ id: "", capabilities: {}, generateMusic: async () => ({ tracks: [] }) }),
    ).toThrow();
  });
});

// ==================== Provider 工厂测试 ====================
describe("music-generation / providers", () => {
  describe("suno provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createSunoProvider();
      expect(p.id).toBe("suno");
      expect(p.capabilities.generate?.supportsLyrics).toBe(true);
    });

    it("未配置 API key 时 isConfigured 返回 false", () => {
      const prev = process.env.SUNO_API_KEY;
      delete process.env.SUNO_API_KEY;
      const p = createSunoProvider();
      expect(p.isConfigured()).toBe(false);
      if (prev) process.env.SUNO_API_KEY = prev;
    });

    it("缺少 API key 时 generateMusic 应抛错", async () => {
      const prev = process.env.SUNO_API_KEY;
      delete process.env.SUNO_API_KEY;
      const p = createSunoProvider();
      await expect(
        p.generateMusic({ provider: "suno", model: "suno-v4", prompt: "x" }),
      ).rejects.toThrow(/API key/);
      if (prev) process.env.SUNO_API_KEY = prev;
    });

    it("应该接受自定义选项", () => {
      const p = createSunoProvider({ id: "suno-custom", defaultModel: "suno-v3" });
      expect(p.id).toBe("suno-custom");
      expect(p.defaultModel).toBe("suno-v3");
    });
  });

  describe("udio provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createUdioProvider();
      expect(p.id).toBe("udio");
      expect(p.capabilities.generate?.supportsLyrics).toBe(true);
    });
  });

  describe("tencent-music provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createTencentMusicProvider();
      expect(p.id).toBe("tencent-music");
      expect(p.aliases?.includes("tme")).toBe(true);
    });
  });

  describe("stable-audio provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createStableAudioProvider();
      expect(p.id).toBe("stable-audio");
      expect(p.capabilities.generate?.supportsLyrics).toBe(false);
    });
  });
});

// ==================== Audio Mixer 测试 ====================
describe("music-generation / audio-mixer", () => {
  const {
    validateMixTracks,
    estimateMixDuration,
    calculateVolumeCurve,
    normalizeVolume,
    applyCrossfade,
    clipTrack,
    mixTracks,
    validateMixOptions,
    listMixFormats,
  } = audioMixer;

  function makeAsset(buffer: Buffer, durationSeconds: number = 10): GeneratedMusicAsset {
    return { buffer, mimeType: "audio/wav", durationSeconds };
  }

  describe("validateMixTracks", () => {
    it("应该通过合法 tracks", () => {
      const errors = validateMixTracks([
        { asset: makeAsset(Buffer.from([1, 2, 3])), volume: 0.5 },
      ]);
      expect(errors).toEqual([]);
    });

    it("空数组应报错", () => {
      expect(validateMixTracks([]).length).toBeGreaterThan(0);
    });

    it("volume 越界应报错", () => {
      const errors = validateMixTracks([
        { asset: makeAsset(Buffer.from([1])), volume: 2 },
      ]);
      expect(errors.length).toBeGreaterThan(0);
    });

    it("缺少 buffer 应报错", () => {
      const errors = validateMixTracks([
        { asset: { buffer: undefined as unknown as Buffer, mimeType: "audio/wav" } },
      ]);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("estimateMixDuration", () => {
    it("应该返回最长时长", () => {
      const dur = estimateMixDuration([
        { asset: makeAsset(Buffer.from([1]), 5) },
        { asset: makeAsset(Buffer.from([1]), 10), startOffsetMs: 1000 },
      ]);
      // 第二轨：1000ms + 10000ms = 11000ms = 11s
      expect(dur).toBeCloseTo(11, 1);
    });

    it("空数组返回 0", () => {
      expect(estimateMixDuration([])).toBe(0);
    });
  });

  describe("calculateVolumeCurve", () => {
    it("应该返回 fade in/out 点", () => {
      const curve = calculateVolumeCurve(1000, 1, 100, 100);
      expect(curve.length).toBe(4);
      expect(curve[0].volume).toBe(0);
      expect(curve[curve.length - 1].volume).toBe(0);
    });

    it("无 fade 时只有两端", () => {
      const curve = calculateVolumeCurve(1000, 0.8);
      expect(curve.length).toBe(2);
      expect(curve[0].volume).toBe(0.8);
    });
  });

  describe("normalizeVolume", () => {
    it("未指定 volume 默认 1", () => {
      const result = normalizeVolume([{ asset: makeAsset(Buffer.from([1])) }]);
      expect(result[0].volume).toBe(1);
    });

    it("超出范围会被 clamp", () => {
      const result = normalizeVolume([
        { asset: makeAsset(Buffer.from([1])), volume: 2 },
      ]);
      expect(result[0].volume).toBe(1);
    });
  });

  describe("applyCrossfade", () => {
    it("应该给相邻轨道加 fade", () => {
      const result = applyCrossfade(
        [
          { asset: makeAsset(Buffer.from([1])) },
          { asset: makeAsset(Buffer.from([2])) },
        ],
        500,
      );
      expect(result[0].fadeOutMs).toBe(500);
      expect(result[1].fadeInMs).toBe(500);
    });

    it("单轨不应用 crossfade", () => {
      const result = applyCrossfade(
        [{ asset: makeAsset(Buffer.from([1])) }],
        500,
      );
      expect(result[0].fadeInMs).toBeUndefined();
    });
  });

  describe("clipTrack", () => {
    it("应该裁剪到指定范围", () => {
      const track = { asset: makeAsset(Buffer.from([1, 2, 3]), 10) };
      const clipped = clipTrack(track, 2000, 5000);
      expect(clipped.asset.durationSeconds).toBe(3);
      expect(clipped.startOffsetMs).toBe(2000);
    });
  });

  describe("mixTracks", () => {
    it("应该执行混音并返回结果", async () => {
      const result = await mixTracks([
        { asset: makeAsset(Buffer.from([1, 2, 3]), 5), volume: 0.5 },
        { asset: makeAsset(Buffer.from([4, 5, 6]), 5), volume: 0.8 },
      ]);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.trackCount).toBe(2);
    });

    it("非法 tracks 应抛错", async () => {
      await expect(mixTracks([])).rejects.toThrow();
    });
  });

  describe("validateMixOptions", () => {
    it("非法采样率应报错", () => {
      const errors = validateMixOptions({ outputSampleRate: 12345 });
      expect(errors.length).toBeGreaterThan(0);
    });

    it("合法选项应通过", () => {
      const errors = validateMixOptions({
        outputSampleRate: 44100,
        outputChannels: 2,
        crossfadeMs: 200,
      });
      expect(errors).toEqual([]);
    });
  });

  describe("listMixFormats", () => {
    it("应该返回支持的格式列表", () => {
      const formats = listMixFormats();
      expect(formats.length).toBeGreaterThan(0);
      expect(formats).toContain("wav");
    });
  });
});

// ==================== Generator 测试 ====================
describe("music-generation / generator", () => {
  const {
    parseModelRef,
    estimateGenerationCost,
    clearMusicHistory,
    getMusicHistory,
  } = generator;

  beforeEach(() => {
    clearMusicHistory();
  });

  describe("parseModelRef", () => {
    it("应该解析 provider/model", () => {
      expect(parseModelRef("suno/suno-v4")).toEqual(["suno", "suno-v4"]);
    });

    it("无 / 时返回空 provider", () => {
      expect(parseModelRef("suno-v4")).toEqual(["", "suno-v4"]);
    });
  });

  describe("estimateGenerationCost", () => {
    it("基础估算", () => {
      const cost = estimateGenerationCost({ prompt: "test" });
      expect(cost.estimatedCredits).toBeGreaterThan(0);
      expect(cost.estimatedTimeMs).toBeGreaterThan(0);
    });

    it("时长影响成本", () => {
      const short = estimateGenerationCost({ prompt: "test", durationSeconds: 10 });
      const long = estimateGenerationCost({ prompt: "test", durationSeconds: 60 });
      expect(long.estimatedCredits).toBeGreaterThan(short.estimatedCredits);
    });
  });

  describe("generateMusic", () => {
    it("无可用 Provider 时应抛错", async () => {
      providerRegistry.clearMusicProviders();
      await expect(
        generator.generateMusic({ prompt: "test" }),
      ).rejects.toThrow(/provider/i);
    });

    it("应该调用 Provider 生成音乐并写入历史", async () => {
      providerRegistry.clearMusicProviders();
      const fakeAsset: GeneratedMusicAsset = {
        buffer: Buffer.from([1, 2, 3, 4]),
        mimeType: "audio/mp3",
        durationSeconds: 10,
      };
      const fakeResult: MusicResult = {
        tracks: [fakeAsset],
        model: "test-model",
      };
      const fakeProvider: MusicGenerationProvider = {
        id: "fake",
        capabilities: {},
        isConfigured: () => true,
        generateMusic: async (_req: MusicRequest) => fakeResult,
      };
      providerRegistry.registerMusicProvider(fakeProvider, 10);

      const result = await generator.generateMusic({ prompt: "test melody" });
      expect(result.tracks.length).toBe(1);
      expect(result.provider).toBe("fake");
      expect(result.historyId).toBeDefined();

      const hist = getMusicHistory();
      expect(hist.length).toBe(1);
      expect(hist[0].provider).toBe("fake");

      providerRegistry.clearMusicProviders();
    });

    it("autoProviderFallback 关闭时只使用默认 Provider", async () => {
      providerRegistry.clearMusicProviders();
      const ok: MusicGenerationProvider = {
        id: "ok",
        capabilities: {},
        isConfigured: () => true,
        generateMusic: async () => ({
          tracks: [{ buffer: Buffer.from([1]), mimeType: "audio/mp3" }],
          model: "ok-model",
        }),
      };
      providerRegistry.registerMusicProvider(ok, 50);
      const result = await generator.generateMusic({
        prompt: "test",
        autoProviderFallback: false,
      });
      expect(result.provider).toBe("ok");
      providerRegistry.clearMusicProviders();
    });
  });
});
