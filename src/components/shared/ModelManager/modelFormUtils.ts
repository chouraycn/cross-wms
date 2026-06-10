import type { ModelConfig } from '../../../types/models';
import type { ModelFormState } from './types';

export function modelToForm(model: ModelConfig): ModelFormState {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    apiEndpoint: model.apiEndpoint || '',
    apiKey: model.apiKey || '',
    apiKeyRef: model.apiKeyRef || '',
    apiKeys: (model.apiKeys || []).map((k, i) => ({
      label: k.label || `Key ${i + 1}`,
      key: k.key || '',
      enabled: k.enabled !== false,
      _uid: `${Date.now()}-${i}`,
    })),
    apiKeyRefs: model.apiKeyRefs || [],
    keyStrategy: model.keyStrategy || 'round-robin',
    enabled: model.enabled,
    description: model.description || '',
    contextWindow: model.contextWindow?.toString() || '',
    maxTokens: model.maxTokens?.toString() || '',
    temperature: model.temperature?.toString() ?? '1',
    topP: model.topP?.toString() ?? '1',
    capabilities: model.capabilities || [],
  };
}

export function formToModel(form: ModelFormState, originalModel?: ModelConfig | null): ModelConfig {
  const model: ModelConfig = {
    id: form.id.trim(),
    name: form.name.trim(),
    provider: form.provider,
    apiEndpoint: form.apiEndpoint.trim() || undefined,
    apiKey: form.apiKey.trim() || undefined,
    apiKeyRef: form.apiKey.trim() ? undefined : (form.apiKeyRef || originalModel?.apiKeyRef || undefined),
    apiKeys: form.apiKeys.length > 0
      ? form.apiKeys.map(k => ({ key: k.key.trim(), label: k.label, enabled: k.enabled }))
      : undefined,
    apiKeyRefs: form.apiKeys.length > 0 && !form.apiKeys.some(k => k.key.trim())
      ? (originalModel?.apiKeyRefs || undefined)
      : undefined,
    keyStrategy: form.apiKeys.length > 0 ? form.keyStrategy : undefined,
    enabled: form.enabled,
    description: form.description.trim() || undefined,
    contextWindow: form.contextWindow.trim() ? parseInt(form.contextWindow, 10) : undefined,
    maxTokens: form.maxTokens.trim() ? parseInt(form.maxTokens, 10) : undefined,
    temperature: form.temperature.trim() ? parseFloat(form.temperature) : undefined,
    topP: form.topP.trim() ? parseFloat(form.topP) : undefined,
    capabilities: form.capabilities.length > 0 ? (form.capabilities as ModelConfig['capabilities']) : undefined,
  };
  return model;
}
