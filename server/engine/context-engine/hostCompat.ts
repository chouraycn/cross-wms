import type {
  ContextEngineHostCapability,
  ContextEngineOperation,
  ContextEngineInfo,
} from './types.js';

export interface ContextEngineHostSupport {
  hostId: string;
  hostLabel: string;
  capabilities: Set<ContextEngineHostCapability>;
  supportedOperations: Set<ContextEngineOperation>;
}

export const CROSS_WMS_EMBEDDED_HOST: ContextEngineHostSupport = {
  hostId: 'cdf-know-embedded',
  hostLabel: 'Cross-WMS Embedded Host',
  capabilities: new Set<ContextEngineHostCapability>([
    'bootstrap',
    'assemble-before-prompt',
    'after-turn',
    'maintain',
    'compact',
    'runtime-llm-complete',
    'thread-bootstrap-projection',
    'memory-search',
    'embedding-provider',
  ]),
  supportedOperations: new Set<ContextEngineOperation>([
    'agent-run',
    'manual-compact',
    'subagent-spawn',
  ]),
};

export interface ContextEngineHostSupportEvaluationResult {
  supported: boolean;
  operation: ContextEngineOperation;
  hostId: string;
  missingCapabilities: ContextEngineHostCapability[];
  hasRequirements: boolean;
  unsupportedMessage?: string;
}

export function evaluateContextEngineHostSupport(
  engineInfo: ContextEngineInfo,
  operation: ContextEngineOperation,
  hostSupport: ContextEngineHostSupport = CROSS_WMS_EMBEDDED_HOST
): ContextEngineHostSupportEvaluationResult {
  const requirements = engineInfo.hostRequirements?.[operation];

  if (!requirements) {
    return {
      supported: true,
      operation,
      hostId: hostSupport.hostId,
      missingCapabilities: [],
      hasRequirements: false,
    };
  }

  const missingCapabilities: ContextEngineHostCapability[] = [];

  for (const capability of requirements.requiredCapabilities) {
    if (!hostSupport.capabilities.has(capability)) {
      missingCapabilities.push(capability);
    }
  }

  const supported = missingCapabilities.length === 0;

  return {
    supported,
    operation,
    hostId: hostSupport.hostId,
    missingCapabilities,
    hasRequirements: true,
    unsupportedMessage: requirements.unsupportedMessage,
  };
}

export interface ResolvedContextEngineContractError {
  engineId: string;
  engineName: string;
  operation: ContextEngineOperation;
  hostId: string;
  missingCapabilities: ContextEngineHostCapability[];
  customMessage?: string;
}

export function describeResolvedContextEngineContractError(
  error: ResolvedContextEngineContractError
): string {
  const { engineId, engineName, operation, hostId, missingCapabilities, customMessage } = error;

  if (customMessage) {
    return customMessage;
  }

  const capabilityList = missingCapabilities.length > 0
    ? missingCapabilities.join(', ')
    : 'unknown';

  return (
    `Context engine '${engineName}' (${engineId}) cannot perform operation '${operation}' ` +
    `on host '${hostId}'. Missing required capabilities: ${capabilityList}`
  );
}
