// Test fixture helpers for CLI node-list command coverage.
// 移植自 openclaw/src/cli/program.nodes-test-helpers.ts。
//
// 降级策略：
//  - 原模块为纯测试固件，无外部依赖，直接完整移植。

/** Canonical connected iOS node fixture used by CLI node tests. */
export const IOS_NODE = {
  nodeId: "ios-node",
  displayName: "iOS Node",
  remoteIp: "192.168.0.88",
  connected: true,
} as const;

/** Build a stable one-node response payload with an overridable timestamp. */
export function createIosNodeListResponse(ts: number = Date.now()) {
  return {
    ts,
    nodes: [IOS_NODE],
  };
}
