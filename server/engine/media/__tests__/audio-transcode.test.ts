/**
 * audio-transcode 单元测试
 *
 * 通过 vi.mock 替换 ../ffmpeg-exec.js 的 runFfmpeg，避免依赖真实 ffmpeg 二进制。
 * transcodeAudioBuffer 的多个分支在调用 afconvert 之前即可判定，因而无需 spawn。
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// runFfmpeg 的默认 mock 实现：将伪 Opus 字节写入输出路径（命令行最后一个参数），
// 以模拟 ffmpeg 成功转码后写出产物文件的行为。
vi.mock("../ffmpeg-exec.js", async () => {
  const fsp = await import("node:fs/promises");
  return {
    runFfmpeg: vi.fn(async (args: string[]) => {
      const outputPath = args[args.length - 1];
      if (typeof outputPath === "string") {
        await fsp.writeFile(outputPath, Buffer.from([0x4f, 0x70, 0x75, 0x73, 0x48, 0x44]));
      }
      return "";
    }),
  };
});

import { runFfmpeg } from "../ffmpeg-exec.js";
import {
  transcodeAudioBuffer,
  transcodeAudioBufferToOpus,
} from "../audio-transcode.js";

const runFfmpegMock = vi.mocked(runFfmpeg);

describe("media / audio-transcode", () => {
  beforeEach(() => {
    runFfmpegMock.mockClear();
  });

  describe("transcodeAudioBuffer", () => {
    it("非法 source 扩展名应返回 invalid-extension", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "!!",
        targetExtension: "wav",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid-extension");
    });

    it("非法 target 扩展名应返回 invalid-extension", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "mp3",
        targetExtension: "!!",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid-extension");
    });

    it("source 与 target 同时非法应返回 invalid-extension", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "??",
        targetExtension: "??",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid-extension");
    });

    it("相同容器应返回 noop-same-container", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "mp3",
        targetExtension: "mp3",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("noop-same-container");
    });

    it("无配方的目标容器（非 caf）应返回 no-recipe", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "mp3",
        targetExtension: "wav",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no-recipe");
    });

    it("扩展名大小写应被归一化后判定为 no-recipe", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: "MP3",
        targetExtension: "WAV",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no-recipe");
    });

    it("带前导点的扩展名应被归一化", async () => {
      const r = await transcodeAudioBuffer({
        audioBuffer: Buffer.from([1]),
        sourceExtension: ".mp3",
        targetExtension: ".wav",
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no-recipe");
    });

    it("非 darwin 平台请求 caf 应返回 platform-unsupported", async () => {
      const original = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      try {
        const r = await transcodeAudioBuffer({
          audioBuffer: Buffer.from([1]),
          sourceExtension: "mp3",
          targetExtension: "caf",
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe("platform-unsupported");
      } finally {
        Object.defineProperty(process, "platform", {
          value: original,
          configurable: true,
        });
      }
    });
  });

  describe("transcodeAudioBufferToOpus", () => {
    it("成功时应返回写出的 Opus 字节", async () => {
      const result = await transcodeAudioBufferToOpus({
        audioBuffer: Buffer.from([1, 2, 3, 4]),
        inputExtension: "mp3",
      });
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(runFfmpegMock).toHaveBeenCalledTimes(1);
    });

    it("runFfmpeg 失败时应抛出", async () => {
      runFfmpegMock.mockRejectedValueOnce(new Error("ffmpeg failed"));
      await expect(
        transcodeAudioBufferToOpus({
          audioBuffer: Buffer.from([1, 2]),
          inputExtension: "mp3",
        }),
      ).rejects.toThrow("ffmpeg failed");
    });

    it("应将自定义 bitrate/sampleRate/channels 透传给 ffmpeg", async () => {
      await transcodeAudioBufferToOpus({
        audioBuffer: Buffer.from([1, 2, 3]),
        inputExtension: "mp3",
        bitrate: "96k",
        sampleRateHz: 24000,
        channels: 2,
      });
      expect(runFfmpegMock).toHaveBeenCalledTimes(1);
      const args = runFfmpegMock.mock.calls[0][0];
      expect(args).toContain("-b:a");
      expect(args).toContain("96k");
      expect(args).toContain("-ar");
      expect(args).toContain("24000");
      expect(args).toContain("-ac");
      expect(args).toContain("2");
      expect(args).toContain("libopus");
    });

    it("未提供 inputExtension 时应回退到 .audio 扩展名", async () => {
      await transcodeAudioBufferToOpus({
        audioBuffer: Buffer.from([1, 2, 3]),
      });
      const args = runFfmpegMock.mock.calls[0][0];
      const inputArg = args[args.indexOf("-i") + 1];
      expect(inputArg.endsWith(".audio")).toBe(true);
    });
  });
});
