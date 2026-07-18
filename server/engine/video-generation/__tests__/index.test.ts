/**
 * Video Generation 模块测试
 */

import { describe, it, expect, beforeEach } from "vitest";

import * as stylePreset from "../style-preset.js";
import * as promptEngineering from "../prompt-engineering.js";
import * as providerRegistry from "../provider-registry.js";
import * as videoEditor from "../video-editor.js";
import * as frameExtractor from "../frame-extractor.js";
import * as generator from "../generator.js";
import {
  createRunwayProvider,
  createPikaProvider,
  createSoraProvider,
  createKlingProvider,
  createHunyuanVideoProvider,
} from "../providers/index.js";
import type {
  GeneratedVideoAsset,
  VideoGenerationProvider,
  VideoRequest,
  VideoResult,
} from "../types.js";

// ==================== Style Preset 测试 ====================
describe("video-generation / style-preset", () => {
  const {
    listStylePresets,
    getStylePreset,
    applyStyleToPrompt,
    listStyleCategories,
    searchStylePresets,
  } = stylePreset;

  it("应该返回所有视频风格预设", () => {
    const presets = listStylePresets();
    expect(presets.length).toBeGreaterThan(0);
  });

  it("应该按分类过滤", () => {
    const cinematic = listStylePresets("cinematic");
    expect(cinematic.length).toBeGreaterThan(0);
    for (const p of cinematic) expect(p.category).toBe("cinematic");
  });

  it("应该通过 id 找到预设", () => {
    const preset = getStylePreset("cinematic-blockbuster");
    expect(preset?.id).toBe("cinematic-blockbuster");
  });

  it("应该通过别名找到预设", () => {
    const preset = getStylePreset("大片");
    expect(preset?.id).toBe("cinematic-blockbuster");
  });

  it("找不到时返回 undefined", () => {
    expect(getStylePreset("non-existent")).toBeUndefined();
  });

  it("空输入返回 undefined", () => {
    expect(getStylePreset("")).toBeUndefined();
  });

  it("应该把风格附加到 prompt", () => {
    const result = applyStyleToPrompt("a beautiful sunset", "realistic-cinematic");
    expect(result.enhancedPrompt).toContain("a beautiful sunset");
    expect(result.style.id).toBe("realistic-cinematic");
  });

  it("无效风格不修改 prompt", () => {
    const result = applyStyleToPrompt("a sunset", "invalid");
    expect(result.enhancedPrompt).toBe("a sunset");
    expect(result.style.id).toBe("none");
  });

  it("应该返回风格分类", () => {
    expect(listStyleCategories().length).toBeGreaterThan(0);
  });

  it("应该支持搜索", () => {
    const results = searchStylePresets("cinematic");
    expect(results.length).toBeGreaterThan(0);
  });

  it("空查询返回全部", () => {
    expect(searchStylePresets("").length).toBe(listStylePresets().length);
  });
});

