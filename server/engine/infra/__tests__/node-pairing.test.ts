import { describe, it, expect, beforeEach, vi } from "vitest";

// 使用 vi.hoisted 创建内存存储，确保在 vi.mock 工厂执行前完成初始化
const memoryStore = vi.hoisted(() => new Map<string, any>());

// 部分模拟 pairing-files.js：保留真实的 resolvePairingPaths、createAsyncLock 等纯函数，
// 仅替换 readJsonIfExists 和 writeJson 为内存 I/O 实现
vi.mock("../pairing-files.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../pairing-files.js")>();
  return {
    ...actual,
    readJsonIfExists: async (filePath: string): Promise<any> => {
      const value = memoryStore.get(filePath);
      return value === undefined ? null : JSON.parse(JSON.stringify(value));
    },
    writeJson: async (filePath: string, value: any): Promise<void> => {
      memoryStore.set(filePath, JSON.parse(JSON.stringify(value)));
    },
  };
});

import {
  listNodePairing,
  beginNodePairingConnect,
  releaseNodePairingCleanupClaim,
  finalizeNodePairingCleanupClaim,
  requestNodePairing,
  reusePendingNodePairingForReconnect,
  approveNodePairing,
  rejectNodePairing,
  removePairedNode,
  verifyNodeToken,
  updatePairedNodeMetadata,
  renamePairedNode,
} from "../node-pairing.js";
import { resolvePairingPaths } from "../pairing-files.js";

const BASE_DIR = "/test/pairing-base";
const PATHS = resolvePairingPaths(BASE_DIR, "nodes");
const pendingPath = PATHS.pendingPath;
const pairedPath = PATHS.pairedPath;

function setPending(pendingById: Record<string, any>): void {
  memoryStore.set(pendingPath, JSON.parse(JSON.stringify(pendingById)));
}

function setPaired(pairedByNodeId: Record<string, any>): void {
  memoryStore.set(pairedPath, JSON.parse(JSON.stringify(pairedByNodeId)));
}

function getPending(): Record<string, any> {
  const value = memoryStore.get(pendingPath);
  return (value as Record<string, any>) ?? {};
}

function getPaired(): Record<string, any> {
  const value = memoryStore.get(pairedPath);
  return (value as Record<string, any>) ?? {};
}

