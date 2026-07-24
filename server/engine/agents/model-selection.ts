/**
 * Model selection resolution helpers.
 * Ported from openclaw/src/agents/model-selection.ts
 * Simplified: model catalog and allowlist resolution replaced with pass-through defaults.
 */

export { isCliProvider } from "./model-selection-cli.js";

export type ThinkLevel = "low" | "medium" | "high";

export function resolvePersistedOverrideModelRef(): undefined { return undefined; }
export function resolvePersistedModelRef(): undefined { return undefined; }
export function resolvePersistedSelectedModelRef(): undefined { return undefined; }
export function normalizeStoredOverrideModel(model: unknown): unknown { return model; }
export function resolveAllowlistModelKey(model: unknown): string { return String(model ?? ""); }
export function resolveDefaultModelForAgent(): undefined { return undefined; }
export async function canonicalizeCaseOnlyCatalogModelRef(modelRef: string): Promise<string> { return modelRef; }
export function resolveSubagentConfiguredModelSelection(): undefined { return undefined; }
export function resolveSubagentSpawnModelSelection(): undefined { return undefined; }
export function resolveConfiguredSubagentSpawnModelSelection(): undefined { return undefined; }
export function buildAllowedModelSet(): Set<string> { return new Set(); }
export function getModelRefStatus(): undefined { return undefined; }
export function resolveAllowedModelRef(modelRef: unknown): unknown { return modelRef; }
export function resolveReasoningDefault(): undefined { return undefined; }
export function normalizeProviderId(provider: unknown): string {
  return typeof provider === "string" ? provider.trim().toLowerCase() : "";
}
