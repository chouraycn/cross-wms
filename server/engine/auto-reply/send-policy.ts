/**
 * Parsing for the /send override command embedded in inbound auto-reply text.
 *
 * Ported from openclaw/src/auto-reply/send-policy.ts. The OpenClaw helpers
 * `normalizeCommandBody` and `stripInboundMetadata` are imported from the
 * ported `command-detection.js` (which inlines the original logic).
 */
import {
  normalizeCommandBody,
  stripInboundMetadata,
} from './command-detection.js';

type SendPolicyOverride = 'allow' | 'deny';

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

function normalizeSendPolicyOverride(raw?: string | null): SendPolicyOverride | undefined {
  const value = normalizeOptionalLowercaseString(raw);
  if (!value) return undefined;
  if (value === 'allow' || value === 'on') return 'allow';
  if (value === 'deny' || value === 'off') return 'deny';
  return undefined;
}

/** Result of parsing a `/send` policy command. */
export type SendPolicyCommandResult = {
  hasCommand: boolean;
  mode?: SendPolicyOverride | 'inherit';
};

/** Parses /send commands and maps user-facing aliases to allow, deny, or inherit. */
export function parseSendPolicyCommand(raw?: string): SendPolicyCommandResult {
  if (!raw) return { hasCommand: false };
  const trimmed = raw.trim();
  if (!trimmed) return { hasCommand: false };
  const stripped = stripInboundMetadata(trimmed);
  const normalized = normalizeCommandBody(stripped);
  const match = normalized.match(/^\/send(?:\s+([a-zA-Z]+))?\s*$/i);
  if (!match) return { hasCommand: false };
  const token = normalizeOptionalLowercaseString(match[1]);
  if (!token) return { hasCommand: true };
  if (token === 'inherit' || token === 'default' || token === 'reset') {
    return { hasCommand: true, mode: 'inherit' };
  }
  const mode = normalizeSendPolicyOverride(token);
  return { hasCommand: true, mode };
}
