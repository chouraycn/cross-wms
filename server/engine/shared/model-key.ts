// 把 provider 与 model 拼接为规范的 provider/model key
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

/** 把 provider 与 model 拼接为规范的 provider/model key */
export function modelKey(provider: string, model: string): string {
  const providerId = provider.trim();
  const modelId = model.trim();
  if (!providerId) {
    return modelId;
  }
  if (!modelId) {
    return providerId;
  }
  return normalizeLowercaseStringOrEmpty(modelId).startsWith(
    `${normalizeLowercaseStringOrEmpty(providerId)}/`,
  )
    ? modelId
    : `${providerId}/${modelId}`;
}
