// Tests for the simplified media-generation runtime-shared helpers.
import { describe, expect, it } from "vitest";
import {
  MAX_TIMER_TIMEOUT_MS,
  clampTimerTimeoutMs,
  deriveAspectRatioFromSize,
  normalizeDurationToClosestMax,
  resolveClosestAspectRatio,
  resolveClosestResolution,
  resolveClosestSize,
  resolveMediaProviderDefaultTimeoutMs,
  resolveMediaProviderRequestTimeoutMs,
  recordCapabilityCandidateFailure,
  throwCapabilityGenerationFailure,
  buildMediaGenerationNormalizationMetadata,
  buildNoCapabilityModelConfiguredMessage,
} from "../runtime-shared.js";

describe("media-generation timeout normalization", () => {
  it("应该将超大超时值钳制到 MAX_TIMER_TIMEOUT_MS", () => {
    expect(resolveMediaProviderDefaultTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(
      MAX_TIMER_TIMEOUT_MS,
    );
  });

  it("应该拒绝非正/非有限超时值", () => {
    expect(resolveMediaProviderDefaultTimeoutMs(0)).toBeUndefined();
    expect(resolveMediaProviderDefaultTimeoutMs(-1)).toBeUndefined();
    expect(resolveMediaProviderDefaultTimeoutMs(NaN)).toBeUndefined();
    expect(resolveMediaProviderDefaultTimeoutMs(Infinity)).toBeUndefined();
    expect(resolveMediaProviderDefaultTimeoutMs(undefined)).toBeUndefined();
  });

  it("应该保留有效超时值（钳制到整数）", () => {
    expect(resolveMediaProviderDefaultTimeoutMs(30_000)).toBe(30_000);
    expect(resolveMediaProviderDefaultTimeoutMs(30_000.9)).toBe(30_000);
  });

  it("resolveMediaProviderRequestTimeoutMs 应该优先使用 per-request 超时", () => {
    expect(
      resolveMediaProviderRequestTimeoutMs({
        timeoutMs: 10_000,
        providerDefaultTimeoutMs: 30_000,
      }),
    ).toBe(10_000);
  });

  it("resolveMediaProviderRequestTimeoutMs 无 per-request 时回退到 provider 默认", () => {
    expect(
      resolveMediaProviderRequestTimeoutMs({
        timeoutMs: 0,
        providerDefaultTimeoutMs: 45_000,
      }),
    ).toBe(45_000);
  });

  it("clampTimerTimeoutMs 应该钳制到 [1, MAX]", () => {
    expect(clampTimerTimeoutMs(500)).toBe(500);
    expect(clampTimerTimeoutMs(0)).toBe(1);
    expect(clampTimerTimeoutMs(Number.MAX_SAFE_INTEGER)).toBe(MAX_TIMER_TIMEOUT_MS);
    expect(clampTimerTimeoutMs("not-a-number")).toBeUndefined();
  });
});

describe("media-generation aspect ratio derivation", () => {
  it("应该从尺寸推导出约分宽高比", () => {
    expect(deriveAspectRatioFromSize("1280x720")).toBe("16:9");
    expect(deriveAspectRatioFromSize("1024x1536")).toBe("2:3");
    expect(deriveAspectRatioFromSize("1920x1080")).toBe("16:9");
  });

  it("无效尺寸应返回 undefined", () => {
    expect(deriveAspectRatioFromSize("invalid")).toBeUndefined();
    expect(deriveAspectRatioFromSize("0x0")).toBeUndefined();
    expect(deriveAspectRatioFromSize(undefined)).toBeUndefined();
  });

  it("应该拒绝超出安全整数范围的尺寸", () => {
    expect(deriveAspectRatioFromSize("9007199254740993x3")).toBeUndefined();
  });
});

describe("media-generation closest aspect ratio", () => {
  it("无支持列表时应返回请求值或推导值", () => {
    expect(
      resolveClosestAspectRatio({ requestedAspectRatio: "16:9" }),
    ).toBe("16:9");
    expect(
      resolveClosestAspectRatio({ requestedSize: "1280x720" }),
    ).toBe("16:9");
  });

  it("请求值在支持列表中时应直接返回", () => {
    expect(
      resolveClosestAspectRatio({
        requestedAspectRatio: "16:9",
        supportedAspectRatios: ["1:1", "4:3", "16:9"],
      }),
    ).toBe("16:9");
  });

  it("应该映射到最接近的支持宽高比", () => {
    expect(
      resolveClosestAspectRatio({
        requestedAspectRatio: "17:10",
        supportedAspectRatios: ["1:1", "4:3", "16:9"],
      }),
    ).toBe("16:9");
  });
});

describe("media-generation closest size", () => {
  it("无支持列表时应返回请求尺寸", () => {
    expect(resolveClosestSize({ requestedSize: "1792x1024" })).toBe("1792x1024");
  });

  it("请求值在支持列表中时应直接返回", () => {
    expect(
      resolveClosestSize({
        requestedSize: "1024x1024",
        supportedSizes: ["1024x1024", "1536x1024"],
      }),
    ).toBe("1024x1024");
  });

  it("应该映射到最接近的支持尺寸", () => {
    expect(
      resolveClosestSize({
        requestedSize: "1792x1024",
        supportedSizes: ["1024x1024", "1024x1536", "1536x1024"],
      }),
    ).toBe("1536x1024");
  });

  it("应该拒绝超出安全整数的尺寸", () => {
    expect(
      resolveClosestSize({
        requestedSize: "9007199254740993x3",
        supportedSizes: ["1024x1024", "1536x1024"],
      }),
    ).toBeUndefined();
  });
});

describe("media-generation closest resolution", () => {
  it("无支持列表时应返回请求值", () => {
    expect(
      resolveClosestResolution({ requestedResolution: "2K" }),
    ).toBe("2K");
  });

  it("请求值在支持列表中时应直接返回", () => {
    expect(
      resolveClosestResolution({
        requestedResolution: "1K",
        supportedResolutions: ["1K", "4K"],
      }),
    ).toBe("1K");
  });

  it("应该按 K 单位数值距离映射", () => {
    expect(
      resolveClosestResolution({
        requestedResolution: "2K",
        supportedResolutions: ["1K", "4K"],
      }),
    ).toBe("1K");
  });

  it("应该按 P 单位数值距离映射", () => {
    expect(
      resolveClosestResolution({
        requestedResolution: "480P",
        supportedResolutions: ["360P", "540P", "720P"],
        order: ["360P", "480P", "540P", "720P"],
      }),
    ).toBe("540P");
  });

  it("不应该跨 K/P 单位映射", () => {
    expect(
      resolveClosestResolution({
        requestedResolution: "4K",
        supportedResolutions: ["768P", "1080P"],
        order: ["360P", "480P", "540P", "720P", "768P", "1080P"],
      }),
    ).toBeUndefined();
  });
});

describe("media-generation duration normalization", () => {
  it("应该四舍五入到正整数", () => {
    expect(normalizeDurationToClosestMax(5.4)).toBe(5);
    expect(normalizeDurationToClosestMax(5.6)).toBe(6);
  });

  it("应该钳制到 maxDurationSeconds", () => {
    expect(normalizeDurationToClosestMax(12, 8)).toBe(8);
    expect(normalizeDurationToClosestMax(6, 8)).toBe(6);
  });

  it("无效输入应返回 undefined", () => {
    expect(normalizeDurationToClosestMax(NaN)).toBeUndefined();
    expect(normalizeDurationToClosestMax(undefined)).toBeUndefined();
    expect(normalizeDurationToClosestMax(Infinity)).toBeUndefined();
  });
});

describe("media-generation failure summarization", () => {
  it("recordCapabilityCandidateFailure 应该记录失败尝试", () => {
    const attempts: any[] = [];
    recordCapabilityCandidateFailure({
      attempts,
      provider: "openai",
      model: "gpt-image-1",
      error: new Error("rate limited"),
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0].provider).toBe("openai");
    expect(attempts[0].model).toBe("gpt-image-1");
    expect(attempts[0].error).toBe("rate limited");
  });

  it("单次失败时 throwCapabilityGenerationFailure 应抛出原始错误对象", () => {
    const originalError = new Error("single failure");
    expect(() =>
      throwCapabilityGenerationFailure({
        capabilityLabel: "image generation",
        attempts: [
          { provider: "openai", model: "gpt-image-1", error: "single failure" },
        ],
        lastError: originalError,
      }),
    ).toThrow();
  });

  it("多次失败时应抛出汇总错误", () => {
    expect(() =>
      throwCapabilityGenerationFailure({
        capabilityLabel: "music generation",
        attempts: [
          {
            provider: "google",
            model: "lyria-3-clip-preview",
            error: "Manually set deadline 1s is too short. Minimum allowed deadline is 10s.",
          },
          {
            provider: "minimax",
            model: "music-2.6",
            error: "This operation was aborted",
          },
        ],
        lastError: new Error("This operation was aborted"),
      }),
    ).toThrow(
      /All music generation models failed \(2\): google\/lyria-3-clip-preview: Manually set deadline.*\| 1 fallback\(s\) aborted/,
    );
  });

  it("全部中止时应汇总为中止摘要", () => {
    expect(() =>
      throwCapabilityGenerationFailure({
        capabilityLabel: "music generation",
        attempts: [
          { provider: "minimax", model: "music-2.6", error: "This operation was aborted" },
          { provider: "google", model: "lyria-3", error: "Operation was aborted" },
        ],
        lastError: new Error("This operation was aborted"),
      }),
    ).toThrow(/2 fallback\(s\) aborted after the request was cancelled or timed out/);
  });
});

describe("media-generation normalization metadata", () => {
  it("应该构建尺寸归一化元数据", () => {
    const metadata = buildMediaGenerationNormalizationMetadata({
      normalization: {
        size: { requested: "1792x1024", applied: "1536x1024" },
      },
    });
    expect(metadata.requestedSize).toBe("1792x1024");
    expect(metadata.normalizedSize).toBe("1536x1024");
  });

  it("应该构建从尺寸推导的宽高比元数据", () => {
    const metadata = buildMediaGenerationNormalizationMetadata({
      normalization: {
        aspectRatio: { applied: "16:9", derivedFrom: "size" },
      },
      requestedSizeForDerivedAspectRatio: "1280x720",
    });
    expect(metadata.normalizedAspectRatio).toBe("16:9");
    expect(metadata.requestedSize).toBe("1280x720");
    expect(metadata.aspectRatioDerivedFromSize).toBe("16:9");
  });

  it("应该构建时长归一化元数据（含支持值）", () => {
    const metadata = buildMediaGenerationNormalizationMetadata({
      normalization: {
        durationSeconds: {
          requested: "12",
          applied: "8",
          supportedValues: ["4", "8", "12"],
        },
      },
      includeSupportedDurationSeconds: true,
    });
    expect(metadata.requestedDurationSeconds).toBe("12");
    expect(metadata.normalizedDurationSeconds).toBe("8");
    expect(metadata.supportedDurationSeconds).toEqual(["4", "8", "12"]);
  });

  it("空归一化应返回空对象", () => {
    const metadata = buildMediaGenerationNormalizationMetadata({});
    expect(metadata).toEqual({});
  });
});

describe("media-generation no-config message", () => {
  it("应该生成未配置提示（含 env var 提示）", () => {
    const message = buildNoCapabilityModelConfiguredMessage({
      capabilityLabel: "image generation",
      modelConfigKey: "imageModel",
      providers: [
        { id: "openai", defaultModel: "gpt-image-1" },
        { id: "fal", defaultModel: "fal-ai/flux/dev" },
      ],
      getProviderEnvVars: (id) => (id === "openai" ? ["OPENAI_API_KEY"] : []),
    });
    expect(message).toContain("No image generation model configured");
    expect(message).toContain("agents.defaults.imageModel.primary");
    expect(message).toContain("openai/gpt-image-1");
    expect(message).toContain("OPENAI_API_KEY");
  });

  it("无 env var 提示时应使用通用文案", () => {
    const message = buildNoCapabilityModelConfiguredMessage({
      capabilityLabel: "music generation",
      modelConfigKey: "musicModel",
      providers: [{ id: "google", defaultModel: "lyria-3" }],
    });
    expect(message).toContain("No music generation model configured");
    expect(message).toContain("configure that provider's auth/API key first");
    expect(message).not.toContain(":");
  });

  it("无 provider 默认模型时使用 fallback sample ref", () => {
    const message = buildNoCapabilityModelConfiguredMessage({
      capabilityLabel: "video generation",
      modelConfigKey: "videoModel",
      providers: [],
      fallbackSampleRef: "<provider>/<model>",
    });
    expect(message).toContain("<provider>/<model>");
  });
});