describe("node-pairing 模块单元测试", () => {
  beforeEach(() => {
    memoryStore.clear();
  });

  // ===========================================================================
  // listNodePairing
  // ===========================================================================
  describe("listNodePairing", () => {
    it("空状态时应该返回空的 pending 和 paired 列表", async () => {
      const result = await listNodePairing(BASE_DIR);
      expect(result.pending).toEqual([]);
      expect(result.paired).toEqual([]);
    });

    it("应该返回按 ts 降序排列的 pending 列表", async () => {
      const now = Date.now();
      setPending({
        "req-1": { requestId: "req-1", nodeId: "node-1", ts: now - 1000 },
        "req-2": { requestId: "req-2", nodeId: "node-2", ts: now },
      });
      const result = await listNodePairing(BASE_DIR);
      expect(result.pending).toHaveLength(2);
      expect(result.pending[0].requestId).toBe("req-2");
      expect(result.pending[1].requestId).toBe("req-1");
    });

    it("应该返回按 approvedAtMs 降序排列的 paired 列表", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now - 1000,
        },
        "node-2": {
          nodeId: "node-2",
          token: "t2",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await listNodePairing(BASE_DIR);
      expect(result.paired).toHaveLength(2);
      expect(result.paired[0].nodeId).toBe("node-2");
      expect(result.paired[1].nodeId).toBe("node-1");
    });

    it("应该剔除超过 TTL 的过期 pending 请求", async () => {
      const now = Date.now();
      setPending({
        "req-fresh": { requestId: "req-fresh", nodeId: "node-1", ts: now },
        "req-expired": {
          requestId: "req-expired",
          nodeId: "node-2",
          ts: now - 10 * 60 * 1000,
        },
      });
      const result = await listNodePairing(BASE_DIR);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].requestId).toBe("req-fresh");
    });

    it("pending 条目应该包含 requiredApproveScopes 字段", async () => {
      const now = Date.now();
      setPending({
        "req-1": {
          requestId: "req-1",
          nodeId: "node-1",
          ts: now,
          commands: ["system.run"],
        },
      });
      const result = await listNodePairing(BASE_DIR);
      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].requiredApproveScopes).toEqual(
        expect.arrayContaining(["operator.pairing", "operator.admin"]),
      );
    });
  });

  // ===========================================================================
  // beginNodePairingConnect
  // ===========================================================================
  describe("beginNodePairingConnect", () => {
    it("未配对节点时应该返回 null pairedNode 且无 cleanupClaim", async () => {
      const result = await beginNodePairingConnect("node-1", BASE_DIR);
      expect(result.pairedNode).toBeNull();
      expect(result.cleanupClaim).toBeUndefined();
    });

    it("已配对但无 pending 时应该返回 pairedNode 但无 cleanupClaim", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await beginNodePairingConnect("node-1", BASE_DIR);
      expect(result.pairedNode).not.toBeNull();
      expect(result.pairedNode!.nodeId).toBe("node-1");
      expect(result.cleanupClaim).toBeUndefined();
    });

    it("已配对且有 pending 时应该返回 pairedNode 和 cleanupClaim", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-1": {
          requestId: "req-1",
          nodeId: "node-1",
          ts: now,
          revision: "rev-1",
        },
      });
      const result = await beginNodePairingConnect("node-1", BASE_DIR);
      expect(result.pairedNode).not.toBeNull();
      expect(result.cleanupClaim).toBeDefined();
      expect(result.cleanupClaim!.nodeId).toBe("node-1");
      expect(result.cleanupClaim!.observed).toHaveLength(1);
      expect(result.cleanupClaim!.observed[0].requestId).toBe("req-1");
      await releaseNodePairingCleanupClaim(result.cleanupClaim!);
    });

    it("应该对 nodeId 执行 trim 规范化", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-1": {
          requestId: "req-1",
          nodeId: "node-1",
          ts: now,
          revision: "rev-1",
        },
      });
      const result = await beginNodePairingConnect("  node-1  ", BASE_DIR);
      expect(result.pairedNode).not.toBeNull();
      expect(result.pairedNode!.nodeId).toBe("node-1");
      expect(result.cleanupClaim).toBeDefined();
      await releaseNodePairingCleanupClaim(result.cleanupClaim!);
    });
  });

  // ===========================================================================
  // requestNodePairing
  // ===========================================================================
  describe("requestNodePairing", () => {
    it("应该创建新的 pending 配对请求", async () => {
      const result = await requestNodePairing({ nodeId: "node-1" }, BASE_DIR);
      expect(result.status).toBe("pending");
      expect(result.created).toBe(true);
      expect(result.request.nodeId).toBe("node-1");
      expect(result.request.requestId).toBeTruthy();
      expect(result.request.ts).toBeTruthy();
      const state = getPending();
      expect(state[result.request.requestId]).toBeDefined();
    });

    it("空 nodeId 应该抛出错误", async () => {
      await expect(requestNodePairing({ nodeId: "" }, BASE_DIR)).rejects.toThrow(
        "nodeId required",
      );
    });

    it("仅含空白的 nodeId 应该抛出错误", async () => {
      await expect(
        requestNodePairing({ nodeId: "   " }, BASE_DIR),
      ).rejects.toThrow("nodeId required");
    });

    it("应该对 nodeId 执行 trim 规范化", async () => {
      const result = await requestNodePairing({ nodeId: "  node-1  " }, BASE_DIR);
      expect(result.request.nodeId).toBe("node-1");
    });

    it("相同审批表面的 pending 请求应该被刷新而非重建", async () => {
      const first = await requestNodePairing(
        { nodeId: "node-1", caps: ["cap-a"] },
        BASE_DIR,
      );
      const second = await requestNodePairing(
        { nodeId: "node-1", caps: ["cap-a"] },
        BASE_DIR,
      );
      expect(second.created).toBe(false);
      expect(second.request.requestId).toBe(first.request.requestId);
      const state = getPending();
      expect(Object.keys(state)).toHaveLength(1);
    });

    it("不同审批表面应该替换原有 pending 请求并返回 superseded", async () => {
      const first = await requestNodePairing(
        { nodeId: "node-1", caps: ["cap-a"] },
        BASE_DIR,
      );
      const second = await requestNodePairing(
        { nodeId: "node-1", caps: ["cap-b"] },
        BASE_DIR,
      );
      expect(second.created).toBe(true);
      expect(second.request.requestId).not.toBe(first.request.requestId);
      expect(second.superseded).toBeDefined();
      expect(second.superseded).toContainEqual({
        requestId: first.request.requestId,
        nodeId: "node-1",
      });
    });

    it("应该规范化 caps 和 commands 字段", async () => {
      const result = await requestNodePairing(
        { nodeId: "node-1", caps: ["  cap-a  ", "", "cap-b"], commands: ["cmd-1"] },
        BASE_DIR,
      );
      expect(result.request.caps).toEqual(["cap-a", "cap-b"]);
      expect(result.request.commands).toEqual(["cmd-1"]);
    });
  });

  // ===========================================================================
  // approveNodePairing
  // ===========================================================================
  describe("approveNodePairing", () => {
    it("应该成功批准 pending 请求并生成配对节点", async () => {
      const reqResult = await requestNodePairing(
        { nodeId: "node-1", commands: ["cmd-a"] },
        BASE_DIR,
      );
      const result = await approveNodePairing(
        reqResult.request.requestId,
        { callerScopes: ["operator.pairing", "operator.write"] },
        BASE_DIR,
      );
      expect(result).not.toBeNull();
      expect(result!.requestId).toBe(reqResult.request.requestId);
      expect(result!.node.nodeId).toBe("node-1");
      expect(result!.node.token).toBeTruthy();
      expect(result!.node.createdAtMs).toBeTruthy();
      expect(result!.node.approvedAtMs).toBeTruthy();
      const pendingState = getPending();
      expect(pendingState[reqResult.request.requestId]).toBeUndefined();
      const pairedState = getPaired();
      expect(pairedState["node-1"]).toBeDefined();
    });

    it("不存在的 requestId 批准时应该返回 null", async () => {
      const result = await approveNodePairing(
        "nonexistent",
        { callerScopes: [] },
        BASE_DIR,
      );
      expect(result).toBeNull();
    });

    it("缺少所需 scope 时应该返回 forbidden 状态", async () => {
      const reqResult = await requestNodePairing(
        { nodeId: "node-1", commands: ["cmd-a"] },
        BASE_DIR,
      );
      const result = await approveNodePairing(
        reqResult.request.requestId,
        { callerScopes: ["operator.pairing"] },
        BASE_DIR,
      );
      expect(result).toEqual({ status: "forbidden", missingScope: "operator.write" });
      // pending 请求应该仍然存在
      const pendingState = getPending();
      expect(pendingState[reqResult.request.requestId]).toBeDefined();
    });

    it("operator.admin scope 应该满足所有审批需求", async () => {
      const reqResult = await requestNodePairing(
        { nodeId: "node-1", commands: ["system.run"] },
        BASE_DIR,
      );
      const result = await approveNodePairing(
        reqResult.request.requestId,
        { callerScopes: ["operator.admin"] },
        BASE_DIR,
      );
      expect(result).not.toBeNull();
      expect(result!.node.nodeId).toBe("node-1");
    });

    it("批准已配对节点时应该保留原始 createdAtMs 但更新 token", async () => {
      const now = Date.now();
      const originalCreatedAt = now - 50000;
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "old-token",
          createdAtMs: originalCreatedAt,
          approvedAtMs: originalCreatedAt,
        },
      });
      setPending({
        "req-1": { requestId: "req-1", nodeId: "node-1", ts: now },
      });
      const result = await approveNodePairing(
        "req-1",
        { callerScopes: ["operator.pairing"] },
        BASE_DIR,
      );
      expect(result!.node.createdAtMs).toBe(originalCreatedAt);
      expect(result!.node.approvedAtMs).toBeGreaterThanOrEqual(now);
      expect(result!.node.token).not.toBe("old-token");
    });

    it("存在活跃 cleanupClaim 时批准应该返回 null", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-claim": {
          requestId: "req-claim",
          nodeId: "node-1",
          ts: now,
          revision: "rev-claim-1",
          commands: [],
        },
      });
      const { cleanupClaim } = await beginNodePairingConnect("node-1", BASE_DIR);
      expect(cleanupClaim).toBeDefined();
      const result = await approveNodePairing(
        "req-claim",
        { callerScopes: ["operator.pairing"] },
        BASE_DIR,
      );
      expect(result).toBeNull();
      await releaseNodePairingCleanupClaim(cleanupClaim!);
    });
  });

  // ===========================================================================
  // rejectNodePairing
  // ===========================================================================
  describe("rejectNodePairing", () => {
    it("应该成功拒绝 pending 请求并返回 nodeId", async () => {
      const reqResult = await requestNodePairing({ nodeId: "node-1" }, BASE_DIR);
      const result = await rejectNodePairing(reqResult.request.requestId, BASE_DIR);
      expect(result).toEqual({
        requestId: reqResult.request.requestId,
        nodeId: "node-1",
      });
      const pendingState = getPending();
      expect(pendingState[reqResult.request.requestId]).toBeUndefined();
    });

    it("拒绝不存在的 requestId 应该返回 null", async () => {
      const result = await rejectNodePairing("nonexistent", BASE_DIR);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // removePairedNode
  // ===========================================================================
  describe("removePairedNode", () => {
    it("应该成功移除已配对节点", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await removePairedNode("node-1", BASE_DIR);
      expect(result).toEqual({ nodeId: "node-1" });
      const pairedState = getPaired();
      expect(pairedState["node-1"]).toBeUndefined();
    });

    it("移除不存在的节点应该返回 null", async () => {
      const result = await removePairedNode("nonexistent", BASE_DIR);
      expect(result).toBeNull();
    });

    it("空 nodeId 移除应该返回 null", async () => {
      const result = await removePairedNode("   ", BASE_DIR);
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // verifyNodeToken
  // ===========================================================================
  describe("verifyNodeToken", () => {
    it("正确 token 验证应该返回 ok 和节点信息", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "valid-token",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await verifyNodeToken("node-1", "valid-token", BASE_DIR);
      expect(result.ok).toBe(true);
      expect(result.node).toBeDefined();
      expect(result.node!.nodeId).toBe("node-1");
    });

    it("错误 token 验证应该返回 ok: false", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "valid-token",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await verifyNodeToken("node-1", "wrong-token", BASE_DIR);
      expect(result.ok).toBe(false);
      expect(result.node).toBeUndefined();
    });

    it("不存在的节点 token 验证应该返回 ok: false", async () => {
      const result = await verifyNodeToken("nonexistent", "any-token", BASE_DIR);
      expect(result.ok).toBe(false);
      expect(result.node).toBeUndefined();
    });

    it("空 token 验证应该返回 ok: false", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "valid-token",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await verifyNodeToken("node-1", "   ", BASE_DIR);
      expect(result.ok).toBe(false);
      expect(result.node).toBeUndefined();
    });
  });

  // ===========================================================================
  // updatePairedNodeMetadata
  // ===========================================================================
  describe("updatePairedNodeMetadata", () => {
    it("应该成功更新已配对节点的元数据", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
          displayName: "old",
        },
      });
      const result = await updatePairedNodeMetadata(
        "node-1",
        { displayName: "new", lastSeenAtMs: now },
        BASE_DIR,
      );
      expect(result).toBe(true);
      const node = getPaired()["node-1"];
      expect(node.displayName).toBe("new");
      expect(node.lastSeenAtMs).toBe(now);
      // token 和时间戳应该被保留
      expect(node.token).toBe("t1");
      expect(node.createdAtMs).toBe(now);
      expect(node.approvedAtMs).toBe(now);
    });

    it("更新不存在的节点元数据应该返回 false", async () => {
      const result = await updatePairedNodeMetadata(
        "nonexistent",
        { displayName: "new" },
        BASE_DIR,
      );
      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // renamePairedNode
  // ===========================================================================
  describe("renamePairedNode", () => {
    it("应该成功重命名已配对节点", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
          displayName: "old",
        },
      });
      const result = await renamePairedNode("node-1", "new-name", BASE_DIR);
      expect(result).not.toBeNull();
      expect(result!.displayName).toBe("new-name");
      const node = getPaired()["node-1"];
      expect(node.displayName).toBe("new-name");
    });

    it("重命名应该对 displayName 执行 trim", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      const result = await renamePairedNode("node-1", "  trimmed  ", BASE_DIR);
      expect(result!.displayName).toBe("trimmed");
    });

    it("重命名不存在的节点应该返回 null", async () => {
      const result = await renamePairedNode("nonexistent", "new-name", BASE_DIR);
      expect(result).toBeNull();
    });

    it("空 displayName 重命名应该抛出错误", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      await expect(renamePairedNode("node-1", "   ", BASE_DIR)).rejects.toThrow(
        "displayName required",
      );
    });
  });

  // ===========================================================================
  // reusePendingNodePairingForReconnect
  // ===========================================================================
  describe("reusePendingNodePairingForReconnect", () => {
    it("元数据匹配时应该复用现有 pending 请求", async () => {
      const reqResult = await requestNodePairing(
        { nodeId: "node-1", clientId: "client-1", displayName: "Node 1" },
        BASE_DIR,
      );
      const result = await reusePendingNodePairingForReconnect(
        { nodeId: "node-1", clientId: "client-1", displayName: "Node 1" },
        undefined,
        BASE_DIR,
      );
      expect(result).not.toBeNull();
      expect(result!.created).toBe(false);
      expect(result!.request.requestId).toBe(reqResult.request.requestId);
    });

    it("元数据不匹配时不复用 pending 请求", async () => {
      await requestNodePairing(
        { nodeId: "node-1", clientId: "client-1" },
        BASE_DIR,
      );
      const result = await reusePendingNodePairingForReconnect(
        { nodeId: "node-1", clientId: "client-2" },
        undefined,
        BASE_DIR,
      );
      expect(result).toBeNull();
    });

    it("无 pending 请求时复用应该返回 null", async () => {
      const result = await reusePendingNodePairingForReconnect(
        { nodeId: "node-1" },
        undefined,
        BASE_DIR,
      );
      expect(result).toBeNull();
    });

    it("审批表面不同时不复用 pending 请求", async () => {
      await requestNodePairing(
        { nodeId: "node-1", caps: ["cap-a"] },
        BASE_DIR,
      );
      const result = await reusePendingNodePairingForReconnect(
        { nodeId: "node-1", caps: ["cap-b"] },
        undefined,
        BASE_DIR,
      );
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // releaseNodePairingCleanupClaim & finalizeNodePairingCleanupClaim
  // ===========================================================================
  describe("releaseNodePairingCleanupClaim", () => {
    it("释放后 finalize 应该返回空列表（claim 已不活跃）", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-rel": {
          requestId: "req-rel",
          nodeId: "node-1",
          ts: now,
          revision: "rev-rel-1",
        },
      });
      const { cleanupClaim } = await beginNodePairingConnect("node-1", BASE_DIR);
      expect(cleanupClaim).toBeDefined();
      await releaseNodePairingCleanupClaim(cleanupClaim!);
      const superseded = await finalizeNodePairingCleanupClaim(cleanupClaim!);
      expect(superseded).toEqual([]);
    });
  });

  describe("finalizeNodePairingCleanupClaim", () => {
    it("应该移除被取代的 pending 请求并返回 superseded 列表", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-fin": {
          requestId: "req-fin",
          nodeId: "node-1",
          ts: now,
          revision: "rev-fin-1",
        },
      });
      const { cleanupClaim } = await beginNodePairingConnect("node-1", BASE_DIR);
      const superseded = await finalizeNodePairingCleanupClaim(cleanupClaim!);
      expect(superseded).toHaveLength(1);
      expect(superseded[0].requestId).toBe("req-fin");
      expect(superseded[0].nodeId).toBe("node-1");
      const pendingState = getPending();
      expect(pendingState["req-fin"]).toBeUndefined();
    });

    it("pending revision 变化后 finalize 不应移除该请求", async () => {
      const now = Date.now();
      setPaired({
        "node-1": {
          nodeId: "node-1",
          token: "t1",
          createdAtMs: now,
          approvedAtMs: now,
        },
      });
      setPending({
        "req-stale": {
          requestId: "req-stale",
          nodeId: "node-1",
          ts: now,
          revision: "rev-stale-1",
        },
      });
      const { cleanupClaim } = await beginNodePairingConnect("node-1", BASE_DIR);
      // 模拟 revision 已变化（例如被刷新）
      setPending({
        "req-stale": {
          requestId: "req-stale",
          nodeId: "node-1",
          ts: now,
          revision: "rev-stale-2",
        },
      });
      const superseded = await finalizeNodePairingCleanupClaim(cleanupClaim!);
      expect(superseded).toEqual([]);
      const pendingState = getPending();
      expect(pendingState["req-stale"]).toBeDefined();
    });
  });
});
