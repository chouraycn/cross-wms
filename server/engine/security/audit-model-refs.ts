import { logger } from '../../logger.js';
import type { SecurityFinding } from './types.js';

export type ModelReference = {
  id: string;
  name: string;
  provider: string;
  version?: string;
  endpoint?: string;
  apiKeyRequired: boolean;
  isCustom: boolean;
  capabilities: string[];
  inputFormats: string[];
  outputFormats: string[];
};

export type ModelReferenceAuditContext = {
  models: ModelReference[];
  config?: Record<string, unknown>;
  envVars?: Record<string, string>;
};

const DANGEROUS_CAPABILITIES = [
  'code_execution',
  'shell_access',
  'file_system',
  'network_request',
  'database_access',
  'system_prompt_override',
  'plugin_install',
];

const SUSPICIOUS_PROVIDERS = ['unknown', 'unverified', 'self-hosted'];

const SAFE_INPUT_FORMATS = ['text', 'json', 'markdown'];
const DANGEROUS_INPUT_FORMATS = ['binary', 'raw', 'executable', 'script'];

export function auditModelReferences(context: ModelReferenceAuditContext): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const { models, config, envVars } = context;

  for (const model of models) {
    if (SUSPICIOUS_PROVIDERS.includes(model.provider)) {
      findings.push({
        id: `model-suspicious-provider-${model.id}`,
        title: `Suspicious model provider: ${model.provider}`,
        severity: 'high',
        category: 'config',
        description: `Model ${model.name} (${model.id}) uses provider "${model.provider}" which is not verified.`,
        recommendation: 'Use verified model providers or thoroughly review the provider before use.',
        metadata: { modelId: model.id, provider: model.provider, isCustom: model.isCustom },
      });
    }

    if (model.apiKeyRequired) {
      const apiKeyEnvVar = `MODEL_API_KEY_${model.id.toUpperCase().replace(/-/g, '_')}`;
      const hasKey = envVars ? envVars[apiKeyEnvVar] || envVars['MODEL_API_KEY'] : false;

      if (!hasKey) {
        findings.push({
          id: `model-missing-api-key-${model.id}`,
          title: `Missing API key for model: ${model.name}`,
          severity: 'medium',
          category: 'auth',
          description: `Model ${model.name} requires an API key but none was found in environment variables.`,
          recommendation: `Set environment variable ${apiKeyEnvVar} with the model API key.`,
          metadata: { modelId: model.id, expectedEnvVar: apiKeyEnvVar },
        });
      }
    }

    for (const capability of model.capabilities) {
      if (DANGEROUS_CAPABILITIES.includes(capability)) {
        findings.push({
          id: `model-dangerous-capability-${model.id}-${capability}`,
          title: `Dangerous capability: ${capability}`,
          severity: 'high',
          category: 'command',
          description: `Model ${model.name} has dangerous capability "${capability}" enabled.`,
          recommendation: 'Review and disable dangerous capabilities unless explicitly required.',
          metadata: { modelId: model.id, capability, allCapabilities: model.capabilities },
        });
      }
    }

    for (const format of model.inputFormats) {
      if (DANGEROUS_INPUT_FORMATS.includes(format)) {
        findings.push({
          id: `model-dangerous-input-${model.id}-${format}`,
          title: `Dangerous input format: ${format}`,
          severity: 'medium',
          category: 'config',
          description: `Model ${model.name} accepts dangerous input format "${format}".`,
          recommendation: 'Restrict input formats to safe types (text, json, markdown).',
          metadata: { modelId: model.id, format, inputFormats: model.inputFormats },
        });
      }
    }

    if (!model.version) {
      findings.push({
        id: `model-no-version-${model.id}`,
        title: `No version specified for model: ${model.name}`,
        severity: 'medium',
        category: 'config',
        description: `Model ${model.name} does not specify a version, which can lead to unexpected changes.`,
        recommendation: 'Pin model to a specific version for reproducibility and security.',
        metadata: { modelId: model.id },
      });
    }

    if (model.endpoint) {
      try {
        const url = new URL(model.endpoint);
        if (url.protocol === 'http:') {
          findings.push({
            id: `model-insecure-endpoint-${model.id}`,
            title: `Insecure model endpoint: ${model.endpoint}`,
            severity: 'high',
            category: 'network',
            description: `Model ${model.name} uses HTTP instead of HTTPS for its endpoint.`,
            recommendation: 'Use HTTPS for all model endpoints to encrypt data in transit.',
            metadata: { modelId: model.id, endpoint: model.endpoint },
          });
        }
      } catch {
        findings.push({
          id: `model-invalid-endpoint-${model.id}`,
          title: `Invalid model endpoint: ${model.endpoint}`,
          severity: 'medium',
          category: 'network',
          description: `Model ${model.name} has an invalid endpoint URL.`,
          recommendation: 'Provide a valid URL for the model endpoint.',
          metadata: { modelId: model.id, endpoint: model.endpoint },
        });
      }
    }
  }

  if (models.length === 0) {
    findings.push({
      id: 'model-no-models-configured',
      title: 'No models configured',
      severity: 'info',
      category: 'config',
      description: 'No model references were found in the configuration.',
      recommendation: 'Configure model references as needed for your use case.',
      metadata: {},
    });
  }

  logger.debug(`[Security:ModelRefs] Audited ${models.length} models, found ${findings.length} findings`);

  return findings;
}

