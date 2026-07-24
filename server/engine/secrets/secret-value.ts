/** Validates resolved secret values against expected value shapes. */
import { isRecord } from "../shared/safe-record.js";

/**
 * Describes the resolved value shape a secret target accepts after provider resolution.
 */
export type SecretExpectedResolvedValue = "string" | "string-or-object"; // pragma: allowlist secret

/**
 * Narrows to strings that contain non-whitespace content.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Returns whether a resolved provider value satisfies the target's accepted runtime shape.
 */
export function isExpectedResolvedSecretValue(
  value: unknown,
  expected: SecretExpectedResolvedValue,
): boolean {
  if (expected === "string") {
    return isNonEmptyString(value);
  }
  return isNonEmptyString(value) || isRecord(value);
}

/**
 * Returns whether an inline configured value should be treated as plaintext secret material.
 */
export function hasConfiguredPlaintextSecretValue(
  value: unknown,
  expected: SecretExpectedResolvedValue,
): boolean {
  if (expected === "string") {
    return isNonEmptyString(value);
  }
  return isNonEmptyString(value) || (isRecord(value) && Object.keys(value).length > 0);
}

/**
 * Throws a caller-provided error when a resolved secret value does not match its target shape.
 */
export function assertExpectedResolvedSecretValue(params: {
  value: unknown;
  expected: SecretExpectedResolvedValue;
  errorMessage: string;
}): void {
  if (!isExpectedResolvedSecretValue(params.value, params.expected)) {
    throw new Error(params.errorMessage);
  }
}