// ==================== Prompt Engineering 测试 ====================
describe("video-generation / prompt-engineering", () => {
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

  it("应该检测英文", () => {
    expect(detectPromptLanguage("city at night")).toBe("en");
  });

  it("应该检测中文", () => {
    expect(detectPromptLanguage("夜晚的城市")).toBe("zh");
  });

  it("空输入返回英文", () => {
    expect(detectPromptLanguage("")).toBe("en");
  });

  it("英文不翻译", () => {
    expect(translateChinesePrompt("city")).toBe("city");
  });

  it("应该翻译中文", () => {
    expect(translateChinesePrompt("城市")).toContain("city");
  });

  it("应该附加 quality tags", () => {
    const result = enhancePrompt("a sunset", { addQualityTags: true });
    expect(result.enhancements).toContain("quality tags added");
  });

  it("应该附加 camera tags", () => {
    const result = enhancePrompt("a sunset", { addCameraTags: true });
    expect(result.enhancements).toContain("camera tags added");
  });

  it("应该附加 motion tags", () => {
    const result = enhancePrompt("a sunset", { addMotionTags: true });
    expect(result.enhancements).toContain("motion tags added");
  });

  it("应该应用风格", () => {
    const result = enhancePrompt("a sunset", { style: "cinematic-blockbuster" });
    expect(result.style).toBe("cinematic-blockbuster");
  });

  it("应该按字段组合 prompt", () => {
    const prompt = buildPromptFromParts({
      subject: "a sunset",
      setting: "at the beach",
      camera: "wide angle shot",
    });
    expect(prompt).toContain("a sunset");
    expect(prompt).toContain("at the beach");
    expect(prompt).toContain("wide angle shot");
  });

  it("应该清理 prompt", () => {
    expect(sanitizePrompt("  a,,, b ")).toBe("a, b");
  });

  it("短 prompt 不截断", () => {
    expect(truncatePrompt("sunset", 100)).toBe("sunset");
  });

  it("长 prompt 应该截断", () => {
    const result = truncatePrompt("a".repeat(200), 100);
    expect(result.length).toBeLessThanOrEqual(103);
  });

  it("应该合并 prompt", () => {
    expect(mergePrompts(["a", "b"])).toBe("a, b");
  });

  it("应该提取关键词", () => {
    expect(extractPromptKeywords("epic cinematic sunset").length).toBeGreaterThan(0);
  });

  it("应该创建变体", () => {
    const v = createPromptVariations("sunset", 3);
    expect(v.length).toBe(3);
    expect(v[0]).toBe("sunset");
  });

  it("count 为 0 返回空数组", () => {
    expect(createPromptVariations("sunset", 0)).toEqual([]);
  });
});

// ==================== Provider Registry 测试 ====================
describe("video-generation / provider-registry", () => {
  const {
    registerVideoProvider,
    unregisterVideoProvider,
    listVideoProviders,
    listConfiguredVideoProviders,
    getVideoProvider,
    getDefaultVideoProvider,
    clearVideoProviders,
  } = providerRegistry;

  function makeProvider(id: string, configured: boolean = true): VideoGenerationProvider {
    return {
      id,
      aliases: [`${id}-alias`],
      capabilities: {},
      isConfigured: () => configured,
      generateVideo: async () => ({ videos: [] }),
    };
  }

  beforeEach(() => {
    clearVideoProviders();
  });

  it("应该注册并读取 Provider", () => {
    registerVideoProvider(makeProvider("alpha"));
    expect(listVideoProviders().length).toBe(1);
    expect(getVideoProvider("alpha")).toBeDefined();
  });

  it("应该通过 alias 获取 Provider", () => {
    registerVideoProvider(makeProvider("beta"));
    expect(getVideoProvider("beta-alias")).toBeDefined();
  });

  it("应该按优先级排序", () => {
    registerVideoProvider(makeProvider("low"), 200);
    registerVideoProvider(makeProvider("high"), 50);
    const configured = listConfiguredVideoProviders();
    expect(configured[0].id).toBe("high");
  });

  it("未配置的 Provider 应被过滤", () => {
    registerVideoProvider(makeProvider("nope", false));
    expect(listConfiguredVideoProviders().length).toBe(0);
    expect(getDefaultVideoProvider()).toBeUndefined();
  });

  it("应该注销 Provider", () => {
    registerVideoProvider(makeProvider("gamma"));
    expect(unregisterVideoProvider("gamma")).toBe(true);
    expect(getVideoProvider("gamma")).toBeUndefined();
  });

  it("注册时 id 为空应抛错", () => {
    expect(() =>
      registerVideoProvider({ id: "", capabilities: {}, generateVideo: async () => ({ videos: [] }) }),
    ).toThrow();
  });
});

