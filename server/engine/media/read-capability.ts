// Media read capability helpers gate file reads by configured media access rules.
// Ported from openclaw/src/media/read-capability.ts.
//
// Dependency adjustments:
//   - ../agents/agent-scope.js (resolveAgentWorkspaceDir) → ./_porting-stubs.js
//   - ../agents/agent-tools.policy.js (resolveGroupToolPolicy) → ./_porting-stubs.js
//   - ../agents/path-policy.js (resolvePathFromInput) → ./_porting-stubs.js
//   - ../agents/tool-fs-policy.js (resolveEffectiveToolFsRootExpansionAllowed)
//     → ./_porting-stubs.js
//   - ../agents/tool-policy-match.js (isToolAllowedByPolicies) → ./_porting-stubs.js
//   - ../agents/workspace-dir.js (resolveWorkspaceRoot) → ./_porting-stubs.js
//   - ../config/types.openclaw.js (OpenClawConfig) → ./_porting-stubs.js (opaque type)
//   - ../infra/fs-safe.js (readLocalFileSafely) → ./_porting-stubs.js
//     (readLocalFileSafelyBuffer — signature adapter returning {buffer})
//   - ./load-options.js (OutboundMediaAccess, OutboundMediaReadFile) → available
//   - ./local-roots.js → ported
import path from "node:path";
import {
  resolveAgentWorkspaceDir,
  resolveEffectiveToolFsRootExpansionAllowed,
  resolveGroupToolPolicy,
  isToolAllowedByPolicies,
  resolvePathFromInput,
  resolveWorkspaceRoot,
  readLocalFileSafelyBuffer,
  type OpenClawConfig,
} from "./_porting-stubs.js";
import type { OutboundMediaAccess, OutboundMediaReadFile } from "./load-options.js";
import {
  getAgentScopedMediaLocalRoots,
  getAgentScopedMediaLocalRootsForSources,
} from "./local-roots.js";

type OutboundHostMediaPolicyContext = {
  sessionKey?: string;
  messageProvider?: string;
  groupId?: string | null;
  groupChannel?: string | null;
  groupSpace?: string | null;
  accountId?: string | null;
  requesterSenderId?: string | null;
  requesterSenderName?: string | null;
  requesterSenderUsername?: string | null;
  requesterSenderE164?: string | null;
};

function isAgentScopedHostMediaReadAllowed(
  params: {
    cfg: OpenClawConfig;
    agentId?: string;
  } & OutboundHostMediaPolicyContext,
): boolean {
  if (
    !resolveEffectiveToolFsRootExpansionAllowed({
      cfg: params.cfg,
      agentId: params.agentId,
    })
  ) {
    return false;
  }
  const groupPolicy = resolveGroupToolPolicy({
    config: params.cfg,
    sessionKey: params.sessionKey,
    messageProvider: params.messageProvider,
    groupId: params.groupId,
    groupChannel: params.groupChannel,
    groupSpace: params.groupSpace,
    accountId: params.accountId,
    senderId: params.requesterSenderId,
    senderName: params.requesterSenderName,
    senderUsername: params.requesterSenderUsername,
    senderE164: params.requesterSenderE164,
  });
  // Sender/group policy only applies when a concrete group override exists.
  if (groupPolicy && !isToolAllowedByPolicies("read", [groupPolicy])) {
    return false;
  }
  return true;
}

/** Creates a host reader bound to the agent workspace and configured local-file safety checks. */
export function createAgentScopedHostMediaReadFile(
  params: {
    cfg: OpenClawConfig;
    agentId?: string;
    workspaceDir?: string;
  } & OutboundHostMediaPolicyContext,
): OutboundMediaReadFile | undefined {
  if (!isAgentScopedHostMediaReadAllowed(params)) {
    return undefined;
  }
  const inferredWorkspaceDir =
    params.workspaceDir ??
    (params.agentId ? resolveAgentWorkspaceDir(params.cfg, params.agentId) : undefined);
  const workspaceRoot = resolveWorkspaceRoot(inferredWorkspaceDir);
  return async (filePath: string) => {
    const resolvedPath = resolvePathFromInput(filePath, workspaceRoot);
    return (await readLocalFileSafelyBuffer({ filePath: resolvedPath })).buffer;
  };
}

function appendWorkspaceDirToLocalRoots(
  roots: readonly string[] | undefined,
  workspaceDir?: string,
): readonly string[] | undefined {
  if (!workspaceDir) {
    return roots;
  }
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  if (!roots?.length) {
    return [resolvedWorkspaceDir];
  }
  if (roots.some((root) => path.resolve(root) === resolvedWorkspaceDir)) {
    return roots;
  }
  return [...roots, resolvedWorkspaceDir];
}

/** Resolves roots and optional host read capability for outbound media in an agent context. */
export function resolveAgentScopedOutboundMediaAccess(
  params: {
    cfg: OpenClawConfig;
    agentId?: string;
    mediaSources?: readonly string[];
    workspaceDir?: string;
    mediaAccess?: OutboundMediaAccess;
    mediaReadFile?: OutboundMediaReadFile;
  } & OutboundHostMediaPolicyContext,
): OutboundMediaAccess {
  const resolvedWorkspaceDir =
    params.workspaceDir ??
    params.mediaAccess?.workspaceDir ??
    (params.agentId ? resolveAgentWorkspaceDir(params.cfg, params.agentId) : undefined);
  const hostMediaReadAllowed = isAgentScopedHostMediaReadAllowed(params);
  // Even when host reads are denied, keep base roots so generated media remains addressable.
  const baseLocalRoots =
    params.mediaAccess?.localRoots ??
    (hostMediaReadAllowed
      ? getAgentScopedMediaLocalRootsForSources({
          cfg: params.cfg,
          agentId: params.agentId,
          mediaSources: params.mediaSources,
        })
      : getAgentScopedMediaLocalRoots(params.cfg, params.agentId));
  const localRoots = appendWorkspaceDirToLocalRoots(baseLocalRoots, resolvedWorkspaceDir);
  const readFile =
    params.mediaAccess?.readFile ??
    params.mediaReadFile ??
    (hostMediaReadAllowed
      ? createAgentScopedHostMediaReadFile({
          cfg: params.cfg,
          agentId: params.agentId,
          workspaceDir: resolvedWorkspaceDir,
          sessionKey: params.sessionKey,
          messageProvider: params.messageProvider,
          groupId: params.groupId,
          groupChannel: params.groupChannel,
          groupSpace: params.groupSpace,
          accountId: params.accountId,
          requesterSenderId: params.requesterSenderId,
          requesterSenderName: params.requesterSenderName,
          requesterSenderUsername: params.requesterSenderUsername,
          requesterSenderE164: params.requesterSenderE164,
        })
      : undefined);
  return {
    ...(localRoots?.length ? { localRoots } : {}),
    ...(readFile ? { readFile } : {}),
    ...(resolvedWorkspaceDir ? { workspaceDir: resolvedWorkspaceDir } : {}),
  };
}
