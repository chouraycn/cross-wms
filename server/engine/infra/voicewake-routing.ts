// 持久化并解析语音唤醒路由规则。
// 移植自 openclaw/src/infra/voicewake-routing.ts（降级实现）。
//
// 降级说明：
//  - @openclaw/normalization-core/record-coerce 替换为 ./record-coerce.js 中的 isRecord
//  - @openclaw/normalization-core/string-coerce 替换为 ./string-coerce.js
//  - ../routing/session-key.js 未移植，classifySessionKeyShape/isValidAgentId/normalizeAgentId 内联降级实现
//  - ../state/openclaw-state-db.js 未移植，降级为文件 JSON 持久化
//  - ./kysely-sync.js 保留类型引用但运行时降级
//  - 状态持久化到 ${stateDir}/voicewake-routing.json
import path from "node:path";
import { isRecord } from "./record-coerce.js";
import { normalizeOptionalString } from "./string-coerce.js";
import { resolveStateDir, tryReadJsonFileSync, writeJsonFileSync } from "./_runtime-stubs.js";

// 语音唤醒路由将规范化的唤醒短语映射到 agent、session key 或当前 session 目标，
// 并将映射持久化在状态设置下。
type VoiceWakeRouteTarget =
  | { mode: "current"; agentId?: undefined; sessionKey?: undefined }
  | { agentId: string; sessionKey?: undefined; mode?: undefined }
  | { sessionKey: string; agentId?: undefined; mode?: undefined };

type VoiceWakeRouteRule = {
  trigger: string;
  target: VoiceWakeRouteTarget;
};

export type VoiceWakeRoutingConfig = {
  version: 1;
  defaultTarget: VoiceWakeRouteTarget;
  routes: VoiceWakeRouteRule[];
  updatedAtMs: number;
};

const MAX_VOICEWAKE_ROUTES = 32;
const MAX_VOICEWAKE_TRIGGER_LENGTH = 64;
const VOICEWAKE_ROUTING_CONFIG_KEY = "default";
const VOICEWAKE_ROUTING_STATE_FILENAME = "voicewake-routing.json";

const DEFAULT_ROUTING: VoiceWakeRoutingConfig = {
  version: 1,
  defaultTarget: { mode: "current" },
  routes: [],
  updatedAtMs: 0,
};

// ============================================================================
// 降级：../routing/session-key.js 内联实现
// ============================================================================

const AGENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]{0,63}$/;
const AGENT_SESSION_KEY_PATTERN = /^agent:[a-zA-Z0-9][a-zA-Z0-9-_]{0,63}:[a-zA-Z0-9][a-zA-Z0-9-_]{0,63}$/;

function classifySessionKeyShape(value: string): "agent" | "session" | "unknown" {
  const trimmed = value.trim();
  if (AGENT_SESSION_KEY_PATTERN.test(trimmed)) {
    return "agent";
  }
  if (trimmed.startsWith("agent:")) {
    return "agent";
  }
  return "unknown";
}

function isValidAgentId(value: string): boolean {
  return AGENT_ID_PATTERN.test(value.trim());
}

function normalizeAgentId(value: string): string {
  return value.trim();
}

// ============================================================================
// 文件 JSON 持久化（降级 openclaw-state-db）
// ============================================================================

type PersistedRoutingState = {
  configKey: string;
  version: number;
  defaultTarget: VoiceWakeRouteTarget;
  routes: VoiceWakeRouteRule[];
  updatedAtMs: number;
};

function resolveVoicewakeRoutingStatePath(stateDir?: string): string {
  const root = stateDir ?? resolveStateDir();
  return path.join(root, VOICEWAKE_ROUTING_STATE_FILENAME);
}

function loadRoutingFromState(stateDir?: string): PersistedRoutingState | null {
  const filePath = resolveVoicewakeRoutingStatePath(stateDir);
  return tryReadJsonFileSync<PersistedRoutingState>(filePath);
}

function saveRoutingToState(state: PersistedRoutingState, stateDir?: string): void {
  const filePath = resolveVoicewakeRoutingStatePath(stateDir);
  writeJsonFileSync(filePath, state, { trailingNewline: true });
}

// ============================================================================
// 移植实现
// ============================================================================

/** 规范化语音唤醒触发短语用于匹配和重复检查。 */
export function normalizeVoiceWakeTriggerWord(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ""))
    .filter(Boolean)
    .join(" ");
}

