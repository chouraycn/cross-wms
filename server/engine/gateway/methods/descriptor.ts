// Gateway method descriptor 类型定义了 core、plugin、channel 与 aux 方法共享的可复用契约。
// 移植自 openclaw/src/gateway/methods/descriptor.ts（纯类型与常量）。
// 依赖调整：../operator-scopes.js（已移植）。
import type { OperatorScope } from "../operator-scopes.js";

/** 仅限已认证 node 客户端调用的方法的 scope 标记。 */
export const NODE_GATEWAY_METHOD_SCOPE = "node" as const;
/** 由 handler 在运行时推导所需 operator scope 的方法的 scope 标记。 */
export const DYNAMIC_GATEWAY_METHOD_SCOPE = "dynamic" as const;

/** 附加到 gateway method descriptor 的鉴权 scope。 */
export type GatewayMethodScope =
  | OperatorScope
  | typeof NODE_GATEWAY_METHOD_SCOPE
  | typeof DYNAMIC_GATEWAY_METHOD_SCOPE;

/** 用于区分 core、plugin、channel 与 aux 方法的 owner 元数据。 */
export type GatewayMethodOwner =
  | { kind: "core"; area: string }
  | { kind: "plugin"; pluginId: string }
  | { kind: "channel"; channelId: string }
  | { kind: "aux"; area: string };

/** 暴露给客户端作为可重试 startup-unavailable 错误的启动可用性标志。 */
export type GatewayMethodStartupAvailability = "available" | "unavailable-until-sidecars";

export type GatewayMethodHandler = (opts: never) => unknown;

/** 一个可分发的 gateway 方法的完整元数据。 */
export type GatewayMethodDescriptor = {
  name: string;
  handler: GatewayMethodHandler;
  scope: GatewayMethodScope;
  owner: GatewayMethodOwner;
  startup?: GatewayMethodStartupAvailability;
  controlPlaneWrite?: boolean;
  advertise?: boolean;
  description?: string;
};

/** registry 规范化修剪并校验方法名之前的输入 descriptor 形状。 */
export type GatewayMethodDescriptorInput = Omit<GatewayMethodDescriptor, "name"> & {
  name: string;
};

/** 供请求分发与方法列表使用的只读 method registry 视图。 */
export type GatewayMethodRegistryView = {
  getHandler: (name: string) => GatewayMethodHandler | undefined;
  listMethods: () => string[];
  listAdvertisedMethods: () => string[];
  getScope: (name: string) => GatewayMethodScope | undefined;
  isStartupUnavailable: (name: string) => boolean;
  isControlPlaneWrite: (name: string) => boolean;
  descriptors: () => readonly GatewayMethodDescriptor[];
};
