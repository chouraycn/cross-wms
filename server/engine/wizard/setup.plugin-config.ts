import { logger } from "../../logger.js";
import { t } from "./i18n/index.js";
import type { WizardPrompter } from "./prompts.js";
import type { PluginConfig } from "./types.js";

export type PluginConfigUiHint = {
  label?: string;
  help?: string;
  placeholder?: string;
  advanced?: boolean;
  sensitive?: boolean;
};

export type ConfigurablePlugin = {
  id: string;
  name: string;
  uiHints: Record<string, PluginConfigUiHint>;
  jsonSchema?: Record<string, unknown>;
  enabled?: boolean;
};

type JsonSchemaProperty = {
  type?: string;
  enum?: unknown[];
  description?: string;
};

function resolveJsonSchemaProperty(
  jsonSchema: Record<string, unknown> | undefined,
  fieldKey: string,
): JsonSchemaProperty | undefined {
  if (!jsonSchema) {
    return undefined;
  }
  let cursor: unknown = jsonSchema;
  for (const segment of fieldKey.split(".")) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    const properties = (cursor as Record<string, unknown>).properties;
    if (!properties || typeof properties !== "object") {
      return undefined;
    }
    cursor = (properties as Record<string, unknown>)[segment];
  }
  return cursor && typeof cursor === "object" ? (cursor as JsonSchemaProperty) : undefined;
}

function getPath(obj: Record<string, unknown>, segments: string[]): unknown {
  let cursor: unknown = obj;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object") {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setPath(obj: Record<string, unknown>, segments: string[], value: unknown): void {
  let cursor = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!cursor[segment] || typeof cursor[segment] !== "object") {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  if (value === undefined) {
    delete cursor[segments[segments.length - 1]];
  } else {
    cursor[segments[segments.length - 1]] = value;
  }
}

function toPathSegments(fieldKey: string): string[] {
  return fieldKey.split(".").filter(Boolean);
}

function formatCurrentValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return JSON.stringify(value);
}