function normalizeRouteTarget(value: unknown): VoiceWakeRouteTarget | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as { mode?: unknown; agentId?: unknown; sessionKey?: unknown };
  const mode = normalizeOptionalString(rec.mode);
  if (mode === "current") {
    return { mode: "current" };
  }
  const agentId = normalizeOptionalString(rec.agentId);
  const sessionKey = normalizeOptionalString(rec.sessionKey);
  if (agentId && !sessionKey) {
    return { agentId: normalizeAgentId(agentId) };
  }
  if (sessionKey && !agentId) {
    return { sessionKey };
  }
  return null;
}

function normalizeRouteRule(value: unknown): VoiceWakeRouteRule | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const rec = value as { trigger?: unknown; target?: unknown };
  const triggerRaw = normalizeOptionalString(rec.trigger);
  if (!triggerRaw) {
    return null;
  }
  const trigger = normalizeVoiceWakeTriggerWord(triggerRaw);
  if (!trigger) {
    return null;
  }
  const target = normalizeRouteTarget(rec.target);
  if (!target) {
    return null;
  }
  return { trigger, target };
}

function isCanonicalAgentSessionKey(value: string): boolean {
  const trimmed = value.trim();
  if (classifySessionKeyShape(trimmed) !== "agent") {
    return false;
  }
  return !trimmed.split(":").some((part) => part.length === 0);
}

function validateRouteTargetInput(
  value: unknown,
  label: string,
): { ok: true } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: `${label} must be an object` };
  }
  const rec = value as { mode?: unknown; agentId?: unknown; sessionKey?: unknown };
  const mode = normalizeOptionalString(rec.mode);
  const agentId = normalizeOptionalString(rec.agentId);
  const sessionKey = normalizeOptionalString(rec.sessionKey);
  if (mode !== undefined) {
    if (mode !== "current") {
      return {
        ok: false,
        message: `${label}.mode must be "current" when provided`,
      };
    }
    if (agentId !== undefined || sessionKey !== undefined) {
      return {
        ok: false,
        message: `${label} cannot mix mode with agentId or sessionKey`,
      };
    }
    return { ok: true };
  }
  if (agentId !== undefined && sessionKey !== undefined) {
    return {
      ok: false,
      message: `${label} cannot include both agentId and sessionKey`,
    };
  }
  if (agentId !== undefined) {
    if (!isValidAgentId(agentId)) {
      return {
        ok: false,
        message: `${label}.agentId must be a valid agent id`,
      };
    }
    return { ok: true };
  }
  if (sessionKey !== undefined) {
    if (!isCanonicalAgentSessionKey(sessionKey)) {
      return {
        ok: false,
        message: `${label}.sessionKey must be a canonical agent session key`,
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    message: `${label} must include mode, agentId, or sessionKey`,
  };
}

/** 验证用户提供的语音唤醒路由配置。 */
export function validateVoiceWakeRoutingConfigInput(
  input: unknown,
): { ok: true } | { ok: false; message: string } {
  if (!isRecord(input)) {
    return { ok: false, message: "config must be an object" };
  }
  const rec = input as {
    defaultTarget?: unknown;
    routes?: unknown;
  };
  if (rec.defaultTarget !== undefined) {
    const validatedDefaultTarget = validateRouteTargetInput(
      rec.defaultTarget,
      "config.defaultTarget",
    );
    if (!validatedDefaultTarget.ok) {
      return validatedDefaultTarget;
    }
  }
  if (rec.routes !== undefined && !Array.isArray(rec.routes)) {
    return { ok: false, message: "config.routes must be an array" };
  }
  if (Array.isArray(rec.routes)) {
    if (rec.routes.length > MAX_VOICEWAKE_ROUTES) {
      return {
        ok: false,
        message: `config.routes must contain at most ${MAX_VOICEWAKE_ROUTES} entries`,
      };
    }
    const normalizedTriggers = new Map<string, number>();
    for (const [index, route] of rec.routes.entries()) {
      if (!isRecord(route)) {
        return { ok: false, message: `config.routes[${index}] must be an object` };
      }
      const trigger = normalizeOptionalString(route.trigger);
      const normalizedTrigger = trigger ? normalizeVoiceWakeTriggerWord(trigger) : "";
      if (!trigger || !normalizedTrigger) {
        return {
          ok: false,
          message: `config.routes[${index}].trigger must be a non-empty string`,
        };
      }
      if (trigger.length > MAX_VOICEWAKE_TRIGGER_LENGTH) {
        return {
          ok: false,
          message: `config.routes[${index}].trigger must be at most ${MAX_VOICEWAKE_TRIGGER_LENGTH} characters`,
        };
      }
      const duplicateIndex = normalizedTriggers.get(normalizedTrigger);
      if (duplicateIndex !== undefined) {
        return {
          ok: false,
          message: `config.routes[${index}].trigger duplicates config.routes[${duplicateIndex}].trigger after normalization`,
        };
      }
      normalizedTriggers.set(normalizedTrigger, index);
      const validatedTarget = validateRouteTargetInput(
        route.target,
        `config.routes[${index}].target`,
      );
      if (!validatedTarget.ok) {
        return validatedTarget;
      }
    }
  }
  return { ok: true };
}

/** 规范化持久化或用户提供的语音唤醒路由配置。 */
export function normalizeVoiceWakeRoutingConfig(input: unknown): VoiceWakeRoutingConfig {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_ROUTING };
  }
  const rec = input as {
    version?: unknown;
    defaultTarget?: unknown;
    routes?: unknown;
    updatedAtMs?: unknown;
  };
  const defaultTarget = normalizeRouteTarget(rec.defaultTarget) ?? { mode: "current" as const };
  const routes = Array.isArray(rec.routes)
    ? rec.routes
        .map((entry) => normalizeRouteRule(entry))
        .filter((entry): entry is VoiceWakeRouteRule => Boolean(entry))
    : [];
  const updatedAtMs =
    typeof rec.updatedAtMs === "number" && Number.isFinite(rec.updatedAtMs) && rec.updatedAtMs > 0
      ? Math.floor(rec.updatedAtMs)
      : 0;
  return {
    version: 1,
    defaultTarget,
    routes,
    updatedAtMs,
  };
}

