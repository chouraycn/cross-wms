export interface ModelCatalogEntry {
  providerId: string;
  modelId: string;
  modelName: string;
  aliases?: string[];
}

export type ModelCatalog = ModelCatalogEntry[];

/** Unified catalog kind across text and generated media models. */
export type UnifiedModelCatalogKind =
  | "text"
  | "voice"
  | "image_generation"
  | "video_generation"
  | "music_generation";

/** Source for unified model catalog entries. */
export type UnifiedModelCatalogSource =
  | "manifest"
  | "provider-index"
  | "static"
  | "live"
  | "cache"
  | "configured"
  | "runtime-refresh";

/** Unified model catalog entry for provider/model pickers. */
export type UnifiedModelCatalogEntry<TCapabilities = unknown> = {
  kind: UnifiedModelCatalogKind;
  provider: string;
  model: string;
  label?: string;
  source: UnifiedModelCatalogSource;
  default?: boolean;
  configured?: boolean;
  capabilities?: TCapabilities;
  modes?: readonly string[];
  authEnvVars?: readonly string[];
  docsPath?: string;
  fetchedAt?: number;
  expiresAt?: number;
  warnings?: readonly string[];
};
