import { describe, expect, it, vi } from "vitest";
import { createMockPrompter } from "../prompts.js";
import {
  configureGatewayForSetup,
  validateGatewayPortInput,
  validateGatewayPasswordInput,
  validateIPv4AddressInput,
} from "../setup.gateway-config.js";

describe("gateway config validation", () => {
  describe("validateGatewayPortInput", () => {
    it("accepts valid port numbers", () => {
      expect(validateGatewayPortInput("8080")).toBeUndefined();
      expect(validateGatewayPortInput("1")).toBeUndefined();
      expect(validateGatewayPortInput("65535")).toBeUndefined();
      expect(validateGatewayPortInput(3000)).toBeUndefined();
    });

    it("rejects invalid port numbers", () => {
      expect(validateGatewayPortInput("0")).toBeDefined();
      expect(validateGatewayPortInput("65536")).toBeDefined();
      expect(validateGatewayPortInput("abc")).toBeDefined();
      expect(validateGatewayPortInput("")).toBeDefined();
      expect(validateGatewayPortInput(undefined)).toBeDefined();
      expect(validateGatewayPortInput(null)).toBeDefined();
    });
  });

  describe("validateGatewayPasswordInput", () => {
    it("accepts passwords of 8+ characters", () => {
      expect(validateGatewayPasswordInput("password123")).toBeUndefined();
      expect(validateGatewayPasswordInput("12345678")).toBeUndefined();
    });

    it("rejects short passwords", () => {
      expect(validateGatewayPasswordInput("short")).toBeDefined();
      expect(validateGatewayPasswordInput("")).toBeDefined();
      expect(validateGatewayPasswordInput(undefined)).toBeDefined();
    });
  });

  describe("validateIPv4AddressInput", () => {
    it("accepts valid IPv4 addresses", () => {
      expect(validateIPv4AddressInput("127.0.0.1")).toBeUndefined();
      expect(validateIPv4AddressInput("192.168.1.1")).toBeUndefined();
      expect(validateIPv4AddressInput("0.0.0.0")).toBeUndefined();
      expect(validateIPv4AddressInput("255.255.255.255")).toBeUndefined();
    });

    it("rejects invalid IPv4 addresses", () => {
      expect(validateIPv4AddressInput("256.0.0.1")).toBeDefined();
      expect(validateIPv4AddressInput("192.168.1")).toBeDefined();
      expect(validateIPv4AddressInput("abc.def.ghi.jkl")).toBeDefined();
      expect(validateIPv4AddressInput("")).toBeDefined();
      expect(validateIPv4AddressInput(undefined)).toBeDefined();
    });
  });
});

describe("configureGatewayForSetup", () => {
  function createPrompter(params: {
    selectQueue?: string[];
    textQueue?: string[];
    confirmQueue?: boolean[];
  }) {
    const selectQueue = params.selectQueue ?? [];
    const textQueue = params.textQueue ?? [];
    const confirmQueue = params.confirmQueue ?? [];

    return createMockPrompter({
      select: vi.fn(async () => selectQueue.shift() ?? "loopback"),
      text: vi.fn(async () => textQueue.shift() ?? ""),
      confirm: vi.fn(async () => confirmQueue.shift() ?? false),
    });
  }

  it("quickstart flow uses default values", async () => {
    const prompter = createPrompter({});
    const result = await configureGatewayForSetup({
      flow: "quickstart",
      prompter,
    });

    expect(result.config.port).toBe(3000);
    expect(result.config.bind).toBe("loopback");
    expect(result.config.authMode).toBe("token");
    expect(result.config.tailscaleMode).toBe("off");
    expect(result.config.token).toBeDefined();
    expect(result.config.token?.length).toBeGreaterThan(0);
  });

  it("advanced flow prompts for all settings", async () => {
    const prompter = createPrompter({
      selectQueue: ["lan", "password", "off"],
      textQueue: ["8080", "mypassword123"],
      confirmQueue: [],
    });

    const result = await configureGatewayForSetup({
      flow: "advanced",
      prompter,
    });

    expect(result.config.port).toBe(8080);
    expect(result.config.bind).toBe("lan");
    expect(result.config.authMode).toBe("password");
    expect(result.config.password).toBe("mypassword123");
    expect(result.config.tailscaleMode).toBe("off");
  });

  it("uses baseConfig values as defaults", async () => {
    const prompter = createPrompter({});
    const result = await configureGatewayForSetup({
      flow: "quickstart",
      baseConfig: {
        port: 9090,
        bind: "lan",
        authMode: "password",
        password: "existingpass",
        tailscaleMode: "off",
        tailscaleResetOnExit: true,
      },
      prompter,
    });

    expect(result.config.port).toBe(9090);
    expect(result.config.bind).toBe("lan");
    expect(result.config.authMode).toBe("password");
    expect(result.config.password).toBe("existingpass");
    expect(result.config.tailscaleMode).toBe("off");
    expect(result.config.tailscaleResetOnExit).toBe(true);
  });

  it("tailscale funnel requires password auth", async () => {
    const prompter = createPrompter({
      selectQueue: ["loopback", "token", "funnel"],
      textQueue: ["3000", ""],
    });

    const result = await configureGatewayForSetup({
      flow: "advanced",
      prompter,
    });

    expect(result.config.tailscaleMode).toBe("funnel");
    expect(result.config.authMode).toBe("password");
  });

  it("tailscale non-off requires loopback bind", async () => {
    const prompter = createPrompter({
      selectQueue: ["lan", "token", "serve"],
      textQueue: ["3000", ""],
    });

    const result = await configureGatewayForSetup({
      flow: "advanced",
      prompter,
    });

    expect(result.config.bind).toBe("loopback");
    expect(result.config.tailscaleMode).toBe("serve");
  });

  it("custom bind prompts for IP address", async () => {
    const prompter = createPrompter({
      selectQueue: ["custom", "token", "off"],
      textQueue: ["3000", "192.168.1.100", ""],
    });

    const result = await configureGatewayForSetup({
      flow: "advanced",
      prompter,
    });

    expect(result.config.bind).toBe("custom");
    expect(result.config.customBindHost).toBe("192.168.1.100");
  });

  it("no auth mode does not require token or password", async () => {
    const prompter = createPrompter({
      selectQueue: ["loopback", "none", "off"],
      textQueue: ["3000"],
    });

    const result = await configureGatewayForSetup({
      flow: "advanced",
      prompter,
    });

    expect(result.config.authMode).toBe("none");
    expect(result.config.token).toBeUndefined();
    expect(result.config.password).toBeUndefined();
  });
});
