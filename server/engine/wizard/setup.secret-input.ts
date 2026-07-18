import { logger } from "../../logger.js";

export type SecretRef = {
  source: string;
  provider: string;
  id: string;
};

function formatSecretResolutionError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

export function isSecretRef(value: unknown): value is SecretRef {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.source === "string" &&
    typeof obj.provider === "string" &&
    typeof obj.id === "string"
  );
}

export function resolveSecretInputRef(params: {
  value: unknown;
  envVarName?: string;
  env?: NodeJS.ProcessEnv;
}): { ref?: SecretRef; plaintext?: string } {
  const { value, envVarName, env = process.env } = params;

  if (typeof value === "string" && value.startsWith("ref:")) {
    const refPart = value.slice(4);
    const parts = refPart.split(":");
    if (parts.length >= 3) {
      return {
        ref: {
          source: parts[0],
          provider: parts[1],
          id: parts.slice(2).join(":"),
        },
      };
    }
  }

  if (isSecretRef(value)) {
    return { ref: value };
  }

  if (typeof value === "string" && value.length > 0) {
    return { plaintext: value };
  }

  if (envVarName && env[envVarName]) {
    return { plaintext: env[envVarName] };
  }

  return {};
}

export function normalizeSecretInputString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

async function resolveSecretRefString(
  ref: SecretRef,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (ref.source === "env") {
    const envValue = env[ref.id];
    if (envValue) {
      return envValue;
    }
    throw new Error(`Environment variable "${ref.id}" not found`);
  }

  throw new Error(`Unsupported secret source: ${ref.source}`);
}

export async function resolveSetupSecretInputString(params: {
  value: unknown;
  path: string;
  envVarName?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  const { ref, plaintext } = resolveSecretInputRef({
    value: params.value,
    envVarName: params.envVarName,
    env: params.env,
  });

  if (ref) {
    try {
      return await resolveSecretRefString(ref, params.env);
    } catch (error) {
      const message = `${params.path}: failed to resolve SecretRef "${ref.source}:${ref.provider}:${ref.id}": ${formatSecretResolutionError(error)}`;
      logger.debug(`[Wizard:SecretInput] ${message}`);
      throw new Error(message, { cause: error });
    }
  }

  return normalizeSecretInputString(plaintext ?? params.value);
}

export function createSecretRef(source: string, provider: string, id: string): SecretRef {
  return { source, provider, id };
}

export function secretRefToString(ref: SecretRef): string {
  return `ref:${ref.source}:${ref.provider}:${ref.id}`;
}
