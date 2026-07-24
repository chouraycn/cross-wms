/**
 * ffmpeg-exec 单元测试
 *
 * 聚焦于纯解析函数（不依赖系统 ffmpeg 二进制）。resolveFfmpegBin 取决于
 * 本机是否安装 ffmpeg，因此采用可移植的条件断言。
 */

import { describe, it, expect } from "vitest";
import path from "node:path";

import {
  parseFfprobeCsvFields,
  parseFfprobeCodecAndSampleRate,
  resolveFfmpegBin,
} from "../ffmpeg-exec.js";

describe("media / ffmpeg-exec", () => {
  describe("parseFfprobeCsvFields", () => {
    it("应按逗号切分并小写化", () => {
      expect(parseFfprobeCsvFields("h264,44100", 10)).toEqual(["h264", "44100"]);
    });

    it("应按换行切分", () => {
      expect(parseFfprobeCsvFields("H264\n44100", 10)).toEqual(["h264", "44100"]);
    });

    it("混合分隔符应被合并处理", () => {
      expect(parseFfprobeCsvFields("H264,44100\nstereo", 10)).toEqual([
        "h264",
        "44100",
        "stereo",
      ]);
    });

    it("maxFields 应限制返回字段数", () => {
      expect(parseFfprobeCsvFields("a,b,c", 2)).toEqual(["a", "b"]);
    });

    it("应对每个字段去空白与小写化", () => {
      expect(parseFfprobeCsvFields("  H264 , 44100 ", 10)).toEqual(["h264", "44100"]);
    });

    it("连续分隔符不应产生空字段", () => {
      expect(parseFfprobeCsvFields("a,,b", 10)).toEqual(["a", "b"]);
    });

    it("空字符串应返回单空字段数组", () => {
      expect(parseFfprobeCsvFields("", 10)).toEqual([""]);
    });

    it("单个字段应原样返回", () => {
      expect(parseFfprobeCsvFields("h264", 10)).toEqual(["h264"]);
    });
  });

  describe("parseFfprobeCodecAndSampleRate", () => {
    it("应解析 codec 与正整数采样率", () => {
      expect(parseFfprobeCodecAndSampleRate("h264,44100")).toEqual({
        codec: "h264",
        sampleRateHz: 44100,
      });
    });

    it("仅 codec 时采样率应为 null", () => {
      expect(parseFfprobeCodecAndSampleRate("H264")).toEqual({
        codec: "h264",
        sampleRateHz: null,
      });
    });

    it("非数字采样率应返回 null", () => {
      expect(parseFfprobeCodecAndSampleRate("h264,abc")).toEqual({
        codec: "h264",
        sampleRateHz: null,
      });
    });

    it("采样率 0 应被拒绝（返回 null）", () => {
      expect(parseFfprobeCodecAndSampleRate("h264,0")).toEqual({
        codec: "h264",
        sampleRateHz: null,
      });
    });

    it("负数采样率应返回 null", () => {
      expect(parseFfprobeCodecAndSampleRate("h264,-100")).toEqual({
        codec: "h264",
        sampleRateHz: null,
      });
    });

    it("空输入应返回 codec 与采样率均为 null", () => {
      expect(parseFfprobeCodecAndSampleRate("")).toEqual({
        codec: null,
        sampleRateHz: null,
      });
    });

    it("空 codec 字段应返回 codec 为 null", () => {
      expect(parseFfprobeCodecAndSampleRate(" ,44100")).toEqual({
        codec: null,
        sampleRateHz: 44100,
      });
    });

    it("多余字段应被忽略（受 maxFields=2 限制）", () => {
      expect(parseFfprobeCodecAndSampleRate("h264,44100,extra")).toEqual({
        codec: "h264",
        sampleRateHz: 44100,
      });
    });
  });

  describe("resolveFfmpegBin", () => {
    it("应返回受信目录中的绝对路径，或在缺失时抛出包含 ffmpeg 的错误", () => {
      try {
        const bin = resolveFfmpegBin();
        expect(typeof bin).toBe("string");
        expect(path.isAbsolute(bin)).toBe(true);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as Error).message).toContain("ffmpeg");
        expect((err as Error).message).toContain("not found");
      }
    });
  });
});
