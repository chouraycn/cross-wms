/**
 * qr-terminal 单元测试
 *
 * qrcode 是可选依赖（本机未安装），通过 vi.mock + vi.hoisted 提供可控的运行时，
 * 不对 qrcode 进行静态导入以避免 vite 在解析期报错。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(
    async (text: string) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
  ),
  toString: vi.fn(
    async (text: string, opts?: Record<string, unknown>) =>
      `terminal:${text}:${opts?.type ?? ""}`,
  ),
  create: vi.fn((text: string) => ({
    modules: {
      data: [true, false, true, true],
      size: 2,
    },
  })),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: mocks.toDataURL,
    toString: mocks.toString,
    create: mocks.create,
  },
}));

import { renderQrTerminal } from "../qr-terminal.js";

const toStringMock = mocks.toString;
const createMock = mocks.create;

describe("media / qr-terminal", () => {
  beforeEach(() => {
    toStringMock.mockClear();
    createMock.mockClear();
  });

  it("small=false 应委托给 qrcode.toString 并返回其结果", async () => {
    const out = await renderQrTerminal("hello", { small: false });
    expect(toStringMock).toHaveBeenCalledTimes(1);
    expect(out).toBe("terminal:hello:terminal");
  });

  it("默认选项（small 未设置）应使用 toString 路径", async () => {
    const out = await renderQrTerminal("world");
    expect(toStringMock).toHaveBeenCalledTimes(1);
    const opts = toStringMock.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.type).toBe("terminal");
    expect(opts.small).toBe(false);
    expect(out).toContain("world");
  });

  it("small=true 应使用 create + 紧凑渲染（不调用 toString）", async () => {
    const out = await renderQrTerminal("abc", { small: true });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(toStringMock).not.toHaveBeenCalled();
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("small=true 输出应包含 ANSI 黑底白字转义序列", async () => {
    const out = await renderQrTerminal("abc", { small: true });
    expect(out).toContain("\x1b[47m\x1b[30m");
    expect(out).toContain("\x1b[0m");
  });

  it("small=true 输出应为多行（由换行连接）", async () => {
    const out = await renderQrTerminal("abc", { small: true });
    expect(out.split("\n").length).toBeGreaterThan(1);
  });

  it("空字符串输入应抛出错误", async () => {
    await expect(renderQrTerminal("", { small: false })).rejects.toThrow(
      "QR text must not be empty",
    );
  });

  it("非字符串输入应抛出 TypeError", async () => {
    await expect(
      renderQrTerminal(42 as unknown as string, { small: false }),
    ).rejects.toThrow(TypeError);
  });

  it("small=true 应将文本传给 create", async () => {
    await renderQrTerminal("compact-text", { small: true });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toBe("compact-text");
  });

  it("small=true 在模块尺寸为 2 时输出行数符合预期", async () => {
    const out = await renderQrTerminal("x", { small: true });
    // size=2，循环 y 从 -1 到 < size+1(=3) 步进 2：y=-1,1 → 共 2 行
    expect(out.split("\n").length).toBe(2);
  });
});
