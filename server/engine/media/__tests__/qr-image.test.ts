/**
 * qr-image 单元测试
 *
 * qrcode 是可选依赖（本机未安装），通过 vi.mock + vi.hoisted 提供可控的运行时，
 * 不对 qrcode 进行静态导入以避免 vite 在解析期报错。
 * writeQrPngTempFile 使用真实临时目录写入 PNG 文件。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(
    async (text: string, opts?: Record<string, unknown>) =>
      `data:image/png;base64,${Buffer.from(`${text}:${JSON.stringify(opts ?? {})}`).toString("base64")}`,
  ),
  toString: vi.fn(async (text: string) => text),
  create: vi.fn((text: string) => ({ modules: { data: [true], size: 1 } })),
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: mocks.toDataURL,
    toString: mocks.toString,
    create: mocks.create,
  },
}));

import {
  renderQrPngBase64,
  formatQrPngDataUrl,
  renderQrPngDataUrl,
  writeQrPngTempFile,
} from "../qr-image.js";

const toDataURLMock = mocks.toDataURL;

const TMP_ROOT = path.join(os.tmpdir(), "cross-wms-qr-image-tests");

describe("media / qr-image", () => {
  beforeEach(() => {
    toDataURLMock.mockClear();
    try {
      fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  it("formatQrPngDataUrl 应加上 PNG data URL 前缀", () => {
    expect(formatQrPngDataUrl("abcd")).toBe("data:image/png;base64,abcd");
  });

  it("renderQrPngBase64 应返回不带前缀的 base64", async () => {
    const b64 = await renderQrPngBase64("hello");
    expect(typeof b64).toBe("string");
    expect(b64.startsWith("data:image/png;base64,")).toBe(false);
    expect(b64.length).toBeGreaterThan(0);
  });

  it("renderQrPngBase64 默认参数应正常工作", async () => {
    await expect(renderQrPngBase64("hello")).resolves.toEqual(expect.any(String));
    expect(toDataURLMock).toHaveBeenCalledTimes(1);
    const opts = toDataURLMock.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.type).toBe("image/png");
    expect(opts.scale).toBe(6); // DEFAULT_QR_PNG_SCALE
    expect(opts.margin).toBe(4); // DEFAULT_QR_PNG_MARGIN_MODULES
  });

  it("renderQrPngBase64 应接受范围内的自定义 scale/marginModules", async () => {
    await renderQrPngBase64("hi", { scale: 8, marginModules: 2 });
    const opts = toDataURLMock.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.scale).toBe(8);
    expect(opts.margin).toBe(2);
  });

  it("renderQrPngBase64 scale 超过上限应抛出 RangeError", async () => {
    await expect(renderQrPngBase64("hi", { scale: 13 })).rejects.toThrow(RangeError);
  });

  it("renderQrPngBase64 scale 小于下限应抛出 RangeError", async () => {
    await expect(renderQrPngBase64("hi", { scale: 0 })).rejects.toThrow(RangeError);
  });

  it("renderQrPngBase64 marginModules 超过上限应抛出 RangeError", async () => {
    await expect(renderQrPngBase64("hi", { marginModules: 17 })).rejects.toThrow(RangeError);
  });

  it("renderQrPngBase64 非有限 scale 应抛出 RangeError", async () => {
    await expect(renderQrPngBase64("hi", { scale: Number.NaN })).rejects.toThrow(RangeError);
    await expect(renderQrPngBase64("hi", { scale: Number.POSITIVE_INFINITY })).rejects.toThrow(
      RangeError,
    );
  });

  it("renderQrPngDataUrl 应返回完整 data URL", async () => {
    const url = await renderQrPngDataUrl("world");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("writeQrPngTempFile 应写入文件并返回路径信息", async () => {
    const result = await writeQrPngTempFile("payload", {
      tmpRoot: TMP_ROOT,
      dirPrefix: "qr-",
      fileName: "out.png",
    });
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(result.dirPath.startsWith(TMP_ROOT)).toBe(true);
    expect(result.mediaLocalRoots).toContain(result.dirPath);
    expect(path.basename(result.filePath)).toBe("out.png");
  });

  it("writeQrPngTempFile 非法 dirPrefix 应抛出 RangeError", async () => {
    await expect(
      writeQrPngTempFile("payload", { tmpRoot: TMP_ROOT, dirPrefix: "..", fileName: "x.png" }),
    ).rejects.toThrow(RangeError);
  });

  it("writeQrPngTempFile 非法 fileName 应抛出 RangeError", async () => {
    await expect(
      writeQrPngTempFile("payload", { tmpRoot: TMP_ROOT, dirPrefix: "qr-", fileName: ".." }),
    ).rejects.toThrow(RangeError);
  });
});
