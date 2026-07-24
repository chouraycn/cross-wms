/**
 * Entry Capabilities 单元测试 — 移植自 openclaw
 *
 * 验证媒体能力解析逻辑：
 *  - 显式 capabilities 标签的过滤与返回
 *  - shared provider entries 从 registry 推断能力
 *  - matchesMediaEntryCapability 的匹配规则
 */

import { describe, it, expect } from "vitest";
import {
  resolveConfiguredMediaEntryCapabilities,
  resolveEffectiveMediaEntryCapabilities,
  matchesMediaEntryCapability,
} from "../entry-capabilities.js";
import type { MediaUnderstandingCapabilityRegistry } from "../types.js";
import type { MediaUnderstandingModelConfig as ModelConfig } from "../../config/types.tools.js";

describe("resolveConfiguredMediaEntryCapabilities", () => {
  it("returns undefined when capabilities is not an array", () => {
    const entry = { provider: "openai" } as unknown as ModelConfig;
    expect(resolveConfiguredMediaEntryCapabilities(entry)).toBeUndefined();
  });

  it("returns undefined when capabilities array is empty", () => {
    const entry = { provider: "openai", capabilities: [] } as unknown as ModelConfig;
    expect(resolveConfiguredMediaEntryCapabilities(entry)).toBeUndefined();
  });

  it("filters out invalid capability tags", () => {
    const entry = {
      provider: "openai",
      capabilities: ["image", "invalid", "audio"],
    } as unknown as ModelConfig;
    expect(resolveConfiguredMediaEntryCapabilities(entry)).toEqual(["image", "audio"]);
  });

  it("returns undefined when all capability tags are invalid", () => {
    const entry = {
      provider: "openai",
      capabilities: ["invalid", "unknown"],
    } as unknown as ModelConfig;
    expect(resolveConfiguredMediaEntryCapabilities(entry)).toBeUndefined();
  });

  it("returns valid capabilities preserving order", () => {
    const entry = {
      provider: "openai",
      capabilities: ["video", "image", "audio"],
    } as unknown as ModelConfig;
    expect(resolveConfiguredMediaEntryCapabilities(entry)).toEqual(["video", "image", "audio"]);
  });
});

describe("resolveEffectiveMediaEntryCapabilities", () => {
  const registry: MediaUnderstandingCapabilityRegistry = new Map([
    ["openai", { capabilities: ["image", "audio"] }],
    ["google", { capabilities: ["image", "video", "audio"] }],
  ]);

  it("returns configured capabilities when present", () => {
    const entry = {
      provider: "openai",
      capabilities: ["video"],
    } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toEqual(["video"]);
  });

  it("returns undefined when source is not shared and no configured capabilities", () => {
    const entry = { provider: "openai" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "capability",
        providerRegistry: registry,
      }),
    ).toBeUndefined();
  });

  it("returns undefined for cli entries without configured capabilities", () => {
    const entry = {
      provider: "openai",
      command: "whisper",
      type: "cli" as const,
    } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toBeUndefined();
  });

  it("infers capabilities from registry for shared provider entries", () => {
    const entry = { provider: "google" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toEqual(["image", "video", "audio"]);
  });

  it("returns undefined when provider is not in registry", () => {
    const entry = { provider: "unknown-provider" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toBeUndefined();
  });

  it("returns undefined when provider id is empty", () => {
    const entry = { provider: "" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toBeUndefined();
  });

  it("normalizes gemini alias to google", () => {
    const entry = { provider: "Gemini" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: registry,
      }),
    ).toEqual(["image", "video", "audio"]);
  });

  it("normalizes minimax-cn alias to minimax", () => {
    const minimaxRegistry: MediaUnderstandingCapabilityRegistry = new Map([
      ["minimax", { capabilities: ["audio"] }],
    ]);
    const entry = { provider: "MiniMax-CN" } as unknown as ModelConfig;
    expect(
      resolveEffectiveMediaEntryCapabilities({
        entry,
        source: "shared",
        providerRegistry: minimaxRegistry,
      }),
    ).toEqual(["audio"]);
  });
});

describe("matchesMediaEntryCapability", () => {
  const registry: MediaUnderstandingCapabilityRegistry = new Map([
    ["openai", { capabilities: ["image", "audio"] }],
  ]);

  it("returns true when configured capabilities include requested capability", () => {
    const entry = {
      provider: "openai",
      capabilities: ["image", "audio"],
    } as unknown as ModelConfig;
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "shared",
        capability: "image",
        providerRegistry: registry,
      }),
    ).toBe(true);
  });

  it("returns false when configured capabilities exclude requested capability", () => {
    const entry = {
      provider: "openai",
      capabilities: ["audio"],
    } as unknown as ModelConfig;
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "shared",
        capability: "image",
        providerRegistry: registry,
      }),
    ).toBe(false);
  });

  it("returns true for capability source when no capabilities are configured", () => {
    const entry = { provider: "unknown" } as unknown as ModelConfig;
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "capability",
        capability: "image",
        providerRegistry: registry,
      }),
    ).toBe(true);
  });

  it("returns false for shared source when no capabilities can be resolved", () => {
    const entry = { provider: "unknown" } as unknown as ModelConfig;
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "shared",
        capability: "image",
        providerRegistry: registry,
      }),
    ).toBe(false);
  });

  it("infers capabilities from registry for shared entries", () => {
    const entry = { provider: "openai" } as unknown as ModelConfig;
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "shared",
        capability: "image",
        providerRegistry: registry,
      }),
    ).toBe(true);
    expect(
      matchesMediaEntryCapability({
        entry,
        source: "shared",
        capability: "video",
        providerRegistry: registry,
      }),
    ).toBe(false);
  });
});
