import type { ModelConfig, ModelApiType, ModelCompatConfig, ModelMediaInputConfig } from '../../../types/models';
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
    contextTokens: model.contextTokens?.toString() || '',
    maxTokens: model.maxTokens?.toString() || '',
    temperature: model.temperature?.toString() ?? '1',
    topP: model.topP?.toString() ?? '1',
    capabilities: model.capabilities || [],
    thinkingLevels: model.thinkingLevels || [],
    defaultThinkingLevel: model.defaultThinkingLevel || '',
    authMode: model.authMode || 'api-key',
    costInput: model.cost?.input?.toString() || '',
    costOutput: model.cost?.output?.toString() || '',
    costCacheRead: model.cost?.cacheRead?.toString() || '',
    costCacheWrite: model.cost?.cacheWrite?.toString() || '',
    localServiceEnabled: !!model.localService,
    localServiceCommand: model.localService?.command || '',
    localServiceArgs: model.localService?.args?.join(' ') || '',
    localServiceCwd: model.localService?.cwd || '',
    localServiceEnv: model.localService?.env
      ? Object.entries(model.localService.env).map(([k, v]) => `${k}=${v}`).join('\n')
      : '',
    localServiceHealthUrl: model.localService?.healthUrl || '',
    localServiceReadyTimeoutMs: model.localService?.readyTimeoutMs?.toString() || '',
    localServiceIdleStopMs: model.localService?.idleStopMs?.toString() || '',
    apiType: model.apiType || 'auto',
    compatConfig: model.compatConfig,
    mediaInputConfig: model.mediaInputConfig,
  };
}

export function formToModel(form: ModelFormState, originalModel?: ModelConfig | null): ModelConfig {
  const costInput = form.costInput.trim() ? parseFloat(form.costInput) : undefined;
  const costOutput = form.costOutput.trim() ? parseFloat(form.costOutput) : undefined;
  const costCacheRead = form.costCacheRead.trim() ? parseFloat(form.costCacheRead) : undefined;
  const costCacheWrite = form.costCacheWrite.trim() ? parseFloat(form.costCacheWrite) : undefined;
  const hasCost = costInput !== undefined || costOutput !== undefined || costCacheRead !== undefined || costCacheWrite !== undefined;

  let localService: ModelConfig['localService'] | undefined;
  if (form.localServiceEnabled && form.localServiceCommand.trim()) {
    const env: Record<string, string> = {};
    if (form.localServiceEnv.trim()) {
      form.localServiceEnv.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          const k = line.slice(0, idx).trim();
          const v = line.slice(idx + 1).trim();
          if (k) env[k] = v;
        }
      });
    }
    localService = {
      command: form.localServiceCommand.trim(),
      args: form.localServiceArgs.trim() ? form.localServiceArgs.split(/\s+/).filter(Boolean) : undefined,
      cwd: form.localServiceCwd.trim() || undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      healthUrl: form.localServiceHealthUrl.trim() || undefined,
      readyTimeoutMs: form.localServiceReadyTimeoutMs.trim() ? parseInt(form.localServiceReadyTimeoutMs, 10) : undefined,
      idleStopMs: form.localServiceIdleStopMs.trim() ? parseInt(form.localServiceIdleStopMs, 10) : undefined,
    };
  }

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
    contextTokens: form.contextTokens.trim() ? parseInt(form.contextTokens, 10) : undefined,
    maxTokens: form.maxTokens.trim() ? parseInt(form.maxTokens, 10) : undefined,
    temperature: form.temperature.trim() ? parseFloat(form.temperature) : undefined,
    topP: form.topP.trim() ? parseFloat(form.topP) : undefined,
    capabilities: form.capabilities.length > 0 ? (form.capabilities as ModelConfig['capabilities']) : undefined,
    thinkingLevels: form.thinkingLevels.length > 0 ? form.thinkingLevels : undefined,
    defaultThinkingLevel: form.defaultThinkingLevel.trim() || undefined,
    authMode: form.authMode !== 'api-key' ? form.authMode : undefined,
    cost: hasCost ? {
      input: costInput,
      output: costOutput,
      cacheRead: costCacheRead,
      cacheWrite: costCacheWrite,
    } : undefined,
    localService,
    apiType: form.apiType && form.apiType !== 'auto' ? form.apiType as ModelApiType : undefined,
    compatConfig: form.compatConfig,
    mediaInputConfig: form.mediaInputConfig,
  };
  return model;
}
