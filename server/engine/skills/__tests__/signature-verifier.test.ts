/**
 * 签名验证系统测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  SignatureVerifier,
  SourceVerifier,
  resetVerifiers,
} from "../security/signature-verifier.js";

describe("SignatureVerifier", () => {
  let verifier: SignatureVerifier;

  beforeEach(() => {
    resetVerifiers();
    verifier = new SignatureVerifier();
  });

  describe("addTrustedKey / getPublicKey", () => {
    it("should add and retrieve trusted key", () => {
      verifier.addTrustedKey({
        keyId: "test-key-1",
        publicKey: "test-public-key",
        algorithm: "rsa-sha256",
        trusted: true,
      });

      const key = verifier.getPublicKey("test-key-1");
      expect(key).toBeDefined();
      expect(key?.keyId).toBe("test-key-1");
    });
  });

  describe("listTrustedKeys", () => {
    it("should list only trusted keys", () => {
      verifier.addTrustedKey({
        keyId: "trusted-key",
        publicKey: "key",
        algorithm: "rsa-sha256",
        trusted: true,
      });

      verifier.addTrustedKey({
        keyId: "untrusted-key",
        publicKey: "key",
        algorithm: "rsa-sha256",
        trusted: false,
      });

      const trusted = verifier.listTrustedKeys();
      expect(trusted).toHaveLength(1);
      expect(trusted[0].keyId).toBe("trusted-key");
    });
  });

  describe("removeTrustedKey", () => {
    it("should remove trusted key", () => {
      verifier.addTrustedKey({
        keyId: "test-key",
        publicKey: "key",
        algorithm: "rsa-sha256",
        trusted: true,
      });

      const removed = verifier.removeTrustedKey("test-key");
      expect(removed).toBe(true);

      const key = verifier.getPublicKey("test-key");
      expect(key).toBeUndefined();
    });
  });

  describe("generateKeyPair", () => {
    it("should generate RSA key pair", () => {
      const { publicKey, privateKey } = verifier.generateKeyPair("rsa-sha256");

      expect(publicKey).toContain("BEGIN PUBLIC KEY");
      expect(privateKey).toContain("BEGIN PRIVATE KEY");
    });

    it("should generate Ed25519 key pair", () => {
      const { publicKey, privateKey } = verifier.generateKeyPair("ed25519");

      expect(publicKey).toContain("BEGIN PUBLIC KEY");
      expect(privateKey).toContain("BEGIN PRIVATE KEY");
    });
  });
});

describe("SourceVerifier", () => {
  let sourceVerifier: SourceVerifier;

  beforeEach(() => {
    resetVerifiers();
    sourceVerifier = new SourceVerifier();
  });

  describe("verifyClawHubSource", () => {
    it("should verify valid ClawHub source", () => {
      const result = sourceVerifier.verifyClawHubSource(
        "https://clawhub.com",
        "weather",
        { ownerHandle: "openclaw" }
      );

      expect(result.valid).toBe(true);
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should reject invalid slug", () => {
      const result = sourceVerifier.verifyClawHubSource(
        "https://clawhub.com",
        ""
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid slug format");
    });
  });

  describe("verifyGitSource", () => {
    it("should verify valid Git URL", () => {
      const result = sourceVerifier.verifyGitSource(
        "https://github.com/openclaw/weather-skill.git",
        { branch: "main", commit: "abc123" }
      );

      expect(result.valid).toBe(true);
      expect(result.details).toContainEqual(expect.stringContaining("Git URL valid"));
    });

    it("should reject invalid Git URL", () => {
      const result = sourceVerifier.verifyGitSource(
        "invalid-url"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid Git URL format");
    });
  });

  describe("verifyLocalSource", () => {
    it("should always allow local source", () => {
      const result = sourceVerifier.verifyLocalSource("/path/to/skill");

      expect(result.valid).toBe(true);
    });
  });
});