/**
 * Structured error classification for failover decisions.
 * Inspired by openclaw's failover-error.ts implementation.
 */

export enum FailoverReason {
  /** Billing/payment issue (402) */
  BILLING = 'billing',
  /** Rate limit exceeded (429) */
  RATE_LIMIT = 'rate_limit',
  /** Authentication failed (401) */
  AUTH = 'auth',
  /** Authentication permanently denied (403) */
  AUTH_PERMANENT = 'auth_permanent',
  /** Request timeout (408) */
  TIMEOUT = 'timeout',
  /** Server error (500) */
  SERVER_ERROR = 'server_error',
  /** Service overloaded (503) */
  OVERLOADED = 'overloaded',
  /** Model not found (404) */
  MODEL_NOT_FOUND = 'model_not_found',
  /** Request format error (400) */
  FORMAT = 'format',
  /** Session expired (410) */
  SESSION_EXPIRED = 'session_expired',
  /** Network connectivity issue */
  NETWORK = 'network',
  /** Unknown error */
  UNKNOWN = 'unknown',
  /** Context overflow - too much context */
  CONTEXT_OVERFLOW = 'context_overflow',
}

export interface FailoverErrorOptions {
  reason: FailoverReason;
  provider?: string;
  model?: string;
  status?: number;
  code?: string;
  message: string;
  originalError?: unknown;
  profileId?: string;
  authMode?: string;
}

export class FailoverError extends Error {
  public readonly reason: FailoverReason;
  public readonly provider?: string;
  public readonly model?: string;
  public readonly status?: number;
  public readonly code?: string;
  public readonly originalError?: unknown;
  public readonly profileId?: string;
  public readonly authMode?: string;

  constructor(options: FailoverErrorOptions) {
    super(options.message);
    this.name = 'FailoverError';
    this.reason = options.reason;
    this.provider = options.provider;
    this.model = options.model;
    this.status = options.status;
    this.code = options.code;
    this.originalError = options.originalError;
    this.profileId = options.profileId;
    this.authMode = options.authMode;
  }

  /**
   * Classify HTTP status code to failover reason.
   */
  static fromStatus(status: number, message: string, context?: Partial<FailoverErrorOptions>): FailoverErrorOptions {
    let reason: FailoverReason;

    switch (status) {
      case 402:
        reason = FailoverReason.BILLING;
        break;
      case 429:
        reason = FailoverReason.RATE_LIMIT;
        break;
      case 401:
        reason = FailoverReason.AUTH;
        break;
      case 403:
        reason = FailoverReason.AUTH_PERMANENT;
        break;
      case 408:
        reason = FailoverReason.TIMEOUT;
        break;
      case 500:
        reason = FailoverReason.SERVER_ERROR;
        break;
      case 502:
      case 503:
      case 504:
        reason = FailoverReason.SERVER_ERROR;
        break;
      case 404:
        // Could be model not found or endpoint not found
        if (message.toLowerCase().includes('model')) {
          reason = FailoverReason.MODEL_NOT_FOUND;
        } else {
          reason = FailoverReason.UNKNOWN;
        }
        break;
      case 400:
        reason = FailoverReason.FORMAT;
        break;
      case 410:
        reason = FailoverReason.SESSION_EXPIRED;
        break;
      default:
        reason = FailoverReason.UNKNOWN;
    }

    return { reason, status, message, ...context };
  }

  /**
   * Classify error from message content.
   */
  static fromMessage(message: string, context?: Partial<FailoverErrorOptions>): FailoverErrorOptions {
    const lowerMessage = message.toLowerCase();

    let reason: FailoverReason = FailoverReason.UNKNOWN;

    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      reason = FailoverReason.TIMEOUT;
    } else if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
      reason = FailoverReason.RATE_LIMIT;
    } else if (lowerMessage.includes('authentication') || lowerMessage.includes('unauthorized') || lowerMessage.includes('api key')) {
      reason = FailoverReason.AUTH;
    } else if (lowerMessage.includes('billing') || lowerMessage.includes('payment') || lowerMessage.includes('quota')) {
      reason = FailoverReason.BILLING;
    } else if (lowerMessage.includes('model not found') || lowerMessage.includes('model does not exist')) {
      reason = FailoverReason.MODEL_NOT_FOUND;
    } else if (lowerMessage.includes('context') && (lowerMessage.includes('overflow') || lowerMessage.includes('exceed') || lowerMessage.includes('limit'))) {
      reason = FailoverReason.CONTEXT_OVERFLOW;
    } else if (lowerMessage.includes('network') || lowerMessage.includes('connect') || lowerMessage.includes('econnrefused') || lowerMessage.includes('enetunreach')) {
      reason = FailoverReason.NETWORK;
    }

    return { reason, message, ...context };
  }
}

/**
 * Determine if an error should trigger model fallback.
 */
export function shouldFallback(error: unknown): boolean {
  if (error instanceof FailoverError) {
    // These reasons should NOT trigger fallback
    const noFallbackReasons = [
      FailoverReason.AUTH_PERMANENT, // Auth permanently denied - no point retrying
      FailoverReason.BILLING, // Billing issue - needs user action
      FailoverReason.MODEL_NOT_FOUND, // Model doesn't exist - won't be fixed by retrying
      FailoverReason.FORMAT, // Request format error - won't be fixed by retrying
    ];

    return !noFallbackReasons.includes(error.reason);
  }

  // For non-FailoverError, default to retryable
  return true;
}

/**
 * Determine if error should trigger auth profile rotation.
 */
export function shouldRotateAuthProfile(error: unknown): boolean {
  if (error instanceof FailoverError) {
    const authReasons = [
      FailoverReason.AUTH,
      FailoverReason.AUTH_PERMANENT,
      FailoverReason.RATE_LIMIT, // Rate limit on one key might not apply to another
    ];
    return authReasons.includes(error.reason);
  }
  return false;
}

/**
 * Check if error is a context overflow error.
 */
export function isContextOverflowError(error: unknown): boolean {
  if (error instanceof FailoverError) {
    return error.reason === FailoverReason.CONTEXT_OVERFLOW;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('context') && (msg.includes('overflow') || msg.includes('exceed') || msg.includes('limit') || msg.includes('too long'));
  }
  return false;
}

/**
 * Check if error is a terminal abort error.
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' || error.name === 'CancelError';
  }
  return false;
}
