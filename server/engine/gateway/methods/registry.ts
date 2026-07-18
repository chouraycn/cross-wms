// Gateway method registry normalizes method descriptors, enforces unique names,
// and exposes dispatch policy metadata.
//
// 移植自 openclaw/src/gateway/methods/registry.ts。
//
// 降级策略：
//  - 原文件依赖 `../../plugins/registry-types.js` 的 `PluginRegistry` 类型。
//    cross-wms 尚未移植完整 plugin registry 类型层级，这里在文件内联定义
//    `PluginRegistryGatewayMethodView` 最小类型占位，仅包含本模块用到的
//    `gatewayHandlers` 与 `gatewayMethodDescriptors` 字段。
//  - 原文件依赖 `../../shared/gateway-method-policy.js` 的
//    `normalizePluginGatewayMethodScope`。该模块未移植，这里内联实现完整逻辑
//    （保留命名空间方法策略的强制 admin scope 行为，避免安全降级）。
//    保留命名空间前缀与 openclaw 保持一致，使 plugin-owned 方法无法削弱
//    受保护的核心方法名 scope。

import { ADMIN_SCOPE, type OperatorScope } from "../operator-scopes.js";
import {
  createCoreGatewayMethodDescriptors,
  isCoreGatewayMethodClassified,
} from "./core-descriptors.js";
import {
  DYNAMIC_GATEWAY_METHOD_SCOPE,
  type GatewayMethodDescriptor,
  type GatewayMethodDescriptorInput,
  type GatewayMethodHandler,
  type GatewayMethodOwner,
  type GatewayMethodRegistryView,
  NODE_GATEWAY_METHOD_SCOPE,
} from "./descriptor.js";

export type GatewayMethodRegistry = GatewayMethodRegistryView;
export { createCoreGatewayMethodDescriptors, isCoreGatewayMethodClassified };

// ============================================================================
// 内联降级：../../shared/gateway-method-policy.js —— 保留命名空间方法策略
// ============================================================================

/**
 * 保留给 operator admin 调用的 gateway method 命名空间前缀。
 * 与 openclaw shared/gateway-method-policy 保持一致。
 */
const RESERVED_ADMIN_GATEWAY_METHOD_PREFIXES = [
  "exec.approvals.",
  "config.",
  "wizard.",
  "update.",
] as const;

const RESERVED_ADMIN_GATEWAY_METHOD_SCOPE = ADMIN_SCOPE;

/** 判断 gateway method 是否保留给 operator admin 调用。 */
function isReservedAdminGatewayMethod(method: string): boolean {
  return RESERVED_ADMIN_GATEWAY_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix));
}

/** 解析保留 gateway method 的强制 scope。 */
function resolveReservedGatewayMethodScope(
  method: string,
): typeof RESERVED_ADMIN_GATEWAY_METHOD_SCOPE | undefined {
  if (!isReservedAdminGatewayMethod(method)) {
    return undefined;
  }
  return RESERVED_ADMIN_GATEWAY_METHOD_SCOPE;
}

/**
 * 强制将 plugin 声明的 scope 远离不安全的保留 gateway method scope。
 *
 * 降级说明：原 openclaw 实现位于 shared/gateway-method-policy.js，这里内联
 * 完整逻辑以保留安全行为（避免 plugin 削弱保留方法的 admin scope）。
 */
function normalizePluginGatewayMethodScope<TScope extends string>(
  method: string,
  scope: TScope | undefined,
): {
  scope: TScope | typeof RESERVED_ADMIN_GATEWAY_METHOD_SCOPE | undefined;
  coercedToReservedAdmin: boolean;
} {
  const reservedScope = resolveReservedGatewayMethodScope(method);
  if (!reservedScope || !scope || scope === reservedScope) {
    return {
      scope,
      coercedToReservedAdmin: false,
    };
  }
  return {
    scope: reservedScope,
    coercedToReservedAdmin: true,
  };
}

// ============================================================================
// 内联降级：../../plugins/registry-types.js —— PluginRegistry 最小视图
// ============================================================================

/**
 * PluginRegistry 中 gateway method 相关字段的最小类型占位。
 *
 * 降级原因：cross-wms 尚未移植完整 plugin registry 类型层级
 * （../../plugins/registry-types.js）。这里仅定义本模块用到的字段。
 * `gatewayHandlers` 与 `gatewayMethodDescriptors` 的形状与 openclaw 保持一致。
 */
type PluginRegistryGatewayMethodView = {
  gatewayHandlers: Record<string, GatewayMethodHandler>;
  gatewayMethodDescriptors?: readonly GatewayMethodDescriptorInput[];
};

// ============================================================================
// Registry 实现
// ============================================================================

function normalizeMethodName(name: string): string {
  return name.trim();
}

