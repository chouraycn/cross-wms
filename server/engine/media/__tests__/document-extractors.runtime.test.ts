/**
 * document-extractors.runtime 单元测试
 *
 * 通过 vi.mock 替换 pdf-parse 模块，使 application/pdf 路径可受控验证。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(async (buffer: Buffer) => ({
    text: `extracted from ${buffer.length} bytes`,
    numpages: 1,
  })),
}));

import pdfParse from "pdf-parse";
import { extractDocumentContent } from "../document-extractors.runtime.js";

const mockPdfParse = vi.mocked(pdfParse);

describe("media / document-extractors.runtime", () => {
  beforeEach(() => {
    mockPdfParse.mockClear();
    mockPdfParse.mockImplementation(async (buffer: Buffer) => ({
      text: `extracted from ${buffer.length} bytes`,
      numpages: 1,
    }));
  });

  it("非 pdf mime 应返回 null", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: "image/png",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).toBeNull();
    expect(mockPdfParse).not.toHaveBeenCalled();
  });

  it("text/plain 应返回 null", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: "text/plain",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).toBeNull();
  });

  it("application/pdf 应返回 pdf-parse 提取结果", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "application/pdf",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).not.toBeNull();
    expect(result?.extractor).toBe("pdf-parse");
    expect(result?.images).toEqual([]);
    expect(result?.text).toContain("extracted from 3 bytes");
  });

  it("mime 大小写不敏感（APPLICATION/PDF 应被识别）", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: "APPLICATION/PDF",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).not.toBeNull();
    expect(result?.extractor).toBe("pdf-parse");
  });

  it("带前后空白的 mime 应被归一化", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: "  application/pdf  ",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).not.toBeNull();
  });

  it("pdf-parse 返回空文本时 result.text 应为空字符串", async () => {
    mockPdfParse.mockResolvedValue({ text: "", numpages: 0 });
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: "application/pdf",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result?.text).toBe("");
  });

  it("pdf-parse 抛错时 extractDocumentContent 应 reject", async () => {
    mockPdfParse.mockRejectedValue(new Error("corrupt pdf"));
    await expect(
      extractDocumentContent({
        buffer: Buffer.from([1]),
        mimeType: "application/pdf",
        maxPages: 10,
        maxPixels: 1000,
        minTextChars: 1,
      }),
    ).rejects.toThrow("corrupt pdf");
  });

  it("应将 buffer 原样传给 pdf-parse", async () => {
    const buf = Buffer.from([9, 8, 7, 6]);
    await extractDocumentContent({
      buffer: buf,
      mimeType: "application/pdf",
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(mockPdfParse).toHaveBeenCalledTimes(1);
    expect(mockPdfParse.mock.calls[0][0]).toBe(buf);
  });

  it("非字符串 mime（如 undefined）应返回 null", async () => {
    const result = await extractDocumentContent({
      buffer: Buffer.from([1]),
      mimeType: undefined as unknown as string,
      maxPages: 10,
      maxPixels: 1000,
      minTextChars: 1,
    });
    expect(result).toBeNull();
  });
});
