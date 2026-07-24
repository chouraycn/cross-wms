/**
 * Provider Capability Registry 单元测试 — 移植自 openclaw
 *
 * 验证：
 *  - config 中 image-capable providers 的自动注册
 *  - text-only providers 不被注册
 *  - 空/缺省 config 返回空 registry
 *  - provider id 别名归一化
 */

import { describe, it, expect } from "vitest";
import { buildMediaUnderstandingCapabilityRegistry } from "../provider-capability-registry.js";
import type { OpenClawConfig } from "../../config/types.openclaw.js";

describe("buildMediaUnderstandingCapabilityRegistry", () => {
  it("returns empty registry when cfg is undefined", () => {
    const registry = buildMediaUnderstandingCapabilityRegistry(undefined);
    expect(registry.size).toBe(0);
  });

  it("returns empty registry when models is undefined", () => {
    const cfg = {} as OpenClawConfig;
    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });

  it("returns empty registry when providers is undefined", () => {
    const cfg = { models: {} } as unknown as OpenClawConfig;
    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });

  it("returns empty registry when no providers have image-capable models", () => {
    const cfg = {
      models: {
        providers: {
          openai: {
            models: [{ id: "gpt-4", input: ["text"] }],
          },
          anthropic: {
            models: [{ id: "claude-3", input: ["text"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;
    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });

  it("auto-registers providers with image-capable models", () => {
    const cfg = {
      models: {
        providers: {
          glm: {
            models: [{ id: "glm-4.6v", input: ["text", "image"] }],
          },
          textOnly: {
            models: [{ id: "text-model", input: ["text"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);

    expect(registry.get("glm")?.capabilities).toEqual(["image"]);
    expect(registry.get("textonly")).toBeUndefined();
  });

  it("registers provider when any model in its list accepts image input", () => {
    const cfg = {
      models: {
        providers: {
          multi: {
            models: [
              { id: "text-only", input: ["text"] },
              { id: "vision", input: ["text", "image"] },
            ],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("multi")?.capabilities).toEqual(["image"]);
  });

  it("normalizes gemini alias to google", () => {
    const cfg = {
      models: {
        providers: {
          gemini: {
            models: [{ id: "gemini-1.5-pro", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("google")?.capabilities).toEqual(["image"]);
    expect(registry.get("gemini")).toBeUndefined();
  });

  it("normalizes minimax-cn alias to minimax", () => {
    const cfg = {
      models: {
        providers: {
          "minimax-cn": {
            models: [{ id: "abab6.5", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("minimax")?.capabilities).toEqual(["image"]);
    expect(registry.get("minimax-cn")).toBeUndefined();
  });

  it("normalizes minimax-portal-cn alias to minimax-portal", () => {
    const cfg = {
      models: {
        providers: {
          "minimax-portal-cn": {
            models: [{ id: "abab6.5s", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("minimax-portal")?.capabilities).toEqual(["image"]);
  });

  it("skips providers with non-array models", () => {
    const cfg = {
      models: {
        providers: {
          broken: { models: "not-an-array" },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });

  it("skips providers with non-object config", () => {
    const cfg = {
      models: {
        providers: {
          invalid: "not-an-object",
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });

  it("registers multiple image-capable providers", () => {
    const cfg = {
      models: {
        providers: {
          glm: {
            models: [{ id: "glm-4.6v", input: ["text", "image"] }],
          },
          google: {
            models: [{ id: "gemini-pro-vision", input: ["text", "image"] }],
          },
          openai: {
            models: [{ id: "gpt-4o", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(3);
    expect(registry.get("glm")?.capabilities).toEqual(["image"]);
    expect(registry.get("google")?.capabilities).toEqual(["image"]);
    expect(registry.get("openai")?.capabilities).toEqual(["image"]);
  });

  it("lowercases provider ids", () => {
    const cfg = {
      models: {
        providers: {
          OpenAI: {
            models: [{ id: "gpt-4o", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("openai")?.capabilities).toEqual(["image"]);
    expect(registry.get("OpenAI")).toBeUndefined();
  });

  it("trims whitespace from provider ids", () => {
    const cfg = {
      models: {
        providers: {
          "  openai  ": {
            models: [{ id: "gpt-4o", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.get("openai")?.capabilities).toEqual(["image"]);
  });

  it("ignores providers with empty keys", () => {
    const cfg = {
      models: {
        providers: {
          "   ": {
            models: [{ id: "gpt-4o", input: ["text", "image"] }],
          },
        },
      },
    } as unknown as OpenClawConfig;

    const registry = buildMediaUnderstandingCapabilityRegistry(cfg);
    expect(registry.size).toBe(0);
  });
});
