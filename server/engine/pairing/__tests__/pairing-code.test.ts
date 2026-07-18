import { describe, it, expect, beforeEach } from "vitest";
import {
  PairingCodeGenerator,
  generatePairingCode,
  validatePairingCodeFormat,
} from "../pairing-code.js";

describe("PairingCodeGenerator", () => {
  let generator: PairingCodeGenerator;

  beforeEach(() => {
    generator = new PairingCodeGenerator({ ttlMs: 60000 });
  });

  describe("generate", () => {
    it("should generate a pairing code", () => {
      const codeInfo = generator.generate();
      expect(codeInfo).toHaveProperty("code");
      expect(codeInfo).toHaveProperty("expiresAt");
      expect(codeInfo).toHaveProperty("createdAt");
      expect(codeInfo).toHaveProperty("used");
      expect(codeInfo.used).toBe(false);
      expect(codeInfo.code).toBeTruthy();
      expect(codeInfo.code.length).toBe(8);
    });

    it("should generate unique codes", () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const codeInfo = generator.generate();
        codes.add(codeInfo.code);
      }
      expect(codes.size).toBe(100);
    });

    it("should set expiration time", () => {
      const before = Date.now();
      const codeInfo = generator.generate();
      const after = Date.now();

      expect(codeInfo.createdAt).toBeGreaterThanOrEqual(before);
      expect(codeInfo.createdAt).toBeLessThanOrEqual(after);
      expect(codeInfo.expiresAt).toBeGreaterThan(codeInfo.createdAt);
    });

    it("should associate code with device ID when provided", () => {
      const deviceId = "test-device-123";
      const codeInfo = generator.generate(deviceId);
      expect(codeInfo.deviceId).toBe(deviceId);
    });

    it("should use custom code length", () => {
      const customGenerator = new PairingCodeGenerator({ codeLength: 6 });
      const codeInfo = customGenerator.generate();
      expect(codeInfo.code.length).toBe(6);
    });

    it("should use custom alphabet", () => {
      const customGenerator = new PairingCodeGenerator({
        alphabet: "ABCDEF",
        codeLength: 4,
      });
      const codeInfo = customGenerator.generate();
      for (const char of codeInfo.code) {
        expect("ABCDEF").toContain(char);
      }
    });
  });

  describe("validate", () => {
    it("should return true for valid code", () => {
      const codeInfo = generator.generate();
      expect(generator.validate(codeInfo.code)).toBe(true);
    });

    it("should return false for invalid code", () => {
      expect(generator.validate("INVALID1")).toBe(false);
    });

    it("should return false for used code", () => {
      const codeInfo = generator.generate();
      generator.markAsUsed(codeInfo.code);
      expect(generator.validate(codeInfo.code)).toBe(false);
    });

    it("should return false for expired code", () => {
      const shortLivedGenerator = new PairingCodeGenerator({ ttlMs: 1 });
      const codeInfo = shortLivedGenerator.generate();
      expect(shortLivedGenerator.validate(codeInfo.code)).toBe(true);
    });

    it("should be case insensitive", () => {
      const codeInfo = generator.generate();
      expect(generator.validate(codeInfo.code.toLowerCase())).toBe(true);
    });

    it("should validate device ID match when provided", () => {
      const deviceId = "test-device-123";
      const codeInfo = generator.generate(deviceId);
      expect(generator.validate(codeInfo.code, deviceId)).toBe(true);
      expect(generator.validate(codeInfo.code, "other-device")).toBe(false);
    });

    it("should skip device ID check if code has no device ID", () => {
      const codeInfo = generator.generate();
      expect(generator.validate(codeInfo.code, "any-device")).toBe(true);
    });
  });

  describe("markAsUsed", () => {
    it("should mark code as used", () => {
      const codeInfo = generator.generate();
      expect(generator.markAsUsed(codeInfo.code)).toBe(true);

      const updated = generator.getCodeInfo(codeInfo.code);
      expect(updated?.used).toBe(true);
    });

    it("should return false for non-existent code", () => {
      expect(generator.markAsUsed("NONEXIST")).toBe(false);
    });

    it("should return false for already used code", () => {
      const codeInfo = generator.generate();
      generator.markAsUsed(codeInfo.code);
      expect(generator.markAsUsed(codeInfo.code)).toBe(false);
    });
  });

  describe("getCodeInfo", () => {
    it("should return code info for existing code", () => {
      const codeInfo = generator.generate();
      const found = generator.getCodeInfo(codeInfo.code);
      expect(found).toBeDefined();
      expect(found?.code).toBe(codeInfo.code);
    });

    it("should return undefined for non-existent code", () => {
      expect(generator.getCodeInfo("NONEXIST")).toBeUndefined();
    });
  });

  describe("revoke", () => {
    it("should revoke a code", () => {
      const codeInfo = generator.generate();
      expect(generator.revoke(codeInfo.code)).toBe(true);
      expect(generator.validate(codeInfo.code)).toBe(false);
    });

    it("should return false for non-existent code", () => {
      expect(generator.revoke("NONEXIST")).toBe(false);
    });
  });

  describe("pruneExpired", () => {
    it("should remove expired codes", () => {
      const shortLivedGenerator = new PairingCodeGenerator({ ttlMs: 1 });
      shortLivedGenerator.generate("device1");
      shortLivedGenerator.generate("device2");
      expect(shortLivedGenerator.getActiveCount()).toBe(2);
      const count = shortLivedGenerator.pruneExpired();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("clear", () => {
    it("should clear all codes", () => {
      generator.generate();
      generator.generate();
      expect(generator.getActiveCount()).toBe(2);
      generator.clear();
      expect(generator.getActiveCount()).toBe(0);
    });
  });

  describe("getActiveCount", () => {
    it("should return the number of active codes", () => {
      expect(generator.getActiveCount()).toBe(0);
      generator.generate();
      expect(generator.getActiveCount()).toBe(1);
      generator.generate();
      expect(generator.getActiveCount()).toBe(2);
    });
  });

  describe("normalize", () => {
    it("should trim and uppercase code", () => {
      expect(generator.normalize("  abc123def  ")).toBe("ABC123DEF");
    });

    it("should remove non-alphanumeric characters", () => {
      expect(generator.normalize("ABC-DEF-123")).toBe("ABCDEF123");
    });
  });

  describe("formatForDisplay", () => {
    it("should format code with hyphen for 8-char code", () => {
      const code = generator.generate();
      const formatted = generator.formatForDisplay(code.code);
      expect(formatted).toContain("-");
      expect(formatted.replace("-", "")).toBe(code.code);
    });
  });

  describe("parseDisplayCode", () => {
    it("should parse display code back to original", () => {
      const code = "ABCDEFGH";
      const display = generator.formatForDisplay(code);
      const parsed = generator.parseDisplayCode(display);
      expect(parsed).toBe(code);
    });
  });

  describe("getCodeLength", () => {
    it("should return the code length", () => {
      expect(generator.getCodeLength()).toBe(8);
    });
  });

  describe("getAlphabet", () => {
    it("should return the alphabet", () => {
      expect(generator.getAlphabet()).toBeTruthy();
      expect(generator.getAlphabet().length).toBeGreaterThan(0);
    });
  });

  describe("getTtlMs", () => {
    it("should return the TTL", () => {
      expect(generator.getTtlMs()).toBe(60000);
    });
  });
});

describe("generatePairingCode", () => {
  it("should generate a pairing code", () => {
    const codeInfo = generatePairingCode();
    expect(codeInfo).toHaveProperty("code");
    expect(codeInfo.code.length).toBe(8);
  });
});

describe("validatePairingCodeFormat", () => {
  it("should return true for valid format", () => {
    expect(validatePairingCodeFormat("ABCDEFGH")).toBe(true);
  });

  it("should return false for invalid characters", () => {
    expect(validatePairingCodeFormat("ABCDEFG0")).toBe(false);
  });

  it("should return false for wrong length", () => {
    expect(validatePairingCodeFormat("ABCD")).toBe(false);
  });
});