function normalizeStringEntries(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function discoverConfigurablePlugins(params: {
  manifestPlugins: ReadonlyArray<{
    id: string;
    name?: string;
    configUiHints?: Record<string, PluginConfigUiHint>;
    configSchema?: Record<string, unknown>;
    enabled?: boolean;
  }>;
}): ConfigurablePlugin[] {
  const result: ConfigurablePlugin[] = [];
  for (const plugin of params.manifestPlugins) {
    if (!plugin.configUiHints) {
      continue;
    }
    const promptableHints: Record<string, PluginConfigUiHint> = {};
    for (const [key, hint] of Object.entries(plugin.configUiHints)) {
      if (!hint.advanced) {
        promptableHints[key] = hint;
      }
    }
    if (Object.keys(promptableHints).length === 0) {
      continue;
    }
    result.push({
      id: plugin.id,
      name: plugin.name ?? plugin.id,
      uiHints: promptableHints,
      jsonSchema: plugin.configSchema,
      enabled: plugin.enabled,
    });
  }
  return result.toSorted((a, b) => a.name.localeCompare(b.name));
}

export function discoverUnconfiguredPlugins(params: {
  manifestPlugins: ReadonlyArray<{
    id: string;
    name?: string;
    configUiHints?: Record<string, PluginConfigUiHint>;
    configSchema?: Record<string, unknown>;
    enabled?: boolean;
  }>;
  existingConfigs: Record<string, Record<string, unknown>>;
}): ConfigurablePlugin[] {
  const all = discoverConfigurablePlugins(params);
  return all.filter((plugin) => {
    const existing = params.existingConfigs[plugin.id] ?? {};
    return Object.keys(plugin.uiHints).some((key) => {
      const val = getPath(existing, toPathSegments(key));
      return val === undefined || val === null || val === "";
    });
  });
}

async function promptPluginFields(params: {
  plugin: ConfigurablePlugin;
  existingConfig: Record<string, unknown>;
  prompter: WizardPrompter;
  showConfigured?: boolean;
}): Promise<Record<string, unknown>> {
  const { plugin, existingConfig, prompter } = params;
  const updatedConfig = structuredClone(existingConfig);
  let changed = false;

  for (const [key, hint] of Object.entries(plugin.uiHints)) {
    const pathSegments = toPathSegments(key);
    const currentValue = getPath(existingConfig, pathSegments);
    const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== "";

    if (hasValue && !params.showConfigured) {
      continue;
    }

    const schemaProp = resolveJsonSchemaProperty(plugin.jsonSchema, key);
    const label = hint.label ?? key;
    const helpSuffix = hint.help ? ` — ${hint.help}` : "";

    if (hint.sensitive) {
      await prompter.note(
        t("wizard.plugins.sensitiveField", {
          label,
          plugin: plugin.id,
          field: key,
        }),
        t("wizard.plugins.sensitiveTitle"),
      );
      continue;
    }

    if (schemaProp?.enum && Array.isArray(schemaProp.enum)) {
      const options = schemaProp.enum.map((v) => ({
        value: String(v),
        label: String(v),
      }));
      if (hasValue) {
        options.unshift({
          value: "__keep__",
          label: t("wizard.plugins.currentValue", {
            value: formatCurrentValue(currentValue),
          }),
        });
      }
      const selected = await prompter.select({
        message: `${label}${helpSuffix}`,
        options,
        initialValue: hasValue ? "__keep__" : undefined,
      });
      if (selected !== "__keep__") {
        setPath(updatedConfig, pathSegments, selected);
        changed = true;
      }
      continue;
    }

    if (schemaProp?.type === "boolean") {
      const confirmed = await prompter.confirm({
        message: `${label}${helpSuffix}`,
        initialValue: typeof currentValue === "boolean" ? currentValue : false,
      });
      if (confirmed !== currentValue) {
        setPath(updatedConfig, pathSegments, confirmed);
        changed = true;
      }
      continue;
    }

    if (schemaProp?.type === "array") {
      const currentStr = Array.isArray(currentValue)
        ? (currentValue as unknown[]).join(", ")
        : "";
      const input = await prompter.text({
        message: `${label}${t("wizard.plugins.arrayPromptSuffix")}${helpSuffix}`,
        initialValue: currentStr,
        placeholder: hint.placeholder ?? t("wizard.plugins.arrayPlaceholder"),
      });
      const trimmed = input.trim();
      if (trimmed !== currentStr) {
        if (trimmed) {
          const values = normalizeStringEntries(trimmed);
          setPath(updatedConfig, pathSegments, values);
        } else {
          setPath(updatedConfig, pathSegments, undefined);
        }
        changed = true;
      }
      continue;
    }

    const currentStr = formatCurrentValue(currentValue);
    const input = await prompter.text({
      message: `${label}${helpSuffix}`,
      initialValue: currentStr,
      placeholder: hint.placeholder,
    });
    const trimmed = input.trim();
    if (trimmed !== currentStr) {
      if (schemaProp?.type === "number" || schemaProp?.type === "integer") {
        if (trimmed === "") {
          setPath(updatedConfig, pathSegments, undefined);
          changed = true;
        } else {
          const parsed = Number(trimmed);
          if (Number.isFinite(parsed)) {
            setPath(updatedConfig, pathSegments, parsed);
            changed = true;
          }
        }
      } else {
        setPath(updatedConfig, pathSegments, trimmed || undefined);
        changed = true;
      }
    }
  }

  if (!changed) {
    return existingConfig;
  }

  return updatedConfig;
}

export async function setupPluginConfig(params: {
  manifestPlugins: ReadonlyArray<{
    id: string;
    name?: string;
    configUiHints?: Record<string, PluginConfigUiHint>;
    configSchema?: Record<string, unknown>;
    enabled?: boolean;
  }>;
  existingConfigs: Record<string, Record<string, unknown>>;
  prompter: WizardPrompter;
}): Promise<Record<string, Record<string, unknown>>> {
  const unconfigured = discoverUnconfiguredPlugins({
    manifestPlugins: params.manifestPlugins,
    existingConfigs: params.existingConfigs,
  });

  if (unconfigured.length === 0) {
    logger.debug("[Wizard:PluginConfig] No unconfigured plugins found");
    return params.existingConfigs;
  }

  const selected = await params.prompter.multiselect({
    message: t("wizard.plugins.configureSelectOnboard"),
    options: [
      {
        value: "__skip__",
        label: t("common.skipForNow"),
        hint: t("wizard.plugins.skipConfigHint"),
      },
      ...unconfigured.map((p) => ({
        value: p.id,
        label: p.name,
        hint: t("wizard.plugins.fieldsCount", {
          count: Object.keys(p.uiHints).length,
          plural: Object.keys(p.uiHints).length === 1 ? "" : "s",
        }),
      })),
    ],
  });

  const configs = { ...params.existingConfigs };
  for (const pluginId of selected.filter((value) => value !== "__skip__")) {
    const plugin = unconfigured.find((p) => p.id === pluginId);
    if (!plugin) {
      continue;
    }
    await params.prompter.note(
      t("wizard.plugins.configurePlugin", { plugin: plugin.name }),
      t("wizard.plugins.configureFieldsTitle"),
    );
    configs[pluginId] = await promptPluginFields({
      plugin,
      existingConfig: params.existingConfigs[pluginId] ?? {},
      prompter: params.prompter,
    });
  }

  logger.debug(`[Wizard:PluginConfig] Configured ${selected.length} plugins`);
  return configs;
}

export async function configurePluginConfig(params: {
  manifestPlugins: ReadonlyArray<{
    id: string;
    name?: string;
    configUiHints?: Record<string, PluginConfigUiHint>;
    configSchema?: Record<string, unknown>;
    enabled?: boolean;
  }>;
  existingConfigs: Record<string, Record<string, unknown>>;
  prompter: WizardPrompter;
}): Promise<Record<string, Record<string, unknown>>> {
  const configurable = discoverConfigurablePlugins({
    manifestPlugins: params.manifestPlugins,
  });

  if (configurable.length === 0) {
    await params.prompter.note(
      t("wizard.plugins.configureEmpty"),
      t("wizard.plugins.configureEmptyTitle"),
    );
    return params.existingConfigs;
  }

  const selected = await params.prompter.select({
    message: t("wizard.plugins.configureSelect"),
    options: [
      ...configurable.map((p) => {
        const existing = params.existingConfigs[p.id] ?? {};
        const configuredCount = Object.keys(p.uiHints).filter((k) => {
          const val = getPath(existing, toPathSegments(k));
          return val !== undefined && val !== null && val !== "";
        }).length;
        const totalCount = Object.keys(p.uiHints).length;
        return {
          value: p.id,
          label: p.name,
          hint: t("wizard.plugins.configuredCount", {
            configured: configuredCount,
            total: totalCount,
          }),
        };
      }),
      { value: "__skip__", label: t("common.back"), hint: t("wizard.plugins.configureBackHint") },
    ],
    searchable: true,
  });

  if (selected === "__skip__") {
    return params.existingConfigs;
  }

  const plugin = configurable.find((p) => p.id === selected);
  if (!plugin) {
    return params.existingConfigs;
  }

  const updated = await promptPluginFields({
    plugin,
    existingConfig: params.existingConfigs[plugin.id] ?? {},
    prompter: params.prompter,
    showConfigured: true,
  });

  return {
    ...params.existingConfigs,
    [plugin.id]: updated,
  };
}

export function pluginConfigsToPluginConfigArray(
  configs: Record<string, Record<string, unknown>>,
  manifestPlugins: ReadonlyArray<{ id: string; name?: string; enabled?: boolean }>,
): PluginConfig[] {
  const result: PluginConfig[] = [];
  for (const [id, config] of Object.entries(configs)) {
    const manifest = manifestPlugins.find((p) => p.id === id);
    result.push({
      id,
      name: manifest?.name ?? id,
      enabled: manifest?.enabled ?? true,
      config,
    });
  }
  return result;
}