// ==================== Provider 工厂测试 ====================
describe("video-generation / providers", () => {
  describe("runway provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createRunwayProvider();
      expect(p.id).toBe("runway");
      expect(p.capabilities.generate?.maxDurationSeconds).toBe(10);
    });

    it("未配置 API key 时 isConfigured 返回 false", () => {
      const prev = process.env.RUNWAY_API_KEY;
      delete process.env.RUNWAY_API_KEY;
      const p = createRunwayProvider();
      expect(p.isConfigured()).toBe(false);
      if (prev) process.env.RUNWAY_API_KEY = prev;
    });

    it("缺少 API key 时 generateVideo 应抛错", async () => {
      const prev = process.env.RUNWAY_API_KEY;
      delete process.env.RUNWAY_API_KEY;
      const p = createRunwayProvider();
      await expect(
        p.generateVideo({ provider: "runway", model: "gen-3-alpha", prompt: "x" }),
      ).rejects.toThrow(/API key/);
      if (prev) process.env.RUNWAY_API_KEY = prev;
    });
  });

  describe("pika provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createPikaProvider();
      expect(p.id).toBe("pika");
    });
  });

  describe("sora provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createSoraProvider();
      expect(p.id).toBe("sora");
      expect(p.capabilities.generate?.supportsAudio).toBe(true);
    });
  });

  describe("kling provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createKlingProvider();
      expect(p.id).toBe("kling");
      expect(p.capabilities.videoToVideo?.enabled).toBe(true);
    });
  });

  describe("hunyuan-video provider", () => {
    it("应该创建默认 Provider", () => {
      const p = createHunyuanVideoProvider();
      expect(p.id).toBe("hunyuan-video");
    });
  });
});

