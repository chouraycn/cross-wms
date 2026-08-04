// Media store runtime facade loads filesystem-safe store implementation.
import "../infra/fs-safe-defaults.js";
import { readLocalFileSafely as readLocalFileSafelyImpl } from "../infra/fs-safe.js";

/** Minimal fs-safe error code shape consumed by media-store source-copy failures. */
export type FsSafeErrorCode =
  | "symlink"
  | "not-file"
  | "path-mismatch"
  | "too-large"
  | "not-found"
  | "outside-workspace"
  | (string & {});

/** Minimal fs-safe error shape consumed by media-store source-copy failures. */
export type FsSafeLikeError = {
  code: FsSafeErrorCode;
  message: string;
};

/** Local FsSafeError class — cross-wms fs-safe does not export the original. */
export class FsSafeError extends Error {
  readonly code: FsSafeErrorCode;
  constructor(code: FsSafeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FsSafeError";
    this.code = code;
  }
}

/** fs-safe local file reader re-exported for media-store test/runtime injection. */
export const readLocalFileSafely = readLocalFileSafelyImpl;

/** Narrows fs-safe failures without exposing the full infra error class to store callers. */
export function isFsSafeError(error: unknown): error is FsSafeLikeError {
  return error instanceof FsSafeError;
}
