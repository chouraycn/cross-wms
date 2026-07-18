import { describe, expect, it, vi } from "vitest";
import { createMockPrompter, WizardCancelledError } from "../prompts.js";
import {
  advanceStep,
  createInitialWizardState,
  getCurrentStep,
  getWizardProgress,
  goToPreviousStep,
  runSetupWizard,
  validateSetupConfig,
} from "../setup.js";
import type { SetupConfig, WizardState } from "../types.js";

describe("wizard state management", () => {
  it("creates initial state with defaults", () => {
    const state = createInitialWizardState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.steps.length).toBeGreaterThan(0);
    expect(state.completed).toBe(false);
    expect(state.cancelled).toBe(false);
    expect(state.errors).toEqual([]);
  });

  it("creates initial state with provided config", () => {
    const config = { flow: "quickstart" as const };
    const state = createInitialWizardState(config);
    expect(state.config.flow).toBe("quickstart");
  });

  it("calculates progress correctly", () => {
    const state = createInitialWizardState();
    const progress = getWizardProgress(state);
    expect(progress.current).toBe(1);
    expect(progress.total).toBe(state.steps.length);
    expect(progress.percentage).toBeGreaterThan(0);
    expect(progress.percentage).toBeLessThanOrEqual(100);
  });

  it("gets current step", () => {
    const state = createInitialWizardState();
    const step = getCurrentStep(state);
    expect(step).not.toBeNull();
    expect(step?.id).toBe(state.steps[0].id);
  });

  it("returns null for current step when index out of bounds", () => {
    const state: WizardState = {
      currentStepIndex: 999,
      steps: [],
      config: {},
      completed: false,
      cancelled: false,
      errors: [],
    };
    expect(getCurrentStep(state)).toBeNull();
  });

  it("advances to next step", () => {
    const state = createInitialWizardState();
    const next = advanceStep(state);
    expect(next.currentStepIndex).toBe(1);
    expect(next.completed).toBe(false);
  });

  it("marks as completed when advancing past last step", () => {
    const state = createInitialWizardState();
    let current = state;
    for (let i = 0; i < state.steps.length; i++) {
      current = advanceStep(current);
    }
    expect(current.completed).toBe(true);
  });

  it("goes to previous step", () => {
    const state = createInitialWizardState();
    const advanced = advanceStep(state);
    const previous = goToPreviousStep(advanced);
    expect(previous.currentStepIndex).toBe(0);
  });

  it("stays at first step when going back from step 0", () => {
    const state = createInitialWizardState();
    const previous = goToPreviousStep(state);
    expect(previous.currentStepIndex).toBe(0);
  });
});

describe("validateSetupConfig", () => {
  const validConfig: SetupConfig = {
    flow: "quickstart",
    gateway: {
      port: 3000,
      bind: "loopback",
      authMode: "token",
      token: "test-token",
      tailscaleMode: "off",
      tailscaleResetOnExit: false,
    },
    plugins: [],
    secrets: {},
  };

  it("passes for valid config", () => {
    expect(validateSetupConfig(validConfig)).toEqual([]);
  });

  it("requires flow", () => {
    const errors = validateSetupConfig({ ...validConfig, flow: undefined });
    expect(errors).toContain("flow is required");
  });

  it("requires gateway config", () => {
    const errors = validateSetupConfig({ ...validConfig, gateway: undefined });
    expect(errors).toContain("gateway config is required");
  });

  it("validates gateway port range", () => {
    const errors = validateSetupConfig({
      ...validConfig,
      gateway: { ...validConfig.gateway, port: 0 },
    });
    expect(errors.some((e) => e.includes("gateway.port"))).toBe(true);
  });

  it("requires gateway.bind", () => {
    const errors = validateSetupConfig({
      ...validConfig,
      gateway: { ...validConfig.gateway, bind: undefined as never },
    });
    expect(errors).toContain("gateway.bind is required");
  });

  it("requires token when authMode is token", () => {
    const errors = validateSetupConfig({
      ...validConfig,
      gateway: { ...validConfig.gateway, authMode: "token", token: undefined },
    });
    expect(errors).toContain("gateway.token is required when authMode is token");
  });

  it("requires password when authMode is password", () => {
    const errors = validateSetupConfig({
      ...validConfig,
      gateway: { ...validConfig.gateway, authMode: "password", password: undefined, token: undefined },
    });
    expect(errors).toContain("gateway.password is required when authMode is password");
  });

  it("requires plugins array", () => {
    const errors = validateSetupConfig({ ...validConfig, plugins: undefined });
    expect(errors).toContain("plugins array is required");
  });

  it("requires secrets object", () => {
    const errors = validateSetupConfig({ ...validConfig, secrets: undefined });
    expect(errors).toContain("secrets object is required");
  });
});

describe("runSetupWizard", () => {
  function createPrompter(overrides: Record<string, unknown> = {}) {
    return createMockPrompter({
      select: vi.fn(async () => "quickstart"),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => true),
      multiselect: vi.fn(async () => []),
      progress: vi.fn(() => ({
        update: vi.fn(),
        stop: vi.fn(),
      })),
      ...overrides,
    });
  }

  it("runs quickstart flow successfully", async () => {
    const prompter = createPrompter();
    const result = await runSetupWizard(
      {
        flow: "quickstart",
        acceptRisk: true,
        skipUi: true,
      },
      prompter,
    );

    expect(result.success).toBe(true);
    expect(result.cancelled).not.toBe(true);
    expect(result.config).toBeDefined();
    expect(result.config?.flow).toBe("quickstart");
    expect(result.config?.gateway).toBeDefined();
  });

  it("cancels when risk is not accepted", async () => {
    const prompter = createPrompter({
      confirm: vi.fn(async () => false),
    });

    const result = await runSetupWizard({}, prompter);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("handles WizardCancelledError", async () => {
    const prompter = createPrompter({
      intro: vi.fn(async () => {
        throw new WizardCancelledError("user cancelled");
      }),
    });

    const result = await runSetupWizard(
      { acceptRisk: true },
      prompter,
    );

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it("uses existing config when keep is selected", async () => {
    const existingConfig: Partial<SetupConfig> = {
      gateway: {
        port: 9999,
        bind: "lan",
        authMode: "none",
        tailscaleMode: "off",
        tailscaleResetOnExit: false,
      },
    };

    const selectMock = vi.fn(async (params: { message: string }) => {
      if (params.message.includes("existing config")) {
        return "keep";
      }
      return "quickstart";
    });

    const prompter = createPrompter({
      select: selectMock,
    });

    const result = await runSetupWizard(
      {
        flow: "quickstart",
        acceptRisk: true,
        existingConfig,
        skipUi: true,
      },
      prompter,
    );

    expect(result.success).toBe(true);
  });

  it("includes manifest plugins in setup", async () => {
    const manifestPlugins = [
      {
        id: "test-plugin",
        name: "Test Plugin",
        configUiHints: {
          setting: { label: "Setting" },
        },
      },
    ];

    const prompter = createPrompter({
      multiselect: vi.fn(async () => ["test-plugin"]),
      text: vi.fn(async () => "value"),
    });

    const result = await runSetupWizard(
      {
        flow: "quickstart",
        acceptRisk: true,
        manifestPlugins,
        skipUi: true,
      },
      prompter,
    );

    expect(result.success).toBe(true);
    expect(result.config?.plugins).toBeDefined();
  });
});
