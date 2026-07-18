import { timingSafeEqual } from 'node:crypto';
import { logger } from '../../logger.js';

function padSecretBytes(bytes: Buffer, length: number): Buffer {
  if (bytes.length === length) {
    return bytes;
  }
  const padded = Buffer.alloc(length);
  bytes.copy(padded);
  return padded;
}

export function safeEqualSecret(
  provided: string | undefined | null,
  expected: string | undefined | null,
): boolean {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }

  const providedBytes = Buffer.from(provided, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const byteLength = Math.max(providedBytes.length, expectedBytes.length);

  if (byteLength === 0) {
    return true;
  }

  try {
    const result = timingSafeEqual(
      padSecretBytes(providedBytes, byteLength),
      padSecretBytes(expectedBytes, byteLength),
    );
    return result && providedBytes.length === expectedBytes.length;
  } catch (err) {
    logger.debug('[Security:SecretEqual] Timing safe comparison failed:', err);
    return false;
  }
}

export function safeEqualSecretBuffer(
  provided: Buffer | undefined | null,
  expected: Buffer | undefined | null,
): boolean {
  if (!Buffer.isBuffer(provided) || !Buffer.isBuffer(expected)) {
    return false;
  }

  const byteLength = Math.max(provided.length, expected.length);

  if (byteLength === 0) {
    return true;
  }

  try {
    const result = timingSafeEqual(
      padSecretBytes(provided, byteLength),
      padSecretBytes(expected, byteLength),
    );
    return result && provided.length === expected.length;
  } catch (err) {
    logger.debug('[Security:SecretEqual] Buffer comparison failed:', err);
    return false;
  }
}

export function safeCompareHash(
  hash1: string | undefined | null,
  hash2: string | undefined | null,
): boolean {
  if (!hash1 || !hash2) {
    return false;
  }

  if (hash1.length !== hash2.length) {
    return false;
  }

  return safeEqualSecret(hash1, hash2);
}

export function constantTimeStringCompare(a: string, b: string): boolean {
  return safeEqualSecret(a, b);
}

export function verifyApiKey(
  providedKey: string | undefined | null,
  expectedHash: string,
  hashFunction: (input: string) => string,
): boolean {
  if (!providedKey) {
    return false;
  }

  try {
    const providedHash = hashFunction(providedKey);
    return safeEqualSecret(providedHash, expectedHash);
  } catch (err) {
    logger.warn('[Security:SecretEqual] API key verification error:', err);
    return false;
  }
}

export type ConstantTimeArrayCompareResult<T> = {
  match: boolean;
  matchedIndex: number | -1;
};

export function constantTimeFindInArray<T extends string>(
  target: string,
  candidates: readonly T[],
): ConstantTimeArrayCompareResult<T> {
  let matchedIndex: number = -1;
  let mismatchCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (safeEqualSecret(target, candidate)) {
      if (matchedIndex === -1) {
        matchedIndex = i;
      }
    } else {
      mismatchCount++;
    }
  }

  void mismatchCount;

  return {
    match: matchedIndex !== -1,
    matchedIndex,
  };
}
