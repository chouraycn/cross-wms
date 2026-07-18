import crypto from "node:crypto";
import { logger } from "../../logger.js";
import type { PairingCode, PairingCodeInfo, DeviceId } from "./types.js";

const DEFAULT_CODE_LENGTH = 8;
const DEFAULT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 500;

export interface PairingCodeGeneratorOptions {
  codeLength?: number;
  alphabet?: string;
  ttlMs?: number;
  maxAttempts?: number;
}

export class PairingCodeGenerator {
  private codeLength: number;
  private alphabet: string;
  private ttlMs: number;
  private maxAttempts: number;
  private usedCodes = new Map<PairingCode, PairingCodeInfo>();

  constructor(options: PairingCodeGeneratorOptions = {}) {
    this.codeLength = options.codeLength ?? DEFAULT_CODE_LENGTH;
    this.alphabet = options.alphabet ?? DEFAULT_CODE_ALPHABET;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  generate(deviceId?: DeviceId): PairingCodeInfo {
    this.pruneExpired();

    const existingCodes = new Set(this.usedCodes.keys());

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const code = this.generateRandomCode();

      if (!existingCodes.has(code)) {
        const now = Date.now();
        const codeInfo: PairingCodeInfo = {
          code,
          createdAt: now,
          expiresAt: now + this.ttlMs,
          deviceId,
          used: false,
        };

        this.usedCodes.set(code, codeInfo);
        logger.debug(`[PairingCode] Generated code ${code} for device ${deviceId ?? "unknown"}`);
        return codeInfo;
      }
    }

    throw new Error(
      `Failed to generate unique pairing code after ${this.maxAttempts} attempts`,
    );
  }

  validate(code: PairingCode, deviceId?: DeviceId): boolean {
    const normalized = this.normalize(code);
    const codeInfo = this.usedCodes.get(normalized);

    if (!codeInfo) {
      logger.debug(`[PairingCode] Code ${code} not found`);
      return false;
    }

    if (codeInfo.used) {
      logger.debug(`[PairingCode] Code ${code} already used`);
      return false;
    }

    if (Date.now() > codeInfo.expiresAt) {
      logger.debug(`[PairingCode] Code ${code} expired`);
      this.usedCodes.delete(normalized);
      return false;
    }

    if (deviceId && codeInfo.deviceId && codeInfo.deviceId !== deviceId) {
      logger.debug(`[PairingCode] Code ${code} device mismatch`);
      return false;
    }

    return true;
  }

  markAsUsed(code: PairingCode): boolean {
    const normalized = this.normalize(code);
    const codeInfo = this.usedCodes.get(normalized);

    if (!codeInfo || codeInfo.used || Date.now() > codeInfo.expiresAt) {
      return false;
    }

    codeInfo.used = true;
    logger.debug(`[PairingCode] Code ${code} marked as used`);
    return true;
  }

  getCodeInfo(code: PairingCode): PairingCodeInfo | undefined {
    const normalized = this.normalize(code);
    this.pruneExpired();
    return this.usedCodes.get(normalized);
  }

  revoke(code: PairingCode): boolean {
    const normalized = this.normalize(code);
    return this.usedCodes.delete(normalized);
  }

  pruneExpired(): number {
    const now = Date.now();
    let count = 0;

    for (const [code, info] of this.usedCodes) {
      if (now > info.expiresAt) {
        this.usedCodes.delete(code);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`[PairingCode] Pruned ${count} expired codes`);
    }

    return count;
  }

  clear(): void {
    this.usedCodes.clear();
  }

  getActiveCount(): number {
    this.pruneExpired();
    return this.usedCodes.size;
  }

  normalize(code: PairingCode): PairingCode {
    return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  formatForDisplay(code: PairingCode): string {
    const normalized = this.normalize(code);
    if (normalized.length <= 4) {
      return normalized;
    }
    const mid = Math.floor(normalized.length / 2);
    return `${normalized.slice(0, mid)}-${normalized.slice(mid)}`;
  }

  parseDisplayCode(displayCode: string): PairingCode {
    return this.normalize(displayCode.replace(/-/g, ""));
  }

  private generateRandomCode(): PairingCode {
    let code = "";
    for (let i = 0; i < this.codeLength; i++) {
      const index = crypto.randomInt(0, this.alphabet.length);
      code += this.alphabet[index];
    }
    return code;
  }

  getCodeLength(): number {
    return this.codeLength;
  }

  getAlphabet(): string {
    return this.alphabet;
  }

  getTtlMs(): number {
    return this.ttlMs;
  }
}

export const pairingCodeGenerator = new PairingCodeGenerator();

export function generatePairingCode(
  options: PairingCodeGeneratorOptions = {},
): PairingCodeInfo {
  const generator = new PairingCodeGenerator(options);
  return generator.generate();
}

export function validatePairingCodeFormat(
  code: string,
  options: PairingCodeGeneratorOptions = {},
): boolean {
  const generator = new PairingCodeGenerator(options);
  const normalized = generator.normalize(code);
  return normalized.length === generator.getCodeLength() &&
    [...normalized].every((char) => generator.getAlphabet().includes(char));
}
