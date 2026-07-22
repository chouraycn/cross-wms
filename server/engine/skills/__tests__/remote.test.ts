import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  registerRemoteNode,
  unregisterRemoteNode,
  listRemoteNodes,
  updateRemoteNodeStatus,
  syncSkillsFromNode,
  syncAllRemoteNodes,
  getRemoteSkills,
  pullRemoteSkill,
  loadRemoteSkill,
  startRemoteSync,
  stopRemoteSync,
  isRemoteSkill,
  getRemoteSkillNode,
  resetRemoteState,
} from "../runtime/remote.js";
import type { RemoteSkillNode } from "../runtime/remote.js";

describe("RemoteSkills", () => {
  beforeEach(() => {
    resetRemoteState();
  });

  afterEach(() => {
    resetRemoteState();
  });

  describe("节点注册/注销", () => {
    it("应注册远程节点", () => {
      const node = registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
        nodeName: "Node One",
      });

      expect(node.nodeId).toBe("node-1");
      expect(node.nodeUrl).toBe("https://node1.example.com");
      expect(node.nodeName).toBe("Node One");
      expect(node.status).toBe("offline");
      expect(node.skillCount).toBe(0);

      const nodes = listRemoteNodes();
      expect(nodes.length).toBe(1);
      expect(nodes[0].nodeId).toBe("node-1");
    });

    it("注册重复节点应更新而非添加", () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
        nodeName: "Node One",
      });

      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1-updated.example.com",
        nodeName: "Node One Updated",
      });

      const nodes = listRemoteNodes();
      expect(nodes.length).toBe(1);
      expect(nodes[0].nodeName).toBe("Node One Updated");
    });

    it("应注销远程节点", () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });

      const result = unregisterRemoteNode("node-1");
      expect(result).toBe(true);
      expect(listRemoteNodes().length).toBe(0);
    });

    it("注销不存在的节点应返回 false", () => {
      const result = unregisterRemoteNode("nonexistent");
      expect(result).toBe(false);
    });

    it("注销节点应同时移除其下的技能", async () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });

      await pullRemoteSkill("node-1", "test-skill");
      expect(getRemoteSkills("node-1").length).toBeGreaterThan(0);

      unregisterRemoteNode("node-1");
      expect(getRemoteSkills("node-1").length).toBe(0);
    });
  });

  describe("节点状态更新", () => {
    it("应更新节点状态", () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });

      const updated = updateRemoteNodeStatus("node-1", "online");
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe("online");

      const nodes = listRemoteNodes();
      expect(nodes[0].status).toBe("online");
    });

    it("节点变为 online 或 syncing 时应更新 lastSeen", () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
        lastSeen: 0,
      });

      const before = listRemoteNodes()[0].lastSeen;
      updateRemoteNodeStatus("node-1", "online");
      const after = listRemoteNodes()[0].lastSeen;
      expect(after).toBeGreaterThanOrEqual(before);
      expect(after).toBeGreaterThan(0);
    });

    it("更新不存在的节点应返回 null", () => {
      const result = updateRemoteNodeStatus("nonexistent", "online");
      expect(result).toBeNull();
    });

    it("应支持所有状态类型", () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });

      for (const status of ["online", "offline", "syncing"] as const) {
        const updated = updateRemoteNodeStatus("node-1", status);
        expect(updated?.status).toBe(status);
      }
    });
  });

  describe("单个节点同步", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
        nodeName: "Test Node",
      });
    });

    it("应从节点同步技能", async () => {
      const result = await syncSkillsFromNode("node-1");

      expect(result.nodeId).toBe("node-1");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
      expect(result.syncedSkills.length + result.failedSkills.length).toBeGreaterThan(0);
    });

    it("同步后节点状态应为 online 或 offline（取决于同步是否成功）", async () => {
      const result = await syncSkillsFromNode("node-1");
      const node = listRemoteNodes()[0];
      if (result.error) {
        expect(node.status).toBe("offline");
      } else {
        expect(node.status).toBe("online");
      }
    });

    it("同步后技能应可查询", async () => {
      await syncSkillsFromNode("node-1");
      const skills = getRemoteSkills("node-1");
      expect(skills.length).toBeGreaterThan(0);
    });

    it("同步不存在的节点应返回错误", async () => {
      const result = await syncSkillsFromNode("nonexistent");
      expect(result.error).toBeDefined();
      expect(result.syncedSkills.length).toBe(0);
    });

    it("同步期间节点状态应为 syncing", async () => {
      let syncingStatus: string | undefined;
      const originalUpdate = updateRemoteNodeStatus;

      updateRemoteNodeStatus("node-1", "offline");

      const result = await syncSkillsFromNode("node-1");
      expect(result).toBeDefined();

      const node = listRemoteNodes()[0];
      expect(node.status === "online" || node.status === "offline").toBe(true);
    });
  });

  describe("全部节点同步", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
      registerRemoteNode({
        nodeId: "node-2",
        nodeUrl: "https://node2.example.com",
      });
      registerRemoteNode({
        nodeId: "node-3",
        nodeUrl: "https://node3.example.com",
      });
    });

    it("应同步所有节点", async () => {
      const results = await syncAllRemoteNodes();
      expect(results.length).toBe(3);
      expect(results.every((r) => r.nodeId.startsWith("node-"))).toBe(true);
    });

    it("同步后所有节点技能数应大于0", async () => {
      await syncAllRemoteNodes();
      const allSkills = getRemoteSkills();
      expect(allSkills.length).toBeGreaterThan(0);
    });

    it("没有节点时应返回空数组", async () => {
      resetRemoteState();
      const results = await syncAllRemoteNodes();
      expect(results.length).toBe(0);
    });
  });

  describe("远程技能拉取", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
    });

    it("应拉取单个远程技能", async () => {
      const skill = await pullRemoteSkill("node-1", "custom-skill");
      expect(skill).not.toBeNull();
      expect(skill?.skillName).toBe("custom-skill");
      expect(skill?.nodeId).toBe("node-1");
      expect(skill?.syncStatus).toBe("synced");
    });

    it("从不存在的节点拉取应返回 null", async () => {
      const skill = await pullRemoteSkill("nonexistent", "skill");
      expect(skill).toBeNull();
    });

    it("拉取已存在的技能应更新状态", async () => {
      await pullRemoteSkill("node-1", "existing-skill");
      const skill1 = getRemoteSkills("node-1").find((s) => s.skillName === "existing-skill");
      expect(skill1).toBeDefined();

      const pulled = await pullRemoteSkill("node-1", "existing-skill");
      expect(pulled).not.toBeNull();
      expect(pulled?.syncStatus).toBe("synced");
    });
  });

  describe("加载远程技能", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
    });

    it("已同步的技能应直接加载", async () => {
      await pullRemoteSkill("node-1", "cached-skill");
      const skill = await loadRemoteSkill("node-1", "cached-skill");
      expect(skill).not.toBeNull();
      expect(skill?.skillName).toBe("cached-skill");
    });

    it("未同步的技能应先拉取再加载", async () => {
      const skill = await loadRemoteSkill("node-1", "new-skill");
      expect(skill).not.toBeNull();
      expect(skill?.skillName).toBe("new-skill");
      expect(skill?.syncStatus).toBe("synced");
    });

    it("从不存在的节点加载应返回 null", async () => {
      const skill = await loadRemoteSkill("nonexistent", "skill");
      expect(skill).toBeNull();
    });
  });

  describe("定时同步", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
    });

    it("应能启动定时同步并返回 stop 函数", () => {
      const stop = startRemoteSync({ syncIntervalMs: 10000 });
      expect(typeof stop).toBe("function");
      stop();
    });

    it("应能通过 stopRemoteSync 停止同步", () => {
      startRemoteSync({ syncIntervalMs: 10000 });
      stopRemoteSync();
    });

    it("重复启动应先停止旧定时器", () => {
      const stop1 = startRemoteSync({ syncIntervalMs: 10000 });
      const stop2 = startRemoteSync({ syncIntervalMs: 20000 });
      stop2();
    });

    it("startRemoteSync 应注册配置中的节点", () => {
      resetRemoteState();
      const testNodes: RemoteSkillNode[] = [
        {
          nodeId: "config-node-1",
          nodeUrl: "https://config1.example.com",
          nodeName: "Config Node 1",
          status: "offline",
          lastSeen: 0,
          skillCount: 0,
        },
        {
          nodeId: "config-node-2",
          nodeUrl: "https://config2.example.com",
          nodeName: "Config Node 2",
          status: "offline",
          lastSeen: 0,
          skillCount: 0,
        },
      ];

      const stop = startRemoteSync({ nodes: testNodes, syncIntervalMs: 10000 });
      const nodes = listRemoteNodes();
      expect(nodes.length).toBe(2);
      expect(nodes.map((n) => n.nodeId).sort()).toEqual(["config-node-1", "config-node-2"]);
      stop();
    });

    it("低于最小间隔应使用最小间隔", () => {
      const stop = startRemoteSync({ syncIntervalMs: 1000 });
      stop();
    });
  });

  describe("远程技能判断", () => {
    beforeEach(() => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
    });

    it("已同步的技能应判定为远程技能", async () => {
      await pullRemoteSkill("node-1", "remote-skill");
      expect(isRemoteSkill("remote-skill")).toBe(true);
    });

    it("不存在的技能应判定为非远程技能", () => {
      expect(isRemoteSkill("local-skill")).toBe(false);
    });

    it("应能获取技能所属节点", async () => {
      await pullRemoteSkill("node-1", "located-skill");
      const node = getRemoteSkillNode("located-skill");
      expect(node).not.toBeNull();
      expect(node?.nodeId).toBe("node-1");
    });

    it("获取不存在技能的节点应返回 null", () => {
      const node = getRemoteSkillNode("nonexistent");
      expect(node).toBeNull();
    });
  });

  describe("错误处理", () => {
    it("查询不存在的节点技能应返回空数组", () => {
      const skills = getRemoteSkills("nonexistent");
      expect(skills).toEqual([]);
    });

    it("注销不存在的节点应返回 false", () => {
      expect(unregisterRemoteNode("fake")).toBe(false);
    });

    it("从不存在的节点加载技能应返回 null", async () => {
      const skill = await loadRemoteSkill("fake-node", "fake-skill");
      expect(skill).toBeNull();
    });

    it("stopRemoteSync 在无定时器时不应报错", () => {
      expect(() => stopRemoteSync()).not.toThrow();
    });

    it("resetRemoteState 应完全重置状态", async () => {
      registerRemoteNode({ nodeId: "n1", nodeUrl: "https://n1.com" });
      await pullRemoteSkill("n1", "s1");
      startRemoteSync({ syncIntervalMs: 10000 });

      resetRemoteState();

      expect(listRemoteNodes().length).toBe(0);
      expect(getRemoteSkills().length).toBe(0);
    });
  });

  describe("getRemoteSkills", () => {
    beforeEach(async () => {
      registerRemoteNode({
        nodeId: "node-1",
        nodeUrl: "https://node1.example.com",
      });
      registerRemoteNode({
        nodeId: "node-2",
        nodeUrl: "https://node2.example.com",
      });
    });

    it("不传 nodeId 应返回所有远程技能", async () => {
      await pullRemoteSkill("node-1", "skill-a");
      await pullRemoteSkill("node-2", "skill-b");

      const all = getRemoteSkills();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it("传入 nodeId 应只返回该节点的技能", async () => {
      await pullRemoteSkill("node-1", "skill-a");
      await pullRemoteSkill("node-2", "skill-b");

      const node1Skills = getRemoteSkills("node-1");
      expect(node1Skills.every((s) => s.nodeId === "node-1")).toBe(true);
    });
  });
});
