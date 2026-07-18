import { describe, expect, it, vi } from "vitest";
import { createMockPrompter } from "../prompts.js";
import { buildGatewayStatusNote, finalizeSetupWizard } from "../setup.finalize.js";
import type { GatewayConfig, SetupConfig } from "../types.js";

const baseGateway: GatewayConfig = {
  port: 3000,
  bind: "loopback",
  authMode: "token",
  token: "test-token-12345",
  tailscaleMode: "off",
  tailscaleResetOnExit: false,
};

const baseConfig: SetupConfig = {
  flow: "quickstart",
  gateway: baseGateway,
  plugins: [],
  secrets: {},
};

describe("setup.finalize", () => {
  describe("finalizeSetupWizard", () => {
    function createPrompter() {
      return createMockPrompter({
        select: vi.fn(async () => "later"),
        confirm: vi.fn(async () => false),
        progress: vi.fn(() => ({
          update: vi.fn(),
          stop: vi.fn(),
        })),
      });
    }

    it("completes successfully for quickstart flow", async () => {
      const prompter = createPrompter();
      const result = await finalizeSetupWizard({
        flow: "quickstart",
        config: baseConfig,
        prompter,
      });

      expect(result.success).toBe(true);
      expect(result.gatewayRunning).toBe(true);
      expect(result.dashboardUrl).toBeDefined();
      expect(result.errors).toEqual([]);
    });

    it("completes successfully for advanced flow", async () => {
      const prompter = createPrompter();
      const config: SetupConfig = {
        ...baseConfig,
        flow: "advanced",
      };
      const result = await finalizeSetupWizard({
        flow: "advanced",
        config,
        prompter,
      });

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("suppresses gateway token in URL when requested", async () => {
      const prompter = createPrompter();
      const result = await finalizeSetupWizard({
        flow: "quickstart",
        config: baseConfig,
        prompter,
        suppressGatewayTokenOutput: true,
      });

      expect(result.dashboardUrl).toBeDefined();
      expect(result.dashboardUrl).not.toContain("test-token");
    });

    it("skips UI when skipUi is true", async () => {
      const noteMock = vi.fn(async () => {});
      const prompter = createMockPrompter({
        note: noteMock,
        progress: () => ({ update: () => {}, stop: () => {} }),
      });

      await finalizeSetupWizard({
        flow: "quickstart",
        config: baseConfig,
        prompter,
        skipUi: true,
      });

      expect(noteMock).toHaveBeenCalled();
    });

    it("handles password auth mode", async () => {
      const prompter = createPrompter();
      const config: SetupConfig = {
        ...baseConfig,
        gateway: {
          ...baseGateway,
          authMode: "password",
          password: "test-password-123",
          token: undefined,
        },
      };

      const result = await finalizeSetupWizard({
        flow: "quickstart",
        config,
        prompter,
      });

      expect(result.success).toBe(true);
      expect(result.dashboardUrl).toBeDefined();
      expect(result.dashboardUrl).not.toContain("token=");
    });

    it("handles no auth mode", async () => {
      const prompter = createPrompter();
      const config: SetupConfig = {
        ...baseConfig,
        gateway: {
          ...baseGateway,
          authMode: "none",
          token: undefined,
        },
      };

      const result = await finalizeSetupWizard({
        flow: "quickstart",
        config,
        prompter,
      });

      expect(result.success).toBe(true);
    });

    it("installs daemon when installDaemon is true", async () => {
      const progressMock = vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      }));
      const prompter = createMockPrompter({
        confirm: vi.fn(async () => true),
        select: vi.fn(async () => "node"),
        progress: progressMock,
      });

      const result = await finalizeSetupWizard({
        flow: "advanced",
        config: baseConfig,
        prompter,
        installDaemon: true,
      });

      expect(result.success).toBe(true);
      expect(result.gatewayRunning).toBe(true);
    });
  });

  describe("buildGatewayStatusNote", () => {
    it("builds status note with token auth", () => {
      const note = buildGatewayStatusNote({
        gateway: baseGateway,
        running: true,
      });

      expect(note).toContain("HTTP:");
      expect(note).toContain("WebSocket:");
      expect(note).toContain("running");
      expect(note).toContain("Token:");
    });

    it("hides token when suppressToken is true", () => {
      const note = buildGatewayStatusNote({
        gateway: baseGateway,
        running: true,
        suppressToken: true,
      });

      expect(note).not.toContain("Token:");
    });

    it("shows password auth status", () => {
      const note = buildGatewayStatusNote({
        gateway: {
          ...baseGateway,
          authMode: "password",
          password: "test",
          token: undefined,
        },
        running: false,
      });

      expect(note).toContain("Auth: password");
      expect(note).toContain("not running");
    });

    it("shows no auth status", () => {
      const note = buildGatewayStatusNote({
        gateway: {
          ...baseGateway,
          authMode: "none",
          token: undefined,
        },
        running: true,
      });

      expect(note).toContain("Auth: none");
    });

    it("uses correct URLs for loopback", () => {
      const note = buildGatewayStatusNote({
        gateway: baseGateway,
        running: true,
      });

      expect(note).toContain("http://127.0.0.1:3000");
      expect(note).toContain("ws://127.0.0.1:3000");
    });

    it("uses correct URLs for LAN bind", () => {
      const note = buildGatewayStatusNote({
        gateway: { ...baseGateway, bind: "lan" },
        running: true,
      });

      expect(note).toContain("http://0.0.0.0:3000");
      expect(note).toContain("ws://0.0.0.0:3000");
    });

    it("uses custom bind host", () => {
      const note = buildGatewayStatusNote({
        gateway: {
          ...baseGateway,
          bind: "custom",
          customBindHost: "192.168.1.100",
        },
        running: true,
      });

      expect(note).toContain("http://192.168.1.100:3000");
    });
  });
});
