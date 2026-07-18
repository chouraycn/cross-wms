/**
 * Image Generation 模块测试
 *
 * 测试所有图像生成相关的模块。
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import * as sizePreset from "../size-preset.js";
import * as stylePreset from "../style-preset.js";
import * as promptEngineering from "../prompt-engineering.js";
import * as generationHistory from "../generation-history.js";
import * as nsfwChecker from "../nsfw-checker.js";
import * as imageAssets from "../image-assets.js";
import * as watermark from "../watermark.js";
import * as upscaler from "../upscaler.js";
import * as batchManager from "../batch-manager.js";
import * as imageEditor from "../image-editor.js";

// ==================== Size Preset 测试 ====================
describe("size-preset", () => {
  const {
    listSizePresets,
    getSizePreset,
    parseSizeString,
    formatSizeString,
    getAspectRatio,
    getClosestSizePreset,
    listSizeCategories,
  } = sizePreset;

  describe("listSizePresets", () => {
    it("应该返回所有尺寸预设", () => {
      const presets = listSizePresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it("应该按分类过滤尺寸预设", () => {
      const squarePresets = listSizePresets("square");
      expect(squarePresets.length).toBeGreaterThan(0);
      for (const preset of squarePresets) {
        expect(preset.category).toBe("square");
      }
    });
  });

  describe("getSizePreset", () => {
    it("应该通过 id 找到尺寸预设", () => {
      const preset = getSizePreset("square-1024");
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("square-1024");
      expect(preset?.width).toBe(1024);
      expect(preset?.height).toBe(1024);
    });

    it("应该通过别名找到尺寸预设", () => {
      const preset = getSizePreset("1024x1024");
      expect(preset).toBeDefined();
      expect(preset?.width).toBe(1024);
      expect(preset?.height).toBe(1024);
    });

    it("找不到时返回 undefined", () => {
      const preset = getSizePreset("non-existent-preset");
      expect(preset).toBeUndefined();
    });

    it("空输入返回 undefined", () => {
      expect(getSizePreset("")).toBeUndefined();
      expect(getSizePreset(null as unknown as string)).toBeUndefined();
    });
  });

  describe("parseSizeString", () => {
    it("应该解析 WxH 格式", () => {
      const result = parseSizeString("1024x768");
      expect(result).toEqual({ width: 1024, height: 768 });
    });

    it("应该解析 W*H 格式", () => {
      const result = parseSizeString("800*600");
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it("应该解析预设名称", () => {
      const result = parseSizeString("square");
      expect(result).toBeDefined();
      expect(result?.width).toBe(1024);
      expect(result?.height).toBe(1024);
    });

    it("无效格式返回 null", () => {
      expect(parseSizeString("invalid")).toBeNull();
      expect(parseSizeString("")).toBeNull();
    });
  });

  describe("formatSizeString", () => {
    it("应该格式化尺寸字符串", () => {
      expect(formatSizeString(1024, 768)).toBe("1024*768");
    });

    it("应该使用自定义分隔符", () => {
      expect(formatSizeString(1024, 768, "x")).toBe("1024x768");
      expect(formatSizeString(1024, 768, ":")).toBe("1024:768");
    });
  });

  describe("getAspectRatio", () => {
    it("应该计算宽高比", () => {
      expect(getAspectRatio(1024, 1024)).toBe("1:1");
      expect(getAspectRatio(1920, 1080)).toBe("16:9");
    });
  });

  describe("getClosestSizePreset", () => {
    it("应该找到最接近的尺寸预设", () => {
      const closest = getClosestSizePreset(1000, 1000, "square");
      expect(closest).toBeDefined();
      expect(closest?.category).toBe("square");
    });
  });

  describe("listSizeCategories", () => {
    it("应该返回所有尺寸分类", () => {
      const categories = listSizeCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
      for (const cat of categories) {
        expect(cat).toHaveProperty("id");
        expect(cat).toHaveProperty("label");
        expect(cat).toHaveProperty("description");
      }
    });
  });
});

// ==================== Style Preset 测试 ====================
describe("style-preset", () => {
  const {
    listStylePresets,
    getStylePreset,
    applyStyleToPrompt,
    listStyleCategories,
    searchStylePresets,
  } = stylePreset;

  describe("listStylePresets", () => {
    it("应该返回所有风格预设", () => {
      const presets = listStylePresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it("应该按分类过滤风格预设", () => {
      const animePresets = listStylePresets("anime");
      expect(animePresets.length).toBeGreaterThan(0);
      for (const preset of animePresets) {
        expect(preset.category).toBe("anime");
      }
    });
  });

  describe("getStylePreset", () => {
    it("应该通过 id 找到风格预设", () => {
      const preset = getStylePreset("realistic-photo");
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("realistic-photo");
      expect(preset?.category).toBe("realistic");
    });

    it("应该通过别名找到风格预设", () => {
      const preset = getStylePreset("photo");
      expect(preset).toBeDefined();
      expect(preset?.id).toBe("realistic-photo");
    });

    it("找不到时返回 undefined", () => {
      expect(getStylePreset("non-existent-style")).toBeUndefined();
    });
  });

  describe("applyStyleToPrompt", () => {
    it("应该应用风格到提示词", () => {
      const result = applyStyleToPrompt("a beautiful girl", "anime-style");
      expect(result.enhancedPrompt).toContain("a beautiful girl");
      expect(result.style).toBeDefined();
      expect(result.style.id).toBe("anime-style");
    });

    it("无效风格不修改提示词", () => {
      const result = applyStyleToPrompt("a beautiful girl", "invalid-style");
      expect(result.enhancedPrompt).toBe("a beautiful girl");
    });
  });

  describe("listStyleCategories", () => {
    it("应该返回所有风格分类", () => {
      const categories = listStyleCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe("searchStylePresets", () => {
    it("应该搜索风格预设", () => {
      const results = searchStylePresets("anime");
      expect(results.length).toBeGreaterThan(0);
    });

    it("空查询返回所有", () => {
      const results = searchStylePresets("");
      expect(results.length).toBe(listStylePresets().length);
    });
  });
});

// ==================== Prompt Engineering 测试 ====================
describe("prompt-engineering", () => {
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
    it("应该检测英文提示词", () => {
      expect(detectPromptLanguage("a beautiful girl")).toBe("en");
    });

    it("应该检测中文提示词", () => {
      expect(detectPromptLanguage("一个美丽的女孩在森林里")).toBe("zh");
    });

    it("空输入返回英文", () => {
      expect(detectPromptLanguage("")).toBe("en");
    });
  });

  describe("translateChinesePrompt", () => {
    it("英文输入不改变", () => {
      const result = translateChinesePrompt("a cat");
      expect(result).toBe("a cat");
    });

    it("应该翻译简单的中文词汇", () => {
      const result = translateChinesePrompt("猫");
      expect(result).toContain("cat");
    });
  });

  describe("enhancePrompt", () => {
    it("应该增强提示词", () => {
      const result = enhancePrompt("a cat", { addQualityTags: true });
      expect(result.originalPrompt).toBe("a cat");
      expect(result.enhancedPrompt).toContain("a cat");
      expect(result.enhancements.length).toBeGreaterThan(0);
    });

    it("应该应用风格", () => {
      const result = enhancePrompt("a cat", { style: "anime-style" });
      expect(result.style).toBe("anime-style");
    });
  });

  describe("buildPromptFromParts", () => {
    it("应该从部件构建提示词", () => {
      const prompt = buildPromptFromParts({
        subject: "a girl",
        style: "anime style",
        setting: "in a forest",
      });
      expect(prompt).toContain("a girl");
      expect(prompt).toContain("anime style");
      expect(prompt).toContain("in a forest");
    });
  });

  describe("sanitizePrompt", () => {
    it("应该清理多余空格", () => {
      expect(sanitizePrompt("  a   cat  ")).toBe("a cat");
    });

    it("应该清理多余逗号", () => {
      expect(sanitizePrompt("a cat,, dog")).toBe("a cat, dog");
    });
  });

  describe("truncatePrompt", () => {
    it("短提示词不截断", () => {
      expect(truncatePrompt("a cat", 100)).toBe("a cat");
    });

    it("长提示词应该截断", () => {
      const long = "a".repeat(200);
      const result = truncatePrompt(long, 100);
      expect(result.length).toBeLessThanOrEqual(103);
    });
  });

  describe("mergePrompts", () => {
    it("应该合并提示词", () => {
      const result = mergePrompts(["a cat", "a dog"]);
      expect(result).toBe("a cat, a dog");
    });

    it("应该过滤空字符串", () => {
      const result = mergePrompts(["a cat", "", "a dog"]);
      expect(result).toBe("a cat, a dog");
    });
  });

  describe("extractPromptKeywords", () => {
    it("应该提取关键词", () => {
      const keywords = extractPromptKeywords("a beautiful girl in forest with flowers");
      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
    });
  });

  describe("createPromptVariations", () => {
    it("应该创建提示词变体", () => {
      const variations = createPromptVariations("a cat", 3);
      expect(variations.length).toBe(3);
      expect(variations[0]).toBe("a cat");
    });

    it("count 为 0 返回空数组", () => {
      expect(createPromptVariations("a cat", 0)).toEqual([]);
    });
  });
});

// ==================== Generation History 测试 ====================
describe("generation-history", () => {
  const {
    addToGenerationHistory,
    getGenerationHistory,
    getGenerationHistoryItem,
    updateGenerationHistoryItem,
    deleteGenerationHistoryItem,
    clearGenerationHistory,
    toggleFavorite,
    addTags,
    removeTags,
    getHistoryStats,
    searchHistoryByPrompt,
    getHistoryHistoryCount,
  } = generationHistory;

  beforeEach(() => {
    clearGenerationHistory();
  });

  describe("addToGenerationHistory", () => {
    it("应该添加历史记录", () => {
      const record = addToGenerationHistory({
        prompt: "test prompt",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      expect(record.id).toBeDefined();
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.prompt).toBe("test prompt");
    });
  });

  describe("getGenerationHistory", () => {
    it("应该返回历史记录列表", () => {
      addToGenerationHistory({
        prompt: "test 1",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const history = getGenerationHistory();
      expect(history.length).toBe(1);
    });

    it("应该支持分页", () => {
      for (let i = 0; i < 10; i++) {
        addToGenerationHistory({
          prompt: `test ${i}`,
          provider: "test",
          model: "test-model",
          imageCount: 1,
          durationMs: 1000,
          success: true,
          imageUrls: [],
        });
      }
      const page = getGenerationHistory({ limit: 5, offset: 5 });
      expect(page.length).toBe(5);
    });

    it("应该按 provider 过滤", () => {
      addToGenerationHistory({
        prompt: "test wanx",
        provider: "wanx",
        model: "wanx-v1",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      addToGenerationHistory({
        prompt: "test hunyuan",
        provider: "hunyuan",
        model: "hunyuan-v1",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const filtered = getGenerationHistory({ provider: "wanx" });
      expect(filtered.length).toBe(1);
      expect(filtered[0].provider).toBe("wanx");
    });
  });

  describe("getGenerationHistoryItem", () => {
    it("应该通过 id 获取记录", () => {
      const added = addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const found = getGenerationHistoryItem(added.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(added.id);
    });
  });

  describe("updateGenerationHistoryItem", () => {
    it("应该更新记录", () => {
      const added = addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const updated = updateGenerationHistoryItem(added.id, { prompt: "updated" });
      expect(updated?.prompt).toBe("updated");
    });
  });

  describe("deleteGenerationHistoryItem", () => {
    it("应该删除记录", () => {
      const added = addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const result = deleteGenerationHistoryItem(added.id);
      expect(result).toBe(true);
      expect(getGenerationHistoryItem(added.id)).toBeUndefined();
    });
  });

  describe("toggleFavorite", () => {
    it("应该切换收藏状态", () => {
      const added = addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const result1 = toggleFavorite(added.id);
      expect(result1).toBe(true);
      const result2 = toggleFavorite(added.id);
      expect(result2).toBe(false);
    });
  });

  describe("addTags & removeTags", () => {
    it("应该添加和移除标签", () => {
      const added = addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      addTags(added.id, ["nature", "landscape"]);
      const item = getGenerationHistoryItem(added.id);
      expect(item?.tags).toContain("nature");
      expect(item?.tags).toContain("landscape");

      removeTags(added.id, ["nature"]);
      const item2 = getGenerationHistoryItem(added.id);
      expect(item2?.tags).not.toContain("nature");
      expect(item2?.tags).toContain("landscape");
    });
  });

  describe("getHistoryStats", () => {
    it("应该返回统计数据", () => {
      addToGenerationHistory({
        prompt: "test",
        provider: "test",
        model: "test-model",
        imageCount: 2,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const stats = getHistoryStats();
      expect(stats.totalGenerations).toBe(1);
      expect(stats.totalImages).toBe(2);
      expect(stats.successRate).toBe(1);
    });
  });

  describe("searchHistoryByPrompt", () => {
    it("应该按提示词搜索", () => {
      addToGenerationHistory({
        prompt: "beautiful cat",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      addToGenerationHistory({
        prompt: "ugly dog",
        provider: "test",
        model: "test-model",
        imageCount: 1,
        durationMs: 1000,
        success: true,
        imageUrls: [],
      });
      const results = searchHistoryByPrompt("cat");
      expect(results.length).toBe(1);
      expect(results[0].prompt).toContain("cat");
    });
  });
});

// ==================== NSFW Checker 测试 ====================
describe("nsfw-checker", () => {
  const {
    checkPromptForNSFW,
    listNSFWCategories,
    validateNSFWCheckOptions,
    getNSFWLevelLabel,
  } = nsfwChecker;

  describe("checkPromptForNSFW", () => {
    it("安全的提示词应该返回安全", () => {
      const result = checkPromptForNSFW("a beautiful garden with flowers");
      expect(result.isSafe).toBe(true);
      expect(result.level).toBe("safe");
    });

    it("包含敏感关键词的提示词应该被标记", () => {
      const result = checkPromptForNSFW("porn content");
      expect(result.isSafe).toBe(false);
      expect(result.flaggedTerms.length).toBeGreaterThan(0);
    });

    it("应该返回净化后的提示词", () => {
      const result = checkPromptForNSFW("porn stars");
      if (!result.isSafe) {
        expect(result.sanitizedPrompt).toBeDefined();
        expect(result.sanitizedPrompt).toContain("***");
      }
    });
  });

  describe("listNSFWCategories", () => {
    it("应该返回 NSFW 分类列表", () => {
      const categories = listNSFWCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });
  });

  describe("validateNSFWCheckOptions", () => {
    it("有效选项返回 null", () => {
      expect(validateNSFWCheckOptions({ threshold: 0.7 })).toBeNull();
    });

    it("无效阈值返回错误", () => {
      const result = validateNSFWCheckOptions({ threshold: 1.5 });
      expect(result).toBeTruthy();
    });
  });

  describe("getNSFWLevelLabel", () => {
    it("应该返回级别标签", () => {
      expect(getNSFWLevelLabel("safe")).toBe("安全");
      expect(getNSFWLevelLabel("questionable")).toBe("疑似");
      expect(getNSFWLevelLabel("unsafe")).toBe("不安全");
    });
  });
});

// ==================== Image Assets 测试 ====================
describe("image-assets (enhanced)", () => {
  const {
    createImageAsset,
    getImageAssetFromCache,
    setImageAssetCache,
    clearImageCache,
    getCacheStats,
    generateFileName,
    calculateImageHash,
    cloneImageAsset,
    validateImageAsset,
    formatFileSize,
    sniffImageMimeType,
    getImageExtension,
  } = imageAssets;

  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);

  beforeEach(() => {
    clearImageCache();
  });

  describe("createImageAsset", () => {
    it("应该创建图像资产", () => {
      const asset = createImageAsset(pngHeader);
      expect(asset.buffer).toBe(pngHeader);
      expect(asset.mimeType).toBe("image/png");
      expect(asset.metadata).toBeDefined();
      expect(asset.metadata?.id).toBeDefined();
    });
  });

  describe("cache operations", () => {
    it("应该设置和获取缓存", () => {
      const asset = createImageAsset(pngHeader);
      setImageAssetCache("test prompt", asset);
      const cached = getImageAssetFromCache("test prompt");
      expect(cached).toBeDefined();
      expect(cached?.buffer).toEqual(pngHeader);
    });

    it("应该清除缓存", () => {
      const asset = createImageAsset(pngHeader);
      setImageAssetCache("test", asset);
      clearImageCache();
      expect(getCacheStats().size).toBe(0);
    });
  });

  describe("generateFileName", () => {
    it("应该生成文件名", () => {
      const name = generateFileName({ baseName: "test", includeTimestamp: false, includeRandom: false });
      expect(name).toBe("test.png");
    });

    it("应该包含索引", () => {
      const name = generateFileName({ baseName: "test", index: 2, includeTimestamp: false, includeRandom: false });
      expect(name).toBe("test_3.png");
    });
  });

  describe("calculateImageHash", () => {
    it("应该计算图像哈希", () => {
      const hash1 = calculateImageHash(pngHeader);
      const hash2 = calculateImageHash(pngHeader);
      expect(hash1).toBe(hash2);
    });
  });

  describe("cloneImageAsset", () => {
    it("应该克隆图像资产", () => {
      const original = createImageAsset(pngHeader);
      const cloned = cloneImageAsset(original);
      expect(cloned.buffer).toEqual(original.buffer);
      expect(cloned.buffer).not.toBe(original.buffer);
    });
  });

  describe("validateImageAsset", () => {
    it("应该验证有效资产", () => {
      const asset = createImageAsset(pngHeader);
      const result = validateImageAsset(asset);
      expect(result.valid).toBe(true);
    });

    it("应该标记无效资产", () => {
      const result = validateImageAsset({ buffer: Buffer.alloc(0), mimeType: "" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("formatFileSize", () => {
    it("应该格式化文件大小", () => {
      expect(formatFileSize(512)).toBe("512 B");
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
      expect(formatFileSize(1024 * 1024 * 1024)).toBe("1.00 GB");
    });
  });
});

// ==================== Watermark 测试 ====================
describe("watermark", () => {
  const {
    getWatermarkPositionCoords,
    listWatermarkPositions,
    validateWatermarkOptions,
  } = watermark;

  describe("getWatermarkPositionCoords", () => {
    it("应该计算左上角坐标", () => {
      const coords = getWatermarkPositionCoords(1000, 1000, 100, 50, "top-left");
      expect(coords.x).toBe(20);
      expect(coords.y).toBe(20);
    });

    it("应该计算右下角坐标", () => {
      const coords = getWatermarkPositionCoords(1000, 1000, 100, 50, "bottom-right");
      expect(coords.x).toBe(880);
      expect(coords.y).toBe(930);
    });

    it("应该计算中心坐标", () => {
      const coords = getWatermarkPositionCoords(1000, 1000, 100, 50, "center");
      expect(coords.x).toBe(450);
      expect(coords.y).toBe(475);
    });
  });

  describe("listWatermarkPositions", () => {
    it("应该返回所有水印位置", () => {
      const positions = listWatermarkPositions();
      expect(Array.isArray(positions)).toBe(true);
      expect(positions.length).toBe(9);
    });
  });

  describe("validateWatermarkOptions", () => {
    it("文字水印选项验证", () => {
      const result = validateWatermarkOptions({
        type: "text",
        text: "test",
        position: "bottom-right",
      });
      expect(result).toBeNull();
    });

    it("空文字应该返回错误", () => {
      const result = validateWatermarkOptions({
        type: "text",
        text: "",
        position: "bottom-right",
      });
      expect(result).toBeTruthy();
    });

    it("无效 opacity 返回错误", () => {
      const result = validateWatermarkOptions({
        type: "text",
        text: "test",
        position: "bottom-right",
        opacity: 1.5,
      });
      expect(result).toBeTruthy();
    });
  });
});

// ==================== Upscaler 测试 ====================
describe("upscaler", () => {
  const {
    getUpscaleDimensions,
    estimateUpscaleDuration,
    getUpscaleMemoryEstimate,
    listUpscaleProviders,
    validateUpscaleOptions,
  } = upscaler;

  describe("getUpscaleDimensions", () => {
    it("应该计算放大后的尺寸", () => {
      const dims = getUpscaleDimensions(1024, 768, 2);
      expect(dims.width).toBe(2048);
      expect(dims.height).toBe(1536);
    });
  });

  describe("estimateUpscaleDuration", () => {
    it("应该估算放大时间", () => {
      const duration = estimateUpscaleDuration(1024, 1024, { scale: 2, mode: "balanced" });
      expect(duration).toBeGreaterThan(0);
    });

    it("高质量模式应该需要更长时间", () => {
      const balanced = estimateUpscaleDuration(1024, 1024, { scale: 2, mode: "balanced" });
      const quality = estimateUpscaleDuration(1024, 1024, { scale: 2, mode: "quality" });
      expect(quality).toBeGreaterThan(balanced);
    });
  });

  describe("getUpscaleMemoryEstimate", () => {
    it("应该估算内存使用", () => {
      const memory = getUpscaleMemoryEstimate(1024, 1024, 2);
      expect(memory).toBeGreaterThan(0);
    });
  });

  describe("listUpscaleProviders", () => {
    it("应该返回放大服务提供商列表", () => {
      const providers = listUpscaleProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers.length).toBeGreaterThan(0);
    });
  });

  describe("validateUpscaleOptions", () => {
    it("有效选项返回 null", () => {
      expect(validateUpscaleOptions({ scale: 2, mode: "balanced" })).toBeNull();
    });

    it("无效缩放比例返回错误", () => {
      const result = validateUpscaleOptions({ scale: 5 as 2 });
      expect(result).toBeTruthy();
    });
  });
});

// ==================== Batch Manager 测试 ====================
describe("batch-manager", () => {
  const {
    createBatch,
    getBatch,
    listBatches,
    getBatchProgress,
    pauseBatch,
    cancelBatch,
    removeBatch,
    getBatchStats,
    clearCompletedBatches,
  } = batchManager;

  beforeEach(() => {
    clearCompletedBatches();
  });

  describe("createBatch", () => {
    it("应该创建批量任务", () => {
      const batch = createBatch(
        ["prompt 1", "prompt 2", "prompt 3"],
        {},
        { name: "test batch" }
      );
      expect(batch.id).toBeDefined();
      expect(batch.totalItems).toBe(3);
      expect(batch.items.length).toBe(3);
      expect(batch.name).toBe("test batch");
    });
  });

  describe("getBatch", () => {
    it("应该获取批量任务", () => {
      const batch = createBatch(["test"], {});
      const found = getBatch(batch.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(batch.id);
    });
  });

  describe("listBatches", () => {
    it("应该列出所有批量任务", () => {
      createBatch(["test1"], {});
      createBatch(["test2"], {});
      const batches = listBatches();
      expect(batches.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getBatchProgress", () => {
    it("应该返回进度信息", () => {
      const batch = createBatch(["test"], {});
      const progress = getBatchProgress(batch.id);
      expect(progress).toBeDefined();
      expect(progress?.total).toBe(1);
      expect(progress?.progressPercent).toBe(0);
    });
  });

  describe("pauseBatch", () => {
    it("应该暂停批量任务", () => {
      const batch = createBatch(["test"], {});
      const result = pauseBatch(batch.id);
      expect(result).toBe(true);
      const updated = getBatch(batch.id);
      expect(updated?.status).toBe("paused");
    });
  });

  describe("cancelBatch", () => {
    it("应该取消批量任务", () => {
      const batch = createBatch(["test1", "test2"], {});
      const result = cancelBatch(batch.id);
      expect(result).toBe(true);
      const updated = getBatch(batch.id);
      expect(updated?.status).toBe("cancelled");
    });
  });

  describe("removeBatch", () => {
    it("应该移除批量任务", () => {
      const batch = createBatch(["test"], {});
      const result = removeBatch(batch.id);
      expect(result).toBe(true);
      expect(getBatch(batch.id)).toBeUndefined();
    });
  });

  describe("getBatchStats", () => {
    it("应该返回统计数据", () => {
      createBatch(["test1"], {});
      createBatch(["test2"], {});
      const stats = getBatchStats();
      expect(stats.totalBatches).toBeGreaterThanOrEqual(2);
      expect(stats.totalItems).toBeGreaterThanOrEqual(2);
    });
  });
});

// ==================== Image Editor 测试 ====================
describe("image-editor", () => {
  const {
    createOutpaintMask,
    validateInpaintRequest,
    validateOutpaintRequest,
    validateVariationRequest,
    getImageInfo,
  } = imageEditor;

  describe("createOutpaintMask", () => {
    it("应该创建外扩蒙版", () => {
      const result = createOutpaintMask(1024, 1024, {
        left: 100,
        right: 100,
        top: 50,
        bottom: 150,
      });
      expect(result.newWidth).toBe(1224);
      expect(result.newHeight).toBe(1224);
      expect(result.maskRect.x).toBe(100);
      expect(result.maskRect.y).toBe(50);
    });

    it("零扩展不改变尺寸", () => {
      const result = createOutpaintMask(1024, 1024, {});
      expect(result.newWidth).toBe(1024);
      expect(result.newHeight).toBe(1024);
    });
  });

  describe("validateInpaintRequest", () => {
    it("应该验证有效的 inpaint 请求", () => {
      const buffer = Buffer.from("test");
      const result = validateInpaintRequest({
        image: buffer,
        mask: buffer,
        prompt: "test prompt",
      });
      expect(result).toBeNull();
    });

    it("空图返回错误", () => {
      const result = validateInpaintRequest({
        image: Buffer.alloc(0),
        mask: Buffer.from("test"),
        prompt: "test",
      });
      expect(result).toBeTruthy();
    });

    it("空提示词返回错误", () => {
      const buffer = Buffer.from("test");
      const result = validateInpaintRequest({
        image: buffer,
        mask: buffer,
        prompt: "",
      });
      expect(result).toBeTruthy();
    });
  });

  describe("validateOutpaintRequest", () => {
    it("应该验证有效的 outpaint 请求", () => {
      const buffer = Buffer.from("test");
      const result = validateOutpaintRequest({
        image: buffer,
        prompt: "test",
        left: 100,
      });
      expect(result).toBeNull();
    });

    it("无扩展方向返回错误", () => {
      const buffer = Buffer.from("test");
      const result = validateOutpaintRequest({
        image: buffer,
        prompt: "test",
      });
      expect(result).toBeTruthy();
    });
  });

  describe("validateVariationRequest", () => {
    it("应该验证有效的 variation 请求", () => {
      const buffer = Buffer.from("test");
      const result = validateVariationRequest({
        image: buffer,
        count: 2,
      });
      expect(result).toBeNull();
    });

    it("无效 count 返回错误", () => {
      const buffer = Buffer.from("test");
      const result = validateVariationRequest({
        image: buffer,
        count: 0,
      });
      expect(result).toBeTruthy();
    });
  });
});
