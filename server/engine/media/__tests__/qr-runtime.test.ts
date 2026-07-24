/**
 * qr-runtime 单元测试
 *
 * qrcode 是可选依赖（本机未安装），通过 vi.mock 提供可控的运行时。
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`),
    toString: vi.fn(async (text: string) => text),
    create: vi.fn((text: string) => ({ modules: { data: [true, false, true], size: 1 } })),
  },
}));

import { loadQrCodeRuntime, normalizeQrText } from "../qr-runtime.js";

describe("media / qr-runtime", () => {
  describe("normalizeQrText", () => {
    it("合法字符串应原样返回", () => {
      expect(normalizeQrText("hello")).toBe("hello");
    });

    it("空字符串应抛出错误", () => {
      expect(() => normalizeQrText("")).toThrow("QR text must not be empty");
    });

    it("非字符串应抛出 TypeError", () => {
      expect(() => normalizeQrText(123 as unknown as string)).toThrow(TypeError);
      expect(() => normalizeQrText(undefined as unknown as string)).toThrow(TypeError);
    });

    it("空白字符串（长度非 0）应原样返回", () => {
      expect(normalizeQrText(" ")).toBe(" ");
      expect(normalizeQrText("   ")).toBe("   ");
    });

    it("Unicode 字符串应原样返回", () => {
      const text = "你好世界🌍";
      expect(normalizeQrText(text)).toBe(text);
    });
  });

  describe("loadQrCodeRuntime", () => {
    it("应返回包含 toDataURL/toString/create 方法的运行时", async () => {
      const runtime = await loadQrCodeRuntime();
      expect(typeof runtime.toDataURL).toBe("function");
      expect(typeof runtime.toString).toBe("function");
      expect(typeof runtime.create).toBe("function");
    });

    it("多次调用应返回同一实例（懒加载缓存）", async () => {
      const a = await loadQrCodeRuntime();
      const b = await loadQrCodeRuntime();
      expect(a).toBe(b);
    });

    it("toDataURL 应返回 PNG data URL", async () => {
      const runtime = await loadQrCodeRuntime();
      const url = await runtime.toDataURL("abc");
      expect(url.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("create 应返回带 modules 的对象", async () => {
      const runtime = await loadQrCodeRuntime();
      const created = runtime.create("x");
      expect(created.modules).toBeDefined();
      expect(typeof created.modules.size).toBe("number");
    });
  });
});
