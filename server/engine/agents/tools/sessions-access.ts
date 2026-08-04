/**
 * Session visibility and access helpers for session tools.
 *
 * Adds OpenClaw session-key alias normalization and sandbox requester scoping over SDK visibility contracts.
 *
 * Ported from openclaw/src/agents/tools/sessions-access.ts.
 *
 * cross-wms adjustments:
 * - Imported `isSubagentSessionKey` from `../sessions-resolution.js` (cross-wms
 *   already exposes it from the simplified agents/sessions-resolution.ts).
 * - Imported `resolveInternalSessionKey`/`resolveMainSessionAlias` from the
 *   ported `./sessions-resolution.js` (in this folder).
 */
import { normalizeOptionalString } from "@cdf-know/normalization-core/string-coerce";
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { resolveSandboxSessionToolsVisibility } from "../../plugin-sdk/session-visibility.js";
import { isSubagentSessionKey } from "../sessions-resolution.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./sessions-resolution.js";

export {
  createAgentToAgentPolicy,
  createSessionVisibilityGuard,
  createSessionVisibilityRowChecker,
  resolveEffectiveSessionToolsVisibility,
} from "../../plugin-sdk/session-visibility.js";

/** Resolves the requester context used to filter sandboxed session-tool access. */
export function resolveSandboxedSessionToolContext(params: {
  cfg: OpenClawConfig;
  agentSessionKey?: string;
  sandboxed?: boolean;
}): {
  mainKey: string;
  alias: string;
  visibility: "spawned" | "all";
  requesterInternalKey: string | undefined;
  effectiveRequesterKey: string;
  restrictToSpawned: boolean;
} {
  const { mainKey, alias } = resolveMainSessionAlias(params.cfg);
  const visibility = resolveSandboxSessionToolsVisibility(params.cfg);
  const requesterSessionKey = normalizeOptionalString(params.agentSessionKey);
  const requesterInternalKey = requesterSessionKey
    ? resolveInternalSessionKey({
        key: requesterSessionKey,
        alias,
        mainKey,
      })
    : undefined;
  const effectiveRequesterKey = requesterInternalKey ?? alias;
  const restrictToSpawned =
    params.sandboxed === true &&
    visibility === "spawned" &&
    Boolean(requesterInternalKey) &&
    !isSubagentSessionKey(requesterInternalKey ?? "");
  // Main sessions can see all sessions; sandboxed non-subagent callers stay scoped to spawned rows.
  return {
    mainKey,
    alias,
    visibility,
    requesterInternalKey,
    effectiveRequesterKey,
    restrictToSpawned,
  };
}
