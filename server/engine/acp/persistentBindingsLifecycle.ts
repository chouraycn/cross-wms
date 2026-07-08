/**
 * ACP Persistent Bindings - Lifecycle
 * 持久绑定生命周期管理（openclaw 兼容）
 *
 * 参考 openclaw/src/acp/persistent-bindings.lifecycle.ts 设计
 *
 * 功能：确保配置的 channel-to-ACP 绑定拥有活动的 session 和匹配的 runtime options
 */

import {
  buildConfiguredAcpSessionKey,
  normalizeText,
  normalizeLowercaseStringOrEmpty,
} from "./persistentBindingsResolve.js";
import type {
  ConfiguredAcpBindingSpec,
  SessionAcpMeta,
  BindingLifecycleResult,
  BindingResolutionResult,
  AcpRuntimeSessionMode,
} from "./persistentBindingsTypes.js";

/** Session Manager 接口（用于 lifecycle 操作） */
export interface AcpSessionManagerLike {
  resolveSession(params: { sessionKey: string }): BindingResolutionResult;
  upsertSession(params: {
    sessionKey: string;
    meta: SessionAcpMeta;
  }): BindingLifecycleResult;
  removeSession(params: { sessionKey: string }): void;
}

/** Lifecycle 配置 */
export interface BindingLifecycleConfig {
  defaultBackend?: string;
  defaultCwd?: string;
}

/** 检查现有 session 是否匹配配置的 binding */
function sessionMatchesConfiguredBinding(params: {
  spec: ConfiguredAcpBindingSpec;
  meta: SessionAcpMeta;
  config?: BindingLifecycleConfig;
}): boolean {
  if (params.meta.state === "error") {
    return false;
  }

  const desiredAgent = normalizeLowercaseStringOrEmpty(
    params.spec.acpAgentId ?? params.spec.agentId,
  );
  const currentAgent = normalizeLowercaseStringOrEmpty(params.meta.agent);
  if (!currentAgent || currentAgent !== desiredAgent) {
    return false;
  }

  if (params.meta.mode !== (params.spec.mode ?? "persistent")) {
    return false;
  }

  const desiredBackend =
    normalizeText(params.spec.backend) ?? normalizeText(params.config?.defaultBackend) ?? "";
  if (desiredBackend) {
    const currentBackend = (params.meta.backend ?? "").trim();
    if (!currentBackend || currentBackend !== desiredBackend) {
      return false;
    }
  }

  const desiredCwd = normalizeText(params.spec.cwd) ?? normalizeText(params.config?.defaultCwd);
  if (desiredCwd !== undefined) {
    const currentCwd = (params.meta.runtimeOptions?.cwd ?? params.meta.cwd ?? "").trim();
    if (desiredCwd !== currentCwd) {
      return false;
    }
  }
  return true;
}

/** 创建或替换配置 binding 所需的 ACP session */
export async function ensureConfiguredAcpBindingSession(params: {
  manager: AcpSessionManagerLike;
  spec: ConfiguredAcpBindingSpec;
  config?: BindingLifecycleConfig;
}): Promise<BindingLifecycleResult> {
  const sessionKey = buildConfiguredAcpSessionKey(params.spec);

  try {
    const resolution = params.manager.resolveSession({ sessionKey });
    if (
      resolution.kind === "ready" &&
      sessionMatchesConfiguredBinding({
        spec: params.spec,
        meta: resolution.meta,
        config: params.config,
      })
    ) {
      return { ok: true, sessionKey };
    }

    // 创建新 session
    const meta: SessionAcpMeta = {
      sessionKey,
      agent: params.spec.acpAgentId ?? params.spec.agentId,
      mode: (params.spec.mode ?? "persistent") as AcpRuntimeSessionMode,
      backend: params.spec.backend ?? params.config?.defaultBackend,
      cwd: params.spec.cwd ?? params.config?.defaultCwd,
      runtimeOptions: {
        cwd: params.spec.cwd ?? params.config?.defaultCwd,
      },
      state: "ready",
    };

    return params.manager.upsertSession({ sessionKey, meta });
  } catch (err) {
    return {
      ok: false,
      sessionKey,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 批量处理配置的 bindings */
export async function ensureConfiguredAcpBindingSessions(params: {
  manager: AcpSessionManagerLike;
  specs: ConfiguredAcpBindingSpec[];
  config?: BindingLifecycleConfig;
}): Promise<{
  successful: number;
  failed: number;
  results: Array<{ spec: ConfiguredAcpBindingSpec; result: BindingLifecycleResult }>;
}> {
  const results: Array<{ spec: ConfiguredAcpBindingSpec; result: BindingLifecycleResult }> = [];
  let successful = 0;
  let failed = 0;

  for (const spec of params.specs) {
    const result = await ensureConfiguredAcpBindingSession({
      manager: params.manager,
      spec,
      config: params.config,
    });
    results.push({ spec, result });
    if (result.ok) {
      successful++;
    } else {
      failed++;
    }
  }

  return { successful, failed, results };
}

/** 检查并同步 binding 状态 - 如果不匹配则更新 */
export async function syncConfiguredAcpBindingSession(params: {
  manager: AcpSessionManagerLike;
  spec: ConfiguredAcpBindingSpec;
  config?: BindingLifecycleConfig;
}): Promise<BindingLifecycleResult> {
  return ensureConfiguredAcpBindingSession(params);
}

/** 移除配置 binding 的 session */
export function removeConfiguredAcpBindingSession(params: {
  manager: AcpSessionManagerLike;
  spec: ConfiguredAcpBindingSpec;
}): { sessionKey: string } {
  const sessionKey = buildConfiguredAcpSessionKey(params.spec);
  params.manager.removeSession({ sessionKey });
  return { sessionKey };
}
