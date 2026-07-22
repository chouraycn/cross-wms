/**
 * Runtime type contracts for command-detection helpers loaded across lazy
 * boundaries.
 *
 * Ported from openclaw/src/auto-reply/command-detection.runtime-types.ts.
 */
import type { CommandDetectionConfig, CommandNormalizeOptions } from './command-detection.js';

/** Runtime-injected predicate for deciding whether visible text is an OpenClaw command. */
export type IsControlCommandMessage = (
  text?: string,
  cfg?: CommandDetectionConfig,
  options?: CommandNormalizeOptions,
) => boolean;

/** Runtime-injected predicate for deciding whether command authorization must be computed. */
export type ShouldComputeCommandAuthorized = (
  text?: string,
  cfg?: CommandDetectionConfig,
  options?: CommandNormalizeOptions,
) => boolean;