/** 从状态加载持久化的语音唤醒路由配置。 */
export async function loadVoiceWakeRoutingConfig(
  baseDir?: string,
): Promise<VoiceWakeRoutingConfig> {
  const persisted = loadRoutingFromState(baseDir);
  if (!persisted) {
    return { ...DEFAULT_ROUTING };
  }
  return normalizeVoiceWakeRoutingConfig(persisted);
}

/** 持久化规范化的语音唤醒路由配置。 */
export async function setVoiceWakeRoutingConfig(
  config: unknown,
  baseDir?: string,
): Promise<VoiceWakeRoutingConfig> {
  const normalized = normalizeVoiceWakeRoutingConfig(config);
  const updatedAtMs = Date.now();
  const next: VoiceWakeRoutingConfig = {
    ...normalized,
    updatedAtMs,
  };
  const persisted: PersistedRoutingState = {
    configKey: VOICEWAKE_ROUTING_CONFIG_KEY,
    version: 1,
    defaultTarget: next.defaultTarget,
    routes: next.routes,
    updatedAtMs,
  };
  saveRoutingToState(persisted, baseDir);
  return next;
}

type VoiceWakeResolvedRoute = { mode: "current" } | { agentId: string } | { sessionKey: string };

function resolveVoiceWakeRouteTarget(
  routeTarget: VoiceWakeRouteTarget | undefined,
): VoiceWakeResolvedRoute {
  if (!routeTarget || ("mode" in routeTarget && routeTarget.mode === "current")) {
    return { mode: "current" };
  }
  if ("agentId" in routeTarget && routeTarget.agentId) {
    return { agentId: routeTarget.agentId };
  }
  if ("sessionKey" in routeTarget && routeTarget.sessionKey) {
    return { sessionKey: routeTarget.sessionKey };
  }
  return { mode: "current" };
}

/** 解析规范化唤醒触发器的路由目标。 */
export function resolveVoiceWakeRouteByTrigger(params: {
  trigger: string | undefined;
  config: VoiceWakeRoutingConfig;
}): VoiceWakeResolvedRoute {
  const normalizedTrigger = normalizeOptionalString(params.trigger)
    ? normalizeVoiceWakeTriggerWord(params.trigger as string)
    : "";
  if (normalizedTrigger) {
    const matched = params.config.routes.find((route) => route.trigger === normalizedTrigger);
    if (matched) {
      return resolveVoiceWakeRouteTarget(matched.target);
    }
  }
  return resolveVoiceWakeRouteTarget(params.config.defaultTarget);
}