export function validateModelConfiguration(config: Record<string, unknown>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const modelsConfig = config['models'] as Record<string, unknown> | undefined;

  if (!modelsConfig) {
    findings.push({
      id: 'model-config-missing',
      title: 'Model configuration missing',
      severity: 'medium',
      category: 'config',
      description: 'Model configuration section is missing from the main config.',
      recommendation: 'Add a models section to the configuration.',
      metadata: {},
    });
    return findings;
  }

  const enabled = modelsConfig['enabled'] as boolean | undefined;
  if (enabled === false) {
    findings.push({
      id: 'model-config-disabled',
      title: 'Models are disabled',
      severity: 'info',
      category: 'config',
      description: 'Models are currently disabled in the configuration.',
      recommendation: 'Enable models if they are needed for your use case.',
      metadata: {},
    });
  }

  const defaultModel = modelsConfig['default'] as string | undefined;
  const modelList = modelsConfig['list'] as Record<string, unknown>[] | undefined;

  if (defaultModel && (!modelList || !modelList.some((m) => m['id'] === defaultModel))) {
    findings.push({
      id: 'model-default-invalid',
      title: 'Default model is invalid',
      severity: 'medium',
      category: 'config',
      description: `Default model "${defaultModel}" is not found in the model list.`,
      recommendation: 'Ensure the default model ID exists in the model list.',
      metadata: { defaultModel },
    });
  }

  const maxConcurrent = modelsConfig['maxConcurrent'] as number | undefined;
  if (maxConcurrent !== undefined && maxConcurrent > 10) {
    findings.push({
      id: 'model-max-concurrent-high',
      title: 'Max concurrent model requests may be too high',
      severity: 'medium',
      category: 'config',
      description: `maxConcurrent is set to ${maxConcurrent}, which may overload the system.`,
      recommendation: 'Set maxConcurrent to a reasonable limit (e.g., 5 or lower).',
      metadata: { maxConcurrent },
    });
  }

  return findings;
}

export function verifyModelApiKeys(models: ModelReference[], envVars?: Record<string, string>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const vars = envVars ?? process.env;

  for (const model of models) {
    if (!model.apiKeyRequired) continue;

    const possibleKeys = [
      `MODEL_API_KEY_${model.id.toUpperCase().replace(/-/g, '_')}`,
      `${model.provider.toUpperCase()}_API_KEY`,
      'MODEL_API_KEY',
      'API_KEY',
    ];

    let foundKey = false;
    let usedKey = '';

    for (const key of possibleKeys) {
      if (vars[key]) {
        foundKey = true;
        usedKey = key;
        break;
      }
    }

    if (!foundKey) {
      findings.push({
        id: `model-api-key-missing-${model.id}`,
        title: `API key not found for model: ${model.name}`,
        severity: 'high',
        category: 'auth',
        description: `No API key found for model ${model.name}. Searched for: ${possibleKeys.join(', ')}.`,
        recommendation: `Set one of the following environment variables: ${possibleKeys.join(', ')}.`,
        metadata: { modelId: model.id, provider: model.provider, searchedKeys: possibleKeys },
      });
    } else {
      const keyValue = vars[usedKey];
      if (keyValue && keyValue.length < 16) {
        findings.push({
          id: `model-api-key-weak-${model.id}`,
          title: `Weak API key for model: ${model.name}`,
          severity: 'medium',
          category: 'auth',
          description: `API key for model ${model.name} appears weak (too short).`,
          recommendation: 'Use a longer, more secure API key.',
          metadata: { modelId: model.id, keyName: usedKey, keyLength: keyValue.length },
        });
      }
    }
  }

  return findings;
}

export function getModelSecurityReport(models: ModelReference[], envVars?: Record<string, string>): {
  totalModels: number;
  verifiedProviders: number;
  suspiciousProviders: number;
  withApiKey: number;
  missingApiKey: number;
  withDangerousCapabilities: number;
  dangerousCapabilityCount: number;
} {
  const report = {
    totalModels: models.length,
    verifiedProviders: 0,
    suspiciousProviders: 0,
    withApiKey: 0,
    missingApiKey: 0,
    withDangerousCapabilities: 0,
    dangerousCapabilityCount: 0,
  };

  const vars = envVars ?? process.env;

  for (const model of models) {
    if (SUSPICIOUS_PROVIDERS.includes(model.provider)) {
      report.suspiciousProviders++;
    } else {
      report.verifiedProviders++;
    }

    if (model.apiKeyRequired) {
      const possibleKeys = [
        `MODEL_API_KEY_${model.id.toUpperCase().replace(/-/g, '_')}`,
        `${model.provider.toUpperCase()}_API_KEY`,
        'MODEL_API_KEY',
        'API_KEY',
      ];
      const hasKey = possibleKeys.some((k) => vars[k]);
      if (hasKey) {
        report.withApiKey++;
      } else {
        report.missingApiKey++;
      }
    }

    const dangerousCaps = model.capabilities.filter((c) => DANGEROUS_CAPABILITIES.includes(c));
    if (dangerousCaps.length > 0) {
      report.withDangerousCapabilities++;
      report.dangerousCapabilityCount += dangerousCaps.length;
    }
  }

  return report;
}