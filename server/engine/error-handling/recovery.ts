export type RecoveryStrategy = 'retry' | 'fallback' | 'skip' | 'abort' | 'notify';

export interface RetryOptions {
  maxRetries: number;
  delayMs: number;
  backoffFactor: number;
  jitter: boolean;
}

export interface FallbackOptions {
  fallbackMethod: () => Promise<unknown>;
}

export interface RecoveryPolicy {
  strategy: RecoveryStrategy;
  retryOptions?: RetryOptions;
  fallbackOptions?: FallbackOptions;
  notifyTargets?: string[];
}

export interface RecoveryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  strategyUsed: RecoveryStrategy;
}

export class RecoveryEngine {
  private defaultPolicy: RecoveryPolicy = {
    strategy: 'retry',
    retryOptions: {
      maxRetries: 3,
      delayMs: 1000,
      backoffFactor: 2,
      jitter: true,
    },
  };

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    policy: RecoveryPolicy = this.defaultPolicy,
  ): Promise<RecoveryResult<T>> {
    let attempts = 0;
    let lastError: Error | undefined;

    switch (policy.strategy) {
      case 'retry':
        return this.executeWithRetry(operation, policy.retryOptions);

      case 'fallback':
        try {
          const result = await operation();
          return { success: true, result, attempts: 1, strategyUsed: 'fallback' };
        } catch (error) {
          lastError = error as Error;
          attempts++;
          if (policy.fallbackOptions) {
            try {
              const fallbackResult = await policy.fallbackOptions.fallbackMethod();
              return {
                success: true,
                result: fallbackResult as T,
                attempts,
                strategyUsed: 'fallback',
              };
            } catch (fallbackError) {
              return {
                success: false,
                error: fallbackError as Error,
                attempts,
                strategyUsed: 'fallback',
              };
            }
          }
          return { success: false, error: lastError, attempts, strategyUsed: 'fallback' };
        }

      case 'skip':
        try {
          const result = await operation();
          return { success: true, result, attempts: 1, strategyUsed: 'skip' };
        } catch {
          return { success: true, attempts: 1, strategyUsed: 'skip' };
        }

      case 'abort':
        const abortResult = await operation();
        return { success: true, result: abortResult, attempts: 1, strategyUsed: 'abort' };

      case 'notify':
        try {
          const result = await operation();
          return { success: true, result, attempts: 1, strategyUsed: 'notify' };
        } catch (error) {
          if (policy.notifyTargets) {
            for (const target of policy.notifyTargets) {
              this.notify(target, error as Error);
            }
          }
          return { success: false, error: error as Error, attempts: 1, strategyUsed: 'notify' };
        }

      default:
        return this.executeWithRetry(operation, policy.retryOptions);
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions,
  ): Promise<RecoveryResult<T>> {
    const { maxRetries = 3, delayMs = 1000, backoffFactor = 2, jitter = true } = options || {};
    
    let attempts = 0;
    let lastError: Error | undefined;

    for (let i = 0; i <= maxRetries; i++) {
      attempts++;
      try {
        const result = await operation();
        return { success: true, result, attempts, strategyUsed: 'retry' };
      } catch (error) {
        lastError = error as Error;
        
        if (i < maxRetries) {
          const delay = this.calculateDelay(delayMs, backoffFactor, i, jitter);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return { success: false, error: lastError, attempts, strategyUsed: 'retry' };
  }

  private calculateDelay(baseDelay: number, backoffFactor: number, attempt: number, jitter: boolean): number {
    const delay = baseDelay * Math.pow(backoffFactor, attempt);
    
    if (jitter) {
      const jitterFactor = Math.random() * 0.5 + 0.75;
      return Math.round(delay * jitterFactor);
    }
    
    return Math.round(delay);
  }

  private notify(target: string, error: Error): void {
    console.log(`[Recovery] Notifying ${target}: ${error.message}`);
  }
}

export const recoveryEngine = new RecoveryEngine();