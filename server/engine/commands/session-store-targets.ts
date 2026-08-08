// @ts-nocheck
/**
 * Session store target resolution wrapper for CLI commands.
 *
 * The config helper throws on invalid agent/store combinations; this module
 * converts those errors into command output and exit codes.
 */
import {
  resolveSessionStoreTargets,
  type SessionStoreSelectionOptions,
  type SessionStoreTarget,
} from "@openclaw-src/config/sessions.js";
import type { OpenClawConfig } from "@openclaw-src/config/types.openclaw.js";
import { formatErrorMessage } from "@openclaw-src/infra/errors.js";
import type { RuntimeEnv } from "@openclaw-src/runtime.js";
export { resolveSessionStoreTargets };

/** Resolves session store targets or exits the current command on validation errors. */
export function resolveSessionStoreTargetsOrExit(params: {
  cfg: OpenClawConfig;
  opts: SessionStoreSelectionOptions;
  runtime: RuntimeEnv;
}): SessionStoreTarget[] | null {
  try {
    return resolveSessionStoreTargets(params.cfg, params.opts);
  } catch (error) {
    params.runtime.error(formatErrorMessage(error));
    params.runtime.exit(1);
    return null;
  }
}
