import type { IsolatedAgentModelCatalog, IsolatedAgentModelInfo } from "./types.js";

const DEFAULT_MODEL_CATALOG: IsolatedAgentModelCatalog = {
  models: [],
};

let modelCatalog: IsolatedAgentModelCatalog = { ...DEFAULT_MODEL_CATALOG };

export function getIsolatedAgentModelCatalog(): IsolatedAgentModelCatalog {
  return { ...modelCatalog, models: [...modelCatalog.models] };
}

export function setIsolatedAgentModelCatalog(catalog: IsolatedAgentModelCatalog): void {
  modelCatalog = { ...catalog, models: [...catalog.models] };
}

export function addIsolatedAgentModel(model: IsolatedAgentModelInfo): void {
  const existing = modelCatalog.models.find((m) => m.id === model.id);
  if (existing) {
    Object.assign(existing, model);
  } else {
    modelCatalog.models.push({ ...model });
  }
}

export function removeIsolatedAgentModel(modelId: string): void {
  modelCatalog.models = modelCatalog.models.filter((m) => m.id !== modelId);
}

export function findIsolatedAgentModel(modelId: string): IsolatedAgentModelInfo | undefined {
  return modelCatalog.models.find((m) => m.id === modelId);
}