import { describe, expect, it } from "vitest";
import {
  createSecretRef,
  isSecretRef,
  normalizeSecretInputString,
  resolveSecretInputRef,
  resolveSetupSecretInputString,
  secretRefToString,
  type SecretRef,
} from "../setup.secret-input.js";

describe("secret input", () => {
  describe("isSecretRef", () => {
    it("returns true for valid SecretRef objects", () => {
      const ref: SecretRef = { source: "env", provider: "system", id: "MY_TOKEN" };
      expect(isSecretRef(ref)).toBe(true);
    });

    it("returns false for non-objects", () => {
      expect(isSecretRef("string")).toBe(false);
      expect(isSecretRef(123)).toBe(false);
      expect(isSecretRef(null)).toBe(false);
      expect(isSecretRef(undefined)).toBe(false);
    });

    it("returns false for objects missing required fields", () => {
      expect(isSecretRef({})).toBe(false);
      expect(isSecretRef({ source: "env" })).toBe(false);
      expect(isSecretRef({ source: "env", provider: "system" })).toBe(false);
    });
  });

  describe("normalizeSecretInputString", () => {
    it("returns trimmed string for valid input", () => {
      expect(normalizeSecretInputString("  hello  ")).toBe("hello");
      expect(normalizeSecretInputString("token123")).toBe("token123");
    });

    it("returns undefined for empty strings", () => {
      expect(normalizeSecretInputString("")).toBeUndefined();
      expect(normalizeSecretInputString("   ")).toBeUndefined();
    });

    it("returns undefined for non-string values", () => {
      expect(normalizeSecretInputString(undefined)).toBeUndefined();
      expect(normalizeSecretInputString(null)).toBeUndefined();
      expect(normalizeSecretInputString(123)).toBeUndefined();
    });
  });

  describe("resolveSecretInputRef", () => {
    it("parses ref: string format", () => {
      const result = resolveSecretInputRef({
        value: "ref:env:system:MY_TOKEN",
      });
      expect(result.ref).toBeDefined();
      expect(result.ref?.source).toBe("env");
      expect(result.ref?.provider).toBe("system");
      expect(result.ref?.id).toBe("MY_TOKEN");
    });

    it("returns plaintext for regular strings", () => {
      const result = resolveSecretInputRef({
        value: "my-secret-token",
      });
      expect(result.plaintext).toBe("my-secret-token");
      expect(result.ref).toBeUndefined();
    });

    it("resolves SecretRef objects", () => {
      const ref: SecretRef = { source: "env", provider: "system", id: "API_KEY" };
      const result = resolveSecretInputRef({ value: ref });
      expect(result.ref).toEqual(ref);
    });

    it("reads from environment variable when envVarName is provided", () => {
      const env = { CUSTOM_TOKEN: "env-token-value" };
      const result = resolveSecretInputRef({
        value: undefined,
        envVarName: "CUSTOM_TOKEN",
        env,
      });
      expect(result.plaintext).toBe("env-token-value");
    });

    it("prefers value over env var", () => {
      const env = { MY_TOKEN: "env-value" };
      const result = resolveSecretInputRef({
        value: "direct-value",
        envVarName: "MY_TOKEN",
        env,
      });
      expect(result.plaintext).toBe("direct-value");
    });

    it("returns empty object for undefined value without env var", () => {
      const result = resolveSecretInputRef({ value: undefined });
      expect(result.ref).toBeUndefined();
      expect(result.plaintext).toBeUndefined();
    });
  });

  describe("resolveSetupSecretInputString", () => {
    it("resolves plaintext strings", async () => {
      const result = await resolveSetupSecretInputString({
        value: "plain-token",
        path: "test.token",
      });
      expect(result).toBe("plain-token");
    });

    it("resolves env secret refs", async () => {
      const env = { MY_SECRET: "env-secret-value" };
      const result = await resolveSetupSecretInputString({
        value: "ref:env:system:MY_SECRET",
        path: "test.secret",
        env,
      });
      expect(result).toBe("env-secret-value");
    });

    it("throws error for missing env variable", async () => {
      const env = {};
      await expect(
        resolveSetupSecretInputString({
          value: "ref:env:system:MISSING_VAR",
          path: "test.missing",
          env,
        }),
      ).rejects.toThrow("failed to resolve SecretRef");
    });

    it("returns undefined for empty value", async () => {
      const result = await resolveSetupSecretInputString({
        value: "",
        path: "test.empty",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("createSecretRef", () => {
    it("creates a valid SecretRef", () => {
      const ref = createSecretRef("env", "system", "TOKEN");
      expect(ref).toEqual({
        source: "env",
        provider: "system",
        id: "TOKEN",
      });
      expect(isSecretRef(ref)).toBe(true);
    });
  });

  describe("secretRefToString", () => {
    it("converts SecretRef to string format", () => {
      const ref: SecretRef = { source: "env", provider: "system", id: "MY_TOKEN" };
      expect(secretRefToString(ref)).toBe("ref:env:system:MY_TOKEN");
    });
  });
});
