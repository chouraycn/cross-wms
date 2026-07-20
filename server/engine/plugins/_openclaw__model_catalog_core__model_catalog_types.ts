export interface ModelCatalogEntry {
  providerId: string;
  modelId: string;
  modelName: string;
  aliases?: string[];
}

export type ModelCatalog = ModelCatalogEntry[];
