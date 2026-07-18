import { describe, expect, it, vi } from "vitest";
import { createMockPrompter } from "../prompts.js";
import {
  discoverConfigurablePlugins,
  discoverUnconfiguredPlugins,
  setupPluginConfig,
  configurePluginConfig,
  pluginConfigsToPluginConfigArray,
} from "../setup.plugin-config.js";

const testPlugins = [
  {
    id: "plugin-a",
    name: "Plugin A",
    configUiHints: {
      "setting1": { label: "Setting 1", help: "First setting" },
      "setting2": { label: "Setting 2", advanced: true },
    },
    configSchema: {
      properties: {
        setting1: { type: "string" },
        setting2: { type: "string" },
      },
    },
    enabled: true,
  },
  {
    id: "plugin-b",
    name: "Plugin B",
    configUiHints: {
      "enabled": { label: "Enabled" },
      "items": { label: "Items" },
    },
    configSchema: {
      properties: {
        enabled: { type: "boolean" },
        items: { type: "array" },
      },
    },
    enabled: false,
  },
  {
    id: "plugin-c",
    name: "Plugin C",
    configUiHints: {
      "mode": { label: "Mode" },
    },
    configSchema: {
      properties: {
        mode: { type: "string", enum: ["fast", "slow", "balanced"] },
      },
    },
    enabled: true,
  },
  {
    id: "plugin-d",
    name: "Plugin D",
    configUiHints: {
      "secret": { label: "Secret", sensitive: true },
    },
    enabled: true,
  },
  {
    id: "plugin-e",
    name: "Plugin E",
    enabled: true,
  },
];

describe("plugin config discovery", () => {
  it("discovers plugins with non-advanced uiHints", () => {
    const result = discoverConfigurablePlugins({
      manifestPlugins: testPlugins,
    });

    expect(result.length).toBe(4);
    expect(result.map((p) => p.id)).toEqual(["plugin-a", "plugin-b", "plugin-c", "plugin-d"]);
  });

  it("filters out advanced-only fields", () => {
    const result = discoverConfigurablePlugins({
      manifestPlugins: testPlugins,
    });

    const pluginA = result.find((p) => p.id === "plugin-a");
    expect(pluginA).toBeDefined();
    expect(Object.keys(pluginA!.uiHints)).toEqual(["setting1"]);
  });

  it("discovers unconfigured plugins", () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {
      "plugin-a": { setting1: "value" },
    };

    const result = discoverUnconfiguredPlugins({
      manifestPlugins: testPlugins,
      existingConfigs,
    });

    expect(result.map((p) => p.id)).toContain("plugin-b");
    expect(result.map((p) => p.id)).toContain("plugin-c");
    expect(result.map((p) => p.id)).toContain("plugin-d");
    expect(result.map((p) => p.id)).not.toContain("plugin-a");
  });

  it("returns empty array when all plugins are configured", () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {
      "plugin-a": { setting1: "value" },
      "plugin-b": { enabled: true, items: ["a", "b"] },
      "plugin-c": { mode: "fast" },
      "plugin-d": { secret: "some-secret" },
    };

    const result = discoverUnconfiguredPlugins({
      manifestPlugins: testPlugins,
      existingConfigs,
    });

    expect(result.length).toBe(0);
  });

  it("sorts plugins by name", () => {
    const result = discoverConfigurablePlugins({
      manifestPlugins: testPlugins,
    });

    const names = result.map((p) => p.name);
    expect(names).toEqual([...names].sort());
  });
});

describe("setupPluginConfig", () => {
  it("returns existing configs when no unconfigured plugins", async () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {
      "plugin-a": { setting1: "value" },
    };

    const prompter = createMockPrompter();
    const result = await setupPluginConfig({
      manifestPlugins: [{ ...testPlugins[0] }],
      existingConfigs,
      prompter,
    });

    expect(result).toEqual(existingConfigs);
  });

  it("skips plugin config when user selects skip", async () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {};

    const prompter = createMockPrompter({
      multiselect: vi.fn(async () => ["__skip__"]),
    });

    const result = await setupPluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs,
      prompter,
    });

    expect(result).toEqual(existingConfigs);
  });

  it("configures selected plugins with text fields", async () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {};

    const prompter = createMockPrompter({
      multiselect: vi.fn(async () => ["plugin-a"]),
      text: vi.fn(async () => "new-value"),
    });

    const result = await setupPluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs,
      prompter,
    });

    expect(result["plugin-a"]).toBeDefined();
    expect(result["plugin-a"].setting1).toBe("new-value");
  });

  it("handles enum fields with select", async () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {};

    const prompter = createMockPrompter({
      multiselect: vi.fn(async () => ["plugin-c"]),
      select: vi.fn(async () => "fast"),
    });

    const result = await setupPluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs,
      prompter,
    });

    expect(result["plugin-c"]).toBeDefined();
    expect(result["plugin-c"].mode).toBe("fast");
  });

  it("skips sensitive fields", async () => {
    const existingConfigs: Record<string, Record<string, unknown>> = {};
    const noteMock = vi.fn(async () => {});

    const prompter = createMockPrompter({
      multiselect: vi.fn(async () => ["plugin-d"]),
      note: noteMock,
    });

    const result = await setupPluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs,
      prompter,
    });

    expect(noteMock).toHaveBeenCalled();
    expect(result["plugin-d"]).toEqual({});
  });
});

describe("configurePluginConfig", () => {
  it("shows empty note when no configurable plugins", async () => {
    const noteMock = vi.fn(async () => {});
    const prompter = createMockPrompter({ note: noteMock });

    const result = await configurePluginConfig({
      manifestPlugins: [testPlugins[4]],
      existingConfigs: {},
      prompter,
    });

    expect(noteMock).toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it("allows selecting a plugin to configure", async () => {
    const selectMock = vi.fn(async () => "plugin-a");
    const textMock = vi.fn(async () => "updated-value");
    const prompter = createMockPrompter({
      select: selectMock,
      text: textMock,
    });

    const result = await configurePluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs: { "plugin-a": { setting1: "old-value" } },
      prompter,
    });

    expect(result["plugin-a"].setting1).toBe("updated-value");
  });

  it("returns existing configs when user selects back", async () => {
    const selectMock = vi.fn(async () => "__skip__");
    const prompter = createMockPrompter({ select: selectMock });

    const existing = { "plugin-a": { setting1: "value" } };
    const result = await configurePluginConfig({
      manifestPlugins: testPlugins,
      existingConfigs: existing,
      prompter,
    });

    expect(result).toEqual(existing);
  });
});

describe("pluginConfigsToPluginConfigArray", () => {
  it("converts configs map to array", () => {
    const configs = {
      "plugin-a": { setting1: "value" },
      "plugin-b": { enabled: true },
    };

    const result = pluginConfigsToPluginConfigArray(configs, testPlugins);

    expect(result.length).toBe(2);
    expect(result[0].id).toBe("plugin-a");
    expect(result[0].name).toBe("Plugin A");
    expect(result[0].enabled).toBe(true);
    expect(result[0].config).toEqual({ setting1: "value" });
  });

  it("uses defaults for missing manifest entries", () => {
    const configs = {
      "unknown-plugin": { foo: "bar" },
    };

    const result = pluginConfigsToPluginConfigArray(configs, []);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe("unknown-plugin");
    expect(result[0].name).toBe("unknown-plugin");
    expect(result[0].enabled).toBe(true);
  });
});
