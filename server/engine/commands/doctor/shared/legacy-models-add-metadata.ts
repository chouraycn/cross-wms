// Detection helper for legacy `/models add` OpenAI Codex entries missing metadata markers.
// 移植自 openclaw/src/commands/doctor/shared/legacy-models-add-metadata.ts
//
// 降级说明：
//  - normalizeProviderId 来自 @openclaw/model-catalog-core/provider-id
//    → cross-wms 已在 ../../plugins/_openclaw__model_catalog_core__provider_id.ts 实现同源函数
//  - ModelDefinitionConfig 来自 ../../../config/types.models.js
//    → cross-wms 已有，但仅包含 id 字段；这里使用本地扩展类型 LegacyModelsAddModel
//      以保留 openclaw 原始检测逻辑中需要访问的字段
import { normalizeProviderId } from "../../../plugins/_openclaw__model_catalog_core__provider_id.js";

/**
 * Legacy `/models add` model entry shape（最小占位）。
 *
 * openclaw 中 ModelDefinitionConfig 包含 api/reasoning/input/cost/contextWindow 等字段，
 * cross-wms 当前降级版本仅暴露 id。这里定义本地结构以保留检测逻辑。
 */
type LegacyModelsAddModel = {
  id?: string;
  api?: string;
  reasoning?: boolean;
  input?: string[];
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  contextWindow?: number;
  contextTokens?: number;
  maxTokens?: number;
  [key: string]: unknown;
};

const LEGACY_MODELS_ADD_CODEX_MODEL_IDS = new Set(["gpt-5.5", "gpt-5.5-pro"]);
const LEGACY_MODELS_ADD_CODEX_APIS = new Set([
  "openai-codex-responses",
  "openai-chatgpt-responses",
]);

/** Return true when a model entry matches the legacy Codex `/models add` default shape. */
export function isLegacyModelsAddCodexMetadataModel(params: {
  provider: string;
  model: Partial<LegacyModelsAddModel> | undefined;
}): boolean {
  const model = params.model;
  if (normalizeProviderId(params.provider) !== "openai-codex" || !model) {
    return false;
  }
  const id = model.id?.trim().toLowerCase();
  if (!id || !LEGACY_MODELS_ADD_CODEX_MODEL_IDS.has(id)) {
    return false;
  }
  return (
    typeof model.api === "string" &&
    LEGACY_MODELS_ADD_CODEX_APIS.has(model.api) &&
    model.reasoning === true &&
    Array.isArray(model.input) &&
    model.input.length === 2 &&
    model.input[0] === "text" &&
    model.input[1] === "image" &&
    model.cost?.input === 5 &&
    model.cost.output === 30 &&
    model.cost.cacheRead === 0.5 &&
    model.cost.cacheWrite === 0 &&
    model.contextWindow === 400_000 &&
    model.contextTokens === 272_000 &&
    model.maxTokens === 128_000
  );
}
