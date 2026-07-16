import EventEmitter from 'eventemitter3';
import type { UnifiedModelCatalogEntry, ModelCatalogSource, ModelFilterOptions, ModelSortBy } from './types';
export interface ModelCatalogEvents {
    model_added: [model: UnifiedModelCatalogEntry];
    model_removed: [modelId: string];
    source_added: [source: ModelCatalogSource];
    source_removed: [sourceId: string];
    catalog_updated: [];
}
export declare class UnifiedModelCatalog extends EventEmitter<ModelCatalogEvents> {
    private models;
    private sources;
    addSource(source: ModelCatalogSource): void;
    removeSource(sourceId: string): boolean;
    addModel(model: UnifiedModelCatalogEntry): void;
    removeModel(modelId: string): boolean;
    getModel(modelId: string): UnifiedModelCatalogEntry | undefined;
    listModels(options?: ModelFilterOptions): UnifiedModelCatalogEntry[];
    listProviders(): string[];
    listTags(): string[];
    sortModels(models: UnifiedModelCatalogEntry[], by: ModelSortBy): UnifiedModelCatalogEntry[];
    estimateCost(modelId: string, inputTokens: number, outputTokens: number): number | null;
    hasModel(modelId: string): boolean;
    size(): number;
    clear(): void;
    export(): ModelCatalogSource;
}
export declare const unifiedModelCatalog: UnifiedModelCatalog;
//# sourceMappingURL=model-catalog.d.ts.map