function normalizeDescriptor(input: GatewayMethodDescriptorInput): GatewayMethodDescriptor {
  const name = normalizeMethodName(input.name);
  if (!name) {
    throw new Error("gateway method descriptor name must not be empty");
  }
  // Plugin-owned methods pass through the plugin namespace policy so plugins cannot weaken
  // protected core-looking method names by declaring a permissive scope.
  const normalizedScope =
    input.scope === NODE_GATEWAY_METHOD_SCOPE || input.scope === DYNAMIC_GATEWAY_METHOD_SCOPE
      ? input.scope
      : input.owner.kind === "plugin"
        ? normalizePluginGatewayMethodScope(name, input.scope).scope
        : input.scope;
  if (!normalizedScope) {
    throw new Error(`gateway method descriptor is missing a scope: ${name}`);
  }
  return {
    ...input,
    name,
    scope: normalizedScope,
    ...(input.startup === "unavailable-until-sidecars"
      ? { startup: "unavailable-until-sidecars" }
      : {}),
    ...(input.controlPlaneWrite === true ? { controlPlaneWrite: true } : {}),
    ...(input.advertise === false ? { advertise: false } : {}),
  };
}

/** Creates a read-only registry for gateway method lookup, listing, and policy metadata. */
export function createGatewayMethodRegistry(
  inputs: readonly GatewayMethodDescriptorInput[],
): GatewayMethodRegistry {
  const descriptors = inputs.map(normalizeDescriptor);
  const byName = new Map<string, GatewayMethodDescriptor>();
  for (const descriptor of descriptors) {
    // Duplicate method names would make authorization and handler dispatch disagree about the
    // owner/scope, so reject them before exposing any registry view.
    if (byName.has(descriptor.name)) {
      throw new Error(`gateway method already registered: ${descriptor.name}`);
    }
    byName.set(descriptor.name, descriptor);
  }
  return {
    getHandler: (name) => byName.get(name)?.handler,
    listMethods: () => descriptors.map((descriptor) => descriptor.name),
    listAdvertisedMethods: () =>
      descriptors
        .filter((descriptor) => descriptor.advertise !== false)
        .map((descriptor) => descriptor.name),
    getScope: (name) => byName.get(name)?.scope,
    isStartupUnavailable: (name) => byName.get(name)?.startup === "unavailable-until-sidecars",
    isControlPlaneWrite: (name) => byName.get(name)?.controlPlaneWrite === true,
    descriptors: () => descriptors,
  };
}

/** Converts a plain handler map into scoped descriptors owned by one gateway surface. */
export function createGatewayMethodDescriptorsFromHandlers(params: {
  handlers: Record<string, GatewayMethodHandler>;
  owner: GatewayMethodOwner;
  defaultScope?: OperatorScope;
  scopes?: Partial<Record<string, OperatorScope>>;
}): GatewayMethodDescriptorInput[] {
  return Object.entries(params.handlers).map(([name, handler]) => {
    const scope = params.scopes?.[name] ?? params.defaultScope;
    if (!scope) {
      throw new Error(`gateway method is missing a scope: ${name}`);
    }
    const descriptor: GatewayMethodDescriptorInput = {
      name,
      handler,
      owner: params.owner,
      scope,
    };
    return descriptor;
  });
}

/** Creates a plugin-owned method descriptor with plugin namespace scope normalization. */
export function createPluginGatewayMethodDescriptor(params: {
  pluginId: string;
  name: string;
  handler: GatewayMethodHandler;
  scope?: OperatorScope;
}): GatewayMethodDescriptorInput {
  const normalizedScope = normalizePluginGatewayMethodScope(params.name, params.scope).scope;
  return {
    name: params.name,
    handler: params.handler,
    owner: { kind: "plugin", pluginId: params.pluginId },
    scope: normalizedScope ?? ADMIN_SCOPE,
  };
}

/** Resolves plugin method descriptors, including the legacy handler-only registry shape. */
export function createPluginGatewayMethodDescriptors(
  registry: Pick<PluginRegistryGatewayMethodView, "gatewayHandlers"> &
    Partial<Pick<PluginRegistryGatewayMethodView, "gatewayMethodDescriptors">>,
): GatewayMethodDescriptorInput[] {
  const descriptors = registry.gatewayMethodDescriptors ?? [];
  if (descriptors.length > 0) {
    return [...descriptors];
  }
  // Older plugin registries only carried handlers, so keep them callable but assign admin scope
  // until the plugin can provide explicit descriptor metadata.
  return createGatewayMethodDescriptorsFromHandlers({
    handlers: registry.gatewayHandlers,
    owner: { kind: "plugin", pluginId: "unknown" },
    defaultScope: ADMIN_SCOPE,
  });
}
