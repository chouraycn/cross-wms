import { logger } from '../../logger.js';

export type EnvVarBinding = {
  envVar: string;
  configPath: string;
  required: boolean;
  defaultValue?: string;
  redact?: boolean;
};

const ENV_VAR_BINDINGS: EnvVarBinding[] = [
  { envVar: 'GATEWAY_PORT', configPath: 'gateway.port', required: false, defaultValue: '3000' },
  { envVar: 'GATEWAY_HOST', configPath: 'gateway.host', required: false, defaultValue: '127.0.0.1' },
  { envVar: 'GATEWAY_AUTH_TOKEN', configPath: 'gateway.auth.token', required: false, redact: true },
  { envVar: 'GATEWAY_AUTH_PASSWORD', configPath: 'gateway.auth.password', required: false, redact: true },
  { envVar: 'DEFAULT_MODEL', configPath: 'models.default', required: false },
  { envVar: 'LOG_LEVEL', configPath: 'logging.level', required: false, defaultValue: 'info' },
  { envVar: 'OPENAI_API_KEY', configPath: 'models.providers.openai.apiKey', required: false, redact: true },
  { envVar: 'ANTHROPIC_API_KEY', configPath: 'models.providers.anthropic.apiKey', required: false, redact: true },
  { envVar: 'GOOGLE_API_KEY', configPath: 'models.providers.google.apiKey', required: false, redact: true },
];

export function resolveEnvVar(name: string): string | undefined {
  return process.env[name];
}

export function resolveEnvVars(): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const binding of ENV_VAR_BINDINGS) {
    const value = process.env[binding.envVar];
    result[binding.configPath] = value ?? binding.defaultValue;
    if (value) {
      logger.debug(`[Config] Env var ${binding.envVar} → ${binding.configPath}${binding.redact ? ' (redacted)' : ''}`);
    }
  }
  return result;
}

export function getEnvVarBindings(): EnvVarBinding[] {
  return ENV_VAR_BINDINGS;
}
