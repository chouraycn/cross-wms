/**
 * pdf-extract 单元测试
 *
 * 通过 vi.mock 替换 document-extractors.runtime，隔离 pdf-parse 的真实调用。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../document-extractors.runtime.js", () => ({
  extractDocumentContent: vi.fn(),
}));

import { extractDocumentContent } from "../document-extractors.runtime.js";
import { extractPdfContent } from "../pdf-extract.js";

const mockExtract = vi.mocked(extractDocumentContent);

describe("media / pdf-extract", () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  it("成功时应返回 text 与 images 字段", async () => {
    mockExtract.mockResolvedValue({
      text: "hello pdf",
      images: [],
      extractor: "pdf-parse",
    });
    const result = await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result.text).toBe("hello pdf");
    expect(result.images).toEqual([]);
  });

  it("底层返回 null 时应抛出 PDF 抽取不可用错误", async () => {
    mockExtract.mockResolvedValue(null);
    await expect(
      extractPdfContent({
        buffer: Buffer.from([1]),
        maxPages: 10,
        maxPixels: 1000,
        minTextChars: 1,
      }),
    ).rejects.toThrow(/PDF extraction disabled or unavailable/);
  });

  it("底层抛错时应向上传播", async () => {
    mockExtract.mockRejectedValue(new Error("boom"));
    await expect(
      extractPdfContent({
        buffer: Buffer.from([1]),
        maxPages: 10,
        maxPixels: 1000,
        minTextChars: 1,
      }),
    ).rejects.toThrow("boom");
  });

  it("应使用 application/pdf 调用底层抽取器", async () => {
    mockExtract.mockResolvedValue({ text: "", images: [], extractor: "x" });
    await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
    });
    expect(mockExtract).toHaveBeenCalledTimes(1);
    const args = mockExtract.mock.calls[0][0];
    expect(args.mimeType).toBe("application/pdf");
  });

  it("应透传 password 给底层抽取器", async () => {
    mockExtract.mockResolvedValue({ text: "", images: [], extractor: "x" });
    await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
      password: "secret",
    });
    expect(mockExtract.mock.calls[0][0].password).toBe("secret");
  });

  it("应透传 pageNumbers 给底层抽取器", async () => {
    mockExtract.mockResolvedValue({ text: "", images: [], extractor: "x" });
    await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
      pageNumbers: [1, 2, 3],
    });
    expect(mockExtract.mock.calls[0][0].pageNumbers).toEqual([1, 2, 3]);
  });

  it("未提供 password 时不应向底层传入 password 字段", async () => {
    mockExtract.mockResolvedValue({ text: "", images: [], extractor: "x" });
    await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
    });
    expect(mockExtract.mock.calls[0][0].password).toBeUndefined();
  });

  it("应透传 config 与 onImageExtractionError", async () => {
    mockExtract.mockResolvedValue({ text: "", images: [], extractor: "x" });
    const onErr = vi.fn();
    const config = { foo: "bar" };
    await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
      config,
      onImageExtractionError: onErr,
    });
    expect(mockExtract.mock.calls[0][0].config).toBe(config);
    expect(mockExtract.mock.calls[0][0].onImageExtractionError).toBe(onErr);
  });

  it("底层返回的 images 应原样透传", async () => {
    const images = [
      { type: "image" as const, data: "base64", mimeType: "image/png" },
    ];
    mockExtract.mockResolvedValue({
      text: "t",
      images,
      extractor: "pdf-parse",
    });
    const result = await extractPdfContent({
      buffer: Buffer.from([1]),
      maxPages: 5,
      maxPixels: 100,
      minTextChars: 1,
    });
    expect(result.images).toBe(images);
  });
});
