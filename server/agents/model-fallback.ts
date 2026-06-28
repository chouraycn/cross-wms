/**
 * Model fallback chain for automatic failover between models.
 * Simplified implementation based on openclaw's model-fallback.ts.
 */

import { FailoverError, FailoverReason, shouldFallback } from '../errors/failover.js';
import { retry, RetryConfig, createChannelRetryConfig } from '../infra/retry.js';

export interface ModelConfig {
  provider: string;
  model: string;
  timeoutMs?: number;
}

export interface ModelFallbackOptions {
  /** Primary model to use */
  primary: ModelConfig;
  /** Fallback models in order of preference */
  fallbacks?: ModelConfig[];
  /** Retry configuration for each model */
  retryConfig?: RetryConfig;
  /** Called when switching to a fallback model */
  onFallback?: (from: string, to: string, reason: string) => void;
  /** Abort signal to cancel the operation */
  signal?: AbortSignal;
}

/**
 * Execute a function with model fallback support.
 */
export async function runWithModelFallback<T>(
  options: ModelFallbackOptions,
  fn: (config: ModelConfig, signal?: AbortSignal) => Promise<T>
): Promise<T> {
  const { primary, fallbacks = [], retryConfig = createChannelRetryConfig(), onFallback, signal } = options;

  const candidates = [primary, ...fallbacks];
  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const config = candidates[i];
    const configId = `${config.provider}/${config.model}`;

    try {
      // Use retry wrapper for each model attempt
      const result = await retry(
        async () => {
          const controller = new AbortController();
          const linkSignal = () => {
            signal?.addEventListener('abort', () => controller.abort());
          };
          linkSignal();

          if (config.timeoutMs) {
            const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
            try {
              return await fn(config, controller.signal);
            } finally {
              clearTimeout(timeout);
            }
          }
          return await fn(config, controller.signal);
        },
        {
          ...retryConfig,
          signal,
          onRetry: (error, attempt, delay) => {
            console.warn(`[ModelFallback] ${configId} attempt ${attempt} failed, retrying in ${delay}ms:`, error);
          },
        }
      );

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should continue to fallback
      if (!shouldFallback(error)) {
        throw error;
      }

      // Check if there are more candidates
      if (i < candidates.length - 1) {
        const nextConfig = candidates[i + 1];
        const nextId = `${nextConfig.provider}/${nextConfig.model}`;

        // Notify about fallback
        onFallback?.(configId, nextId, error instanceof Error ? error.message : String(error));

        console.warn(`[ModelFallback] ${configId} failed, falling back to ${nextId}`);
        continue;
      }

      // No more candidates, wrap and throw
      if (!(error instanceof FailoverError)) {
        const failoverOptions = FailoverError.fromMessage(
          error instanceof Error ? error.message : String(error),
          { provider: config.provider, model: config.model, originalError: error }
        );
        throw new FailoverError(failoverOptions);
      }

      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}

/**
 * Resolve model fallback chain from configuration.
 */
export function resolveModelFallbackChain(
  primary: string,
  configuredFallbacks?: string[]
): { provider: string; model: string }[] {
  const parseModelRef = (ref: string): { provider: string; model: string } => {
    const parts = ref.split('/');
    if (parts.length >= 2) {
      return { provider: parts[0], model: parts.slice(1).join('/') };
    }
    return { provider: 'unknown', model: ref };
  };

  const chain = [parseModelRef(primary)];

  if (configuredFallbacks) {
    for (const fallback of configuredFallbacks) {
      chain.push(parseModelRef(fallback));
    }
  }

  return chain;
}

/**
 * Check if error indicates we should try a different model.
 */
export function shouldTryNextModel(error: unknown): boolean {
  if (error instanceof FailoverError) {
    // Don't retry these
    const terminalReasons = [
      FailoverReason.AUTH_PERMANENT,
      FailoverReason.BILLING,
      FailoverReason.MODEL_NOT_FOUND,
      FailoverReason.FORMAT,
      FailoverReason.CONTEXT_OVERFLOW,
    ];
    return !terminalReasons.includes(error.reason);
  }

  // For unknown errors, default to trying next model
  return true;
}
