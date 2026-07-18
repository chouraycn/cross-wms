import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMockPrompter, WizardCancelledError } from "../prompts.js";
import {
  clearMigrationProviders,
  detectSetupMigrationSources,
  getMigrationProvider,
  listMigrationProviders,
  registerMigrationProvider,
  runSetupMigrationImport,
} from "../setup.migration-import.js";

describe("migration import", () => {
  beforeEach(() => {
    clearMigrationProviders();
  });

  afterEach(() => {
    clearMigrationProviders();
  });

  describe("provider registration", () => {
    it("registers and retrieves a migration provider", () => {
      const provider = {
        id: "test-provider",
        label: "Test Provider",
      };
      registerMigrationProvider(provider);
      expect(getMigrationProvider("test-provider")).toEqual(provider);
    });

    it("lists all providers including builtin", () => {
      const providers = listMigrationProviders();
      expect(providers.length).toBeGreaterThanOrEqual(2);
      expect(providers.map((p) => p.id)).toContain("openclaw");
      expect(providers.map((p) => p.id)).toContain("json-file");
    });

    it("returns undefined for unknown provider", () => {
      expect(getMigrationProvider("nonexistent")).toBeUndefined();
    });
  });

  describe("detectSetupMigrationSources", () => {
    it("returns empty array when no sources found", async () => {
      const detections = await detectSetupMigrationSources({
        searchPaths: ["/nonexistent/path"],
      });
      expect(detections).toEqual([]);
    });

    it("detects sources using registered providers", async () => {
      registerMigrationProvider({
        id: "test-detect",
        label: "Test Detect",
        detect: vi.fn(async () => ({
          found: true,
          label: "Test Config",
          source: "/",
        })),
      });

      const detections = await detectSetupMigrationSources({
        searchPaths: ["/"],
      });
      expect(detections.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("runSetupMigrationImport", () => {
    it("throws WizardCancelledError when user cancels", async () => {
      const prompter = createMockPrompter({
        select: vi.fn(async () => "openclaw"),
        text: vi.fn(async () => "/tmp/test"),
        confirm: vi.fn(async () => false),
      });

      await expect(
        runSetupMigrationImport({
          prompter,
          detections: [{ providerId: "openclaw", label: "OpenClaw", source: "/tmp/test" }],
        }),
      ).rejects.toThrow(WizardCancelledError);
    });

    it("completes migration with builtin provider", async () => {
      const prompter = createMockPrompter({
        select: vi.fn(async () => "openclaw"),
        text: vi.fn(async () => "/tmp/test"),
        confirm: vi.fn(async () => true),
        progress: vi.fn(() => ({
          update: vi.fn(),
          stop: vi.fn(),
        })),
      });

      const result = await runSetupMigrationImport({
        prompter,
        detections: [{ providerId: "openclaw", label: "OpenClaw", source: "/tmp/test" }],
        nonInteractive: true,
        includeSecrets: false,
      });

      expect(result.success).toBe(true);
      expect(result.itemsImported).toBeGreaterThan(0);
      expect(result.config.migration).toBeDefined();
      expect(result.config.migration?.source).toBe("openclaw");
    });

    it("uses importFrom to select provider", async () => {
      const prompter = createMockPrompter({
        confirm: vi.fn(async () => true),
        progress: vi.fn(() => ({
          update: vi.fn(),
          stop: vi.fn(),
        })),
      });

      const result = await runSetupMigrationImport({
        prompter,
        importFrom: "json-file",
        importSource: "/tmp/config.json",
        nonInteractive: true,
      });

      expect(result.success).toBe(true);
      expect(result.config.migration?.source).toBe("json-file");
    });

    it("throws error for unknown provider", async () => {
      const prompter = createMockPrompter();

      await expect(
        runSetupMigrationImport({
          prompter,
          importFrom: "nonexistent-provider",
          nonInteractive: true,
        }),
      ).rejects.toThrow("Unknown migration provider");
    });

    it("includes migration config in result", async () => {
      const prompter = createMockPrompter({
        confirm: vi.fn(async () => true),
        progress: vi.fn(() => ({
          update: vi.fn(),
          stop: vi.fn(),
        })),
      });

      const result = await runSetupMigrationImport({
        prompter,
        importFrom: "openclaw",
        importSource: "/tmp/source",
        includeSecrets: true,
        nonInteractive: true,
      });

      expect(result.config.migration).toBeDefined();
      expect(result.config.migration?.sourcePath).toBe("/tmp/source");
      expect(result.config.migration?.includeSecrets).toBe(true);
    });
  });
});
