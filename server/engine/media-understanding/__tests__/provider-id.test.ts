/**
 * Provider ID Normalization 单元测试
 *
 * 验证 provider id 归一化逻辑：
 *  - 大小写归一化
 *  - 空白修剪
 *  - gemini → google 别名
 *  - minimax-cn → minimax 别名
 *  - minimax-portal-cn → minimax-portal 别名
 *  - 其他 provider id 原样返回（归一化后）
 */

import { describe, it, expect } from "vitest";
import { normalizeMediaProviderId } from "../provider-id.js";

describe("normalizeMediaProviderId", () => {
  it("lowercases provider ids", () => {
    expect(normalizeMediaProviderId("OpenAI")).toBe("openai");
    expect(normalizeMediaProviderId("ANTHROPIC")).toBe("anthropic");
  });

  it("trims whitespace", () => {
    expect(normalizeMediaProviderId("  openai  ")).toBe("openai");
    expect(normalizeMediaProviderId("\tgoogle\n")).toBe("google");
  });

  it("maps gemini alias to google", () => {
    expect(normalizeMediaProviderId("gemini")).toBe("google");
    expect(normalizeMediaProviderId("Gemini")).toBe("google");
    expect(normalizeMediaProviderId("  GEMINI  ")).toBe("google");
  });

  it("maps minimax-cn alias to minimax", () => {
    expect(normalizeMediaProviderId("minimax-cn")).toBe("minimax");
    expect(normalizeMediaProviderId("MiniMax-CN")).toBe("minimax");
    expect(normalizeMediaProviderId("  MINIMAX-CN  ")).toBe("minimax");
  });

  it("maps minimax-portal-cn alias to minimax-portal", () => {
    expect(normalizeMediaProviderId("minimax-portal-cn")).toBe("minimax-portal");
    expect(normalizeMediaProviderId("MiniMax-Portal-CN")).toBe("minimax-portal");
  });

  it("returns non-aliased ids lowercased and trimmed", () => {
    expect(normalizeMediaProviderId("openai")).toBe("openai");
    expect(normalizeMediaProviderId("anthropic")).toBe("anthropic");
    expect(normalizeMediaProviderId("glm")).toBe("glm");
    expect(normalizeMediaProviderId("Qwen")).toBe("qwen");
  });

  it("handles empty string", () => {
    expect(normalizeMediaProviderId("")).toBe("");
    expect(normalizeMediaProviderId("   ")).toBe("");
  });

  it("does not map partial matches", () => {
    expect(normalizeMediaProviderId("geminiai")).toBe("geminiai");
    expect(normalizeMediaProviderId("minimax-cn-extra")).toBe("minimax-cn-extra");
  });
});
