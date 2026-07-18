// 音频编解码测试，覆盖 PCM 重采样、G.711 mu-law 编解码与静音检测。
import { describe, expect, it } from "vitest";
import {
  convertPcmToMulaw8k,
  detectPcmSilence,
  mulawToPcm,
  pcmToMulaw,
  resamplePcm,
} from "../audio-codec.js";

function makePcmBuffer(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i] ?? 0, i * 2);
  }
  return buffer;
}

describe("audio codec", () => {
  it("returns the same buffer when sample rates match", () => {
    const input = makePcmBuffer([100, -200, 300, 0]);
    const result = resamplePcm(input, 8000, 8000);
    expect(result).toBe(input);
  });

  it("resamples PCM from 16k to 8k by halving samples", () => {
    const input = makePcmBuffer([1000, 2000, 3000, 4000]);
    const result = resamplePcm(input, 16000, 8000);
    expect(result.length).toBe(4); // 2 samples * 2 bytes
    // Output should have approximately half the samples, each in 16-bit range.
    expect(result.readInt16LE(0)).toBeGreaterThan(-32768);
    expect(result.readInt16LE(0)).toBeLessThan(32767);
  });

  it("round-trips PCM through mu-law encode and decode with bounded error", () => {
    const original = makePcmBuffer([0, 100, -100, 1000, -1000, 5000, -5000, 16000, -16000]);
    const mulaw = pcmToMulaw(original);
    expect(mulaw.length).toBe(original.length / 2);

    const decoded = mulawToPcm(mulaw);
    expect(decoded.length).toBe(original.length);

    // mu-law is lossy but must stay within a bounded error band.
    for (let i = 0; i < original.length / 2; i += 1) {
      const orig = original.readInt16LE(i * 2);
      const dec = decoded.readInt16LE(i * 2);
      expect(Math.abs(orig - dec)).toBeLessThan(1000);
    }
  });

  it("converts higher-rate PCM directly to 8k mu-law bytes", () => {
    const input = makePcmBuffer(new Array(160).fill(1000));
    const result = convertPcmToMulaw8k(input, 16000);
    // 160 samples at 16k → 80 samples at 8k → 80 mu-law bytes.
    expect(result.length).toBe(80);
    // Each byte must be a valid mu-law byte (0-255).
    for (let i = 0; i < result.length; i += 1) {
      expect(result[i]).toBeGreaterThanOrEqual(0);
      expect(result[i]).toBeLessThanOrEqual(255);
    }
  });

  it("detects silence in zero-amplitude PCM", () => {
    const silent = makePcmBuffer(new Array(100).fill(0));
    const result = detectPcmSilence(silent);
    expect(result.silent).toBe(true);
    expect(result.rms).toBe(0);
    expect(result.peak).toBe(0);
  });

  it("detects non-silence in high-amplitude PCM", () => {
    const loud = makePcmBuffer(new Array(100).fill(10000));
    const result = detectPcmSilence(loud);
    expect(result.silent).toBe(false);
    expect(result.rms).toBeGreaterThan(250);
    expect(result.peak).toBe(10000);
  });

  it("returns silent=true for empty buffer", () => {
    const result = detectPcmSilence(Buffer.alloc(0));
    expect(result.silent).toBe(true);
    expect(result.rms).toBe(0);
    expect(result.peak).toBe(0);
  });
});