// ==================== Video Editor 测试 ====================
describe("video-generation / video-editor", () => {
  const {
    validateClips,
    estimateEditDuration,
    trimClip,
    applyTransitions,
    validateEditOptions,
    editClips,
    listOutputFormats,
  } = videoEditor;

  function makeAsset(buffer: Buffer, durationSeconds: number = 5): GeneratedVideoAsset {
    return { buffer, mimeType: "video/mp4", durationSeconds };
  }

  it("validateClips 应该通过合法 clips", () => {
    const errors = validateClips([{ asset: makeAsset(Buffer.from([1])) }]);
    expect(errors).toEqual([]);
  });

  it("空数组应报错", () => {
    expect(validateClips([]).length).toBeGreaterThan(0);
  });

  it("endSeconds < startSeconds 应报错", () => {
    const errors = validateClips([
      { asset: makeAsset(Buffer.from([1])), startSeconds: 5, endSeconds: 2 },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("应该估算总时长", () => {
    const dur = estimateEditDuration([
      { asset: makeAsset(Buffer.from([1]), 5) },
      { asset: makeAsset(Buffer.from([1]), 3) },
    ]);
    expect(dur).toBe(8);
  });

  it("空数组时长为 0", () => {
    expect(estimateEditDuration([])).toBe(0);
  });

  it("trimClip 应该裁剪时长", () => {
    const clip = trimClip(makeAsset(Buffer.from([1]), 10), 2, 5);
    expect(clip.asset.durationSeconds).toBe(3);
    expect(clip.startSeconds).toBe(2);
  });

  it("applyTransitions 应该给相邻 clip 加转场", () => {
    const result = applyTransitions(
      [
        { asset: makeAsset(Buffer.from([1])) },
        { asset: makeAsset(Buffer.from([2])) },
      ],
      "fade",
    );
    expect(result[0].transitionOut).toBe("fade");
    expect(result[1].transitionIn).toBe("fade");
  });

  it("validateEditOptions 非法 fps 应报错", () => {
    const errors = validateEditOptions({ outputFps: 200 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("editClips 应该返回结果", async () => {
    const result = await editClips([
      { asset: makeAsset(Buffer.from([1, 2, 3]), 5) },
      { asset: makeAsset(Buffer.from([4, 5, 6]), 3) },
    ]);
    expect(result.clipCount).toBe(2);
    expect(result.durationSeconds).toBe(8);
  });

  it("listOutputFormats 应返回格式列表", () => {
    expect(listOutputFormats().length).toBeGreaterThan(0);
  });
});

// ==================== Frame Extractor 测试 ====================
describe("video-generation / frame-extractor", () => {
  const {
    validateExtractionOptions,
    computeFrameTimestamps,
    pickEvenlySpacedFrames,
    qualityToScale,
    formatToMimeType,
    extractFrames,
    estimateFrameCount,
  } = frameExtractor;

  it("validateExtractionOptions 非法 fps 应报错", () => {
    const errors = validateExtractionOptions({ fps: 200 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("validateExtractionOptions 非法 count 应报错", () => {
    const errors = validateExtractionOptions({ count: 0 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("computeFrameTimestamps 按 fps 计算", () => {
    const ts = computeFrameTimestamps(2, { fps: 2 });
    expect(ts.length).toBe(4);
  });

  it("computeFrameTimestamps 按 count 计算", () => {
    const ts = computeFrameTimestamps(10, { count: 5 });
    expect(ts.length).toBe(5);
  });

  it("pickEvenlySpacedFrames 单个取中点", () => {
    const ts = pickEvenlySpacedFrames(10, 1);
    expect(ts).toEqual([5]);
  });

  it("qualityToScale 应返回正确缩放", () => {
    expect(qualityToScale("low")).toBe(0.25);
    expect(qualityToScale("medium")).toBe(0.5);
    expect(qualityToScale("high")).toBe(1);
  });

  it("formatToMimeType 应返回正确 MIME", () => {
    expect(formatToMimeType("png")).toBe("image/png");
    expect(formatToMimeType("jpeg")).toBe("image/jpeg");
  });

  it("extractFrames 应返回帧", async () => {
    const result = await extractFrames(
      {
        buffer: Buffer.from([1, 2, 3, 4, 5]),
        mimeType: "video/mp4",
        durationSeconds: 2,
      },
      { fps: 1 },
    );
    expect(result.totalCount).toBeGreaterThan(0);
  });

  it("estimateFrameCount 按 fps 估算", () => {
    expect(estimateFrameCount(10, { fps: 2 })).toBe(20);
  });

  it("estimateFrameCount 按 count 估算", () => {
    expect(estimateFrameCount(10, { count: 5 })).toBe(5);
  });
});

// ==================== Generator 测试 ====================
describe("video-generation / generator", () => {
  const {
    parseModelRef,
    estimateGenerationCost,
    clearVideoHistory,
    getVideoHistory,
  } = generator;

  beforeEach(() => {
    clearVideoHistory();
  });

  it("parseModelRef 应该解析 provider/model", () => {
    expect(parseModelRef("runway/gen-3-alpha")).toEqual(["runway", "gen-3-alpha"]);
  });

  it("estimateGenerationCost 基础估算", () => {
    const cost = estimateGenerationCost({ prompt: "test" });
    expect(cost.estimatedCredits).toBeGreaterThan(0);
  });

  it("分辨率影响成本", () => {
    const low = estimateGenerationCost({ prompt: "test", resolution: "720P" });
    const high = estimateGenerationCost({ prompt: "test", resolution: "4K" });
    expect(high.estimatedCredits).toBeGreaterThan(low.estimatedCredits);
  });

  it("无可用 Provider 时应抛错", async () => {
    providerRegistry.clearVideoProviders();
    await expect(
      generator.generateVideo({ prompt: "test" }),
    ).rejects.toThrow(/provider/i);
  });

  it("应该调用 Provider 生成视频并写入历史", async () => {
    providerRegistry.clearVideoProviders();
    const fakeAsset: GeneratedVideoAsset = {
      buffer: Buffer.from([1, 2, 3, 4]),
      mimeType: "video/mp4",
      durationSeconds: 5,
    };
    const fakeResult: VideoResult = { videos: [fakeAsset], model: "test-model" };
    const fakeProvider: VideoGenerationProvider = {
      id: "fake",
      capabilities: {},
      isConfigured: () => true,
      generateVideo: async (_req: VideoRequest) => fakeResult,
    };
    providerRegistry.registerVideoProvider(fakeProvider, 10);

    const result = await generator.generateVideo({ prompt: "test" });
    expect(result.videos.length).toBe(1);
    expect(result.provider).toBe("fake");
    expect(result.historyId).toBeDefined();

    const hist = getVideoHistory();
    expect(hist.length).toBe(1);

    providerRegistry.clearVideoProviders();
  });
});
