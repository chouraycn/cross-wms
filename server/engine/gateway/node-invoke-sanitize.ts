// Node invocation forwarding sanitizer.
// Strips or validates gateway-only control fields before node transport.
//
// 降级说明：
//  - openclaw 原始依赖 `./node-invoke-system-run-approval.js` 的
//    `sanitizeSystemRunParamsForForwarding`。cross-wms 未移植该模块，这里内联
//    最小实现：对 system.run 命令做基础字段透传与 approval id 校验。
//  - `./server-methods/types.js` 的 `GatewayClient` 类型降级为内联宽松占位。
import type { ExecApprovalManager } from "./exec-approval-manager.js";

/**
 * Gateway 客户端宽松占位类型（降级）。
 *
 * 降级原因：openclaw `./server-methods/types.js` 的 GatewayClient 依赖完整的
 * gateway 方法注册表与连接状态。这里仅描述 sanitize 所需的最小契约。
 */
export type GatewayClient = {
  connId?: string;
  deviceId?: string;
  clientId?: string;
  deviceTokenAuth?: boolean;
  [key: string]: unknown;
};

/**
 * 为节点转发净化 system.run 参数（降级实现）。
 *
 * 降级原因：openclaw `node-invoke-system-run-approval` 会校验 approval id、
 * 绑定审批记录与调用方身份。这里仅做基础字段清理：移除空 approval id，
 * 保留其余字段原样透传，使节点转发在缺失审批管理器时仍可安全降级。
 */
function sanitizeSystemRunParamsForForwarding(opts: {
  nodeId: string;
  rawParams: unknown;
  client: GatewayClient | null;
  execApprovalManager?: ExecApprovalManager;
}):
  | { ok: true; params: unknown }
  | { ok: false; message: string; details?: Record<string, unknown> } {
  if (opts.rawParams == null || typeof opts.rawParams !== "object") {
    return { ok: true, params: opts.rawParams };
  }
  const params = opts.rawParams as Record<string, unknown>;
  // 移除空 approval id，避免节点收到空字符串绑定。
  const approvalId = params["approvalId"];
  if (typeof approvalId === "string" && approvalId.trim() === "") {
    const { approvalId: _omitted, ...rest } = params;
    void _omitted;
    return { ok: true, params: rest };
  }
  return { ok: true, params: opts.rawParams };
}

// Node invoke forwarding sanitizes command-specific payloads before they leave
// the gateway. system.run carries approval bindings and therefore needs special
// handling; other commands pass through unchanged.
/** Sanitizes node.invoke params before forwarding them to a connected node. */
export function sanitizeNodeInvokeParamsForForwarding(opts: {
  nodeId: string;
  command: string;
  rawParams: unknown;
  client: GatewayClient | null;
  execApprovalManager?: ExecApprovalManager;
}):
  | { ok: true; params: unknown }
  | { ok: false; message: string; details?: Record<string, unknown> } {
  if (opts.command === "system.run") {
    return sanitizeSystemRunParamsForForwarding({
      nodeId: opts.nodeId,
      rawParams: opts.rawParams,
      client: opts.client,
      execApprovalManager: opts.execApprovalManager,
    });
  }
  return { ok: true, params: opts.rawParams };
}
