/**
 * 移植自 openclaw/src/agents/sessions/settings-manager.ts
 *
 * Session settings manager.
 * cross-wms 简化实现：基于内存的设置管理器，支持全局和项目级别设置。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CompactionSettings {
  enabled?: boolean;
  reserveTokens?: number;
  keepRecentTokens?: number;
}

export interface BranchSummarySettings {
  reserveTokens?: number;
  skipPrompt?: boolean;
}

export interface ProviderRetrySettings {
  timeoutMs?: number;
  maxRetries?: number;
  maxRetryDelayMs?: number;
}

export interface RetrySettings {
  enabled?: boolean;
  maxRetries?: number;
  baseDelayMs?: number;
  provider?: ProviderRetrySettings;
}

export interface TerminalSettings {
  showImages?: boolean;
  imageWidthCells?: number;
  clearOnShrink?: boolean;
  showTerminalProgress?: boolean;
}

export interface ImageSettings {
  autoResize?: boolean;
  blockImages?: boolean;
}

export interface ThinkingBudgetsSettings {
  minimal?: number;
  low?: number;
  medium?: number;
  high?: number;
  max?: number;
}

export interface MarkdownSettings {
  codeBlockIndent?: string;
}

export interface WarningSettings {
  anthropicExtraUsage?: boolean;
}

export type TransportSetting = "sse" | "websocket" | "auto";

export type PackageSource =
  | string
  | {
      source: string;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
      themes?: string[];
    };

export interface Settings {
  lastChangelogVersion?: string;
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  transport?: TransportSetting;
  steeringMode?: "all" | "one-at-a-time";
  followUpMode?: "all" | "one-at-a-time";
  theme?: string;
  compaction?: CompactionSettings;
  branchSummary?: BranchSummarySettings;
  retry?: RetrySettings;
  hideThinkingBlock?: boolean;
  shellPath?: string;
  quietStartup?: boolean;
  shellCommandPrefix?: string;
  npmCommand?: string[];
  collapseChangelog?: boolean;
  enableInstallTelemetry?: boolean;
  packages?: PackageSource[];
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  themes?: string[];
  enableSkillCommands?: boolean;
  terminal?: TerminalSettings;
  images?: ImageSettings;
  enabledModels?: string[];
  doubleEscapeAction?: "fork" | "tree" | "none";
  treeFilterMode?: "default" | "no-tools" | "user-only" | "labeled-only" | "all";
  thinkingBudgets?: ThinkingBudgetsSettings;
  editorPaddingX?: number;
  autocompleteMaxVisible?: number;
  showHardwareCursor?: boolean;
  markdown?: MarkdownSettings;
  warnings?: WarningSettings;
  sessionDir?: string;
  httpIdleTimeoutMs?: number;
}

function deepMergeSettings(base: Settings, overrides: Settings): Settings {
  const result: Settings = { ...base };
  for (const key of Object.keys(overrides) as (keyof Settings)[]) {
    const overrideValue = overrides[key];
    const baseValue = base[key];
    if (overrideValue === undefined) {
      continue;
    }
    if (
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === "object" &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      (result as Record<string, unknown>)[key] = { ...baseValue, ...overrideValue };
    } else {
      (result as Record<string, unknown>)[key] = overrideValue;
    }
  }
  return result;
}

export type SettingsScope = "global" | "project";

export interface SettingsStorage {
  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void;
}

export interface SettingsError {
  scope: SettingsScope;
  error: Error;
}

export class InMemorySettingsStorage implements SettingsStorage {
  private global: string | undefined;
  private project: string | undefined;

  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
    const current = scope === "global" ? this.global : this.project;
    const next = fn(current);
    if (next !== undefined) {
      if (scope === "global") {
        this.global = next;
      } else {
        this.project = next;
      }
    }
  }
}

export class FileSettingsStorage implements SettingsStorage {
  private globalSettingsPath: string;
  private projectSettingsPath: string;

  constructor(cwd: string, agentDir: string) {
    this.globalSettingsPath = join(agentDir, "settings.json");
    this.projectSettingsPath = join(cwd, ".openclaw", "settings.json");
  }

  withLock(scope: SettingsScope, fn: (current: string | undefined) => string | undefined): void {
    const filePath = scope === "global" ? this.globalSettingsPath : this.projectSettingsPath;
    const dir = dirname(filePath);
    const fileExists = existsSync(filePath);
    const current = fileExists ? readFileSync(filePath, "utf-8") : undefined;
    const next = fn(current);
    if (next !== undefined) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, next, "utf-8");
    }
  }
}

export class SettingsManager {
  private storage: SettingsStorage;
  private globalSettings: Settings;
  private projectSettings: Settings;
  private settings: Settings;
  private errors: SettingsError[];

  private constructor(
    storage: SettingsStorage,
    initialGlobal: Settings,
    initialProject: Settings,
    initialErrors: SettingsError[] = [],
  ) {
    this.storage = storage;
    this.globalSettings = initialGlobal;
    this.projectSettings = initialProject;
    this.errors = [...initialErrors];
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings);
  }

  static fromStorage(storage: SettingsStorage): SettingsManager {
    const globalLoad = SettingsManager.tryLoadFromStorage(storage, "global");
    const projectLoad = SettingsManager.tryLoadFromStorage(storage, "project");
    const initialErrors: SettingsError[] = [];
    if (globalLoad.error) {
      initialErrors.push({ scope: "global", error: globalLoad.error });
    }
    if (projectLoad.error) {
      initialErrors.push({ scope: "project", error: projectLoad.error });
    }
    return new SettingsManager(storage, globalLoad.settings, projectLoad.settings, initialErrors);
  }

  static inMemory(settings: Partial<Settings> = {}): SettingsManager {
    const storage = new InMemorySettingsStorage();
    storage.withLock("global", () => JSON.stringify(settings, null, 2));
    return SettingsManager.fromStorage(storage);
  }

  static create(cwd: string, agentDir: string = join(homedir(), ".openclaw")): SettingsManager {
    const storage = new FileSettingsStorage(cwd, agentDir);
    return SettingsManager.fromStorage(storage);
  }

  private static loadFromStorage(storage: SettingsStorage, scope: SettingsScope): Settings {
    let content: string | undefined;
    storage.withLock(scope, (current) => {
      content = current;
      return undefined;
    });
    if (!content) {
      return {};
    }
    return JSON.parse(content) as Settings;
  }

  private static tryLoadFromStorage(
    storage: SettingsStorage,
    scope: SettingsScope,
  ): { settings: Settings; error: Error | null } {
    try {
      return { settings: SettingsManager.loadFromStorage(storage, scope), error: null };
    } catch (error) {
      return { settings: {}, error: error as Error };
    }
  }

  getGlobalSettings(): Settings {
    return structuredClone(this.globalSettings);
  }

  getProjectSettings(): Settings {
    return structuredClone(this.projectSettings);
  }

  async reload(): Promise<void> {
    const globalLoad = SettingsManager.tryLoadFromStorage(this.storage, "global");
    if (!globalLoad.error) {
      this.globalSettings = globalLoad.settings;
    } else {
      this.errors.push({ scope: "global", error: globalLoad.error });
    }
    const projectLoad = SettingsManager.tryLoadFromStorage(this.storage, "project");
    if (!projectLoad.error) {
      this.projectSettings = projectLoad.settings;
    } else {
      this.errors.push({ scope: "project", error: projectLoad.error });
    }
    this.settings = deepMergeSettings(this.globalSettings, this.projectSettings);
  }

  applyOverrides(overrides: Partial<Settings>): void {
    this.settings = deepMergeSettings(this.settings, overrides);
  }

  drainErrors(): SettingsError[] {
    const drained = [...this.errors];
    this.errors = [];
    return drained;
  }

  getDefaultProvider(): string | undefined { return this.settings.defaultProvider; }
  getDefaultModel(): string | undefined { return this.settings.defaultModel; }
  getDefaultThinkingLevel(): Settings["defaultThinkingLevel"] { return this.settings.defaultThinkingLevel; }
  getTransport(): TransportSetting { return this.settings.transport ?? "auto"; }
  getSteeringMode(): "all" | "one-at-a-time" { return this.settings.steeringMode || "one-at-a-time"; }
  getFollowUpMode(): "all" | "one-at-a-time" { return this.settings.followUpMode || "one-at-a-time"; }
  getTheme(): string | undefined { return this.settings.theme; }
  getCompactionEnabled(): boolean { return this.settings.compaction?.enabled ?? true; }
  getCompactionReserveTokens(): number { return this.settings.compaction?.reserveTokens ?? 16384; }
  getCompactionKeepRecentTokens(): number { return this.settings.compaction?.keepRecentTokens ?? 20000; }
  getCompactionSettings(): { enabled: boolean; reserveTokens: number; keepRecentTokens: number } {
    return { enabled: this.getCompactionEnabled(), reserveTokens: this.getCompactionReserveTokens(), keepRecentTokens: this.getCompactionKeepRecentTokens() };
  }
  getBranchSummarySettings(): { reserveTokens: number; skipPrompt: boolean } {
    return { reserveTokens: this.settings.branchSummary?.reserveTokens ?? 16384, skipPrompt: this.settings.branchSummary?.skipPrompt ?? false };
  }
  getRetryEnabled(): boolean { return this.settings.retry?.enabled ?? true; }
  getRetrySettings(): { enabled: boolean; maxRetries: number; baseDelayMs: number } {
    return { enabled: this.getRetryEnabled(), maxRetries: this.settings.retry?.maxRetries ?? 3, baseDelayMs: this.settings.retry?.baseDelayMs ?? 2000 };
  }
  getProviderRetrySettings(): { timeoutMs?: number; maxRetries?: number; maxRetryDelayMs: number } {
    return { timeoutMs: this.settings.retry?.provider?.timeoutMs, maxRetries: this.settings.retry?.provider?.maxRetries, maxRetryDelayMs: this.settings.retry?.provider?.maxRetryDelayMs ?? 60000 };
  }
  getHideThinkingBlock(): boolean { return this.settings.hideThinkingBlock ?? false; }
  getShellPath(): string | undefined { return this.settings.shellPath; }
  getQuietStartup(): boolean { return this.settings.quietStartup ?? false; }
  getShellCommandPrefix(): string | undefined { return this.settings.shellCommandPrefix; }
  getNpmCommand(): string[] | undefined { return this.settings.npmCommand ? [...this.settings.npmCommand] : undefined; }
  getCollapseChangelog(): boolean { return this.settings.collapseChangelog ?? false; }
  getEnableInstallTelemetry(): boolean { return this.settings.enableInstallTelemetry ?? true; }
  getPackages(): PackageSource[] { return [...(this.settings.packages ?? [])]; }
  getExtensionPaths(): string[] { return [...(this.settings.extensions ?? [])]; }
  getSkillPaths(): string[] { return [...(this.settings.skills ?? [])]; }
  getPromptTemplatePaths(): string[] { return [...(this.settings.prompts ?? [])]; }
  getThemePaths(): string[] { return [...(this.settings.themes ?? [])]; }
  getEnableSkillCommands(): boolean { return this.settings.enableSkillCommands ?? true; }
  getThinkingBudgets(): ThinkingBudgetsSettings | undefined { return this.settings.thinkingBudgets; }
  getShowImages(): boolean { return this.settings.terminal?.showImages ?? true; }
  getImageWidthCells(): number { const w = this.settings.terminal?.imageWidthCells; return typeof w === "number" && Number.isFinite(w) ? Math.max(1, Math.floor(w)) : 60; }
  getClearOnShrink(): boolean { return this.settings.terminal?.clearOnShrink ?? process.env.OPENCLAW_CLEAR_ON_SHRINK === "1"; }
  getShowTerminalProgress(): boolean { return this.settings.terminal?.showTerminalProgress ?? false; }
  getImageAutoResize(): boolean { return this.settings.images?.autoResize ?? true; }
  getBlockImages(): boolean { return this.settings.images?.blockImages ?? false; }
  getEnabledModels(): string[] | undefined { return this.settings.enabledModels; }
  getDoubleEscapeAction(): "fork" | "tree" | "none" { return this.settings.doubleEscapeAction ?? "tree"; }
  getTreeFilterMode(): "default" | "no-tools" | "user-only" | "labeled-only" | "all" {
    const mode = this.settings.treeFilterMode;
    const valid = ["default", "no-tools", "user-only", "labeled-only", "all"];
    return mode && valid.includes(mode) ? mode : "default";
  }
  getShowHardwareCursor(): boolean { return this.settings.showHardwareCursor ?? process.env.OPENCLAW_HARDWARE_CURSOR === "1"; }
  getEditorPaddingX(): number { return this.settings.editorPaddingX ?? 0; }
  getAutocompleteMaxVisible(): number { return this.settings.autocompleteMaxVisible ?? 5; }
  getCodeBlockIndent(): string { return this.settings.markdown?.codeBlockIndent ?? "  "; }
  getWarnings(): WarningSettings { return { ...this.settings.warnings }; }
  getSessionDir(): string | undefined {
    const sessionDir = this.settings.sessionDir;
    if (!sessionDir) return sessionDir;
    if (sessionDir === "~") return homedir();
    if (sessionDir.startsWith("~/")) return join(homedir(), sessionDir.slice(2));
    return sessionDir;
  }
  getHttpIdleTimeoutMs(): number { return this.settings.httpIdleTimeoutMs ?? 30_000; }
}
