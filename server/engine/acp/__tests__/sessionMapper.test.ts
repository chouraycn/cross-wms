import { describe, it, expect } from "vitest";
import { SessionMapper } from "../sessionMapper.js";

describe("SessionMapper", () => {
  describe("bindSession", () => {
    it("should create a binding", () => {
      const mapper = new SessionMapper();
      const binding = mapper.bindSession("session_1", {
        userId: "user_1",
        channelId: "feishu",
        accountId: "main",
        peerId: "chat_1",
        policyProfileId: "default",
      });

      expect(binding.sessionId).toBe("session_1");
      expect(binding.userId).toBe("user_1");
      expect(binding.channelId).toBe("feishu");
      expect(binding.accountId).toBe("main");
      expect(binding.peerId).toBe("chat_1");
      expect(binding.policyProfileId).toBe("default");
    });

    it("should use default policy profile", () => {
      const mapper = new SessionMapper();
      const binding = mapper.bindSession("session_1", {});

      expect(binding.policyProfileId).toBe("default");
    });
  });

  describe("unbindSession", () => {
    it("should remove a binding", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", {});

      const result = mapper.unbindSession("session_1");
      expect(result).toBe(true);

      const binding = mapper.getBinding("session_1");
      expect(binding).toBeUndefined();
    });

    it("should return false for non-existent session", () => {
      const mapper = new SessionMapper();
      const result = mapper.unbindSession("nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("getBinding", () => {
    it("should retrieve a binding", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { userId: "user_1" });

      const binding = mapper.getBinding("session_1");
      expect(binding).toBeDefined();
      expect(binding?.userId).toBe("user_1");
    });

    it("should return undefined for non-existent session", () => {
      const mapper = new SessionMapper();
      const binding = mapper.getBinding("nonexistent");
      expect(binding).toBeUndefined();
    });
  });

  describe("findBindings", () => {
    it("should find bindings by userId", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { userId: "user_1", channelId: "feishu" });
      mapper.bindSession("session_2", { userId: "user_1", channelId: "wecom" });
      mapper.bindSession("session_3", { userId: "user_2", channelId: "feishu" });

      const bindings = mapper.findBindings({ userId: "user_1" });
      expect(bindings.length).toBe(2);
    });

    it("should find bindings by channelId", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { channelId: "feishu" });
      mapper.bindSession("session_2", { channelId: "wecom" });

      const bindings = mapper.findBindings({ channelId: "feishu" });
      expect(bindings.length).toBe(1);
      expect(bindings[0].channelId).toBe("feishu");
    });

    it("should find bindings by accountId", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { accountId: "main" });
      mapper.bindSession("session_2", { accountId: "test" });

      const bindings = mapper.findBindings({ accountId: "main" });
      expect(bindings.length).toBe(1);
    });

    it("should find bindings by peerId", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { peerId: "chat_1" });
      mapper.bindSession("session_2", { peerId: "chat_2" });

      const bindings = mapper.findBindings({ peerId: "chat_1" });
      expect(bindings.length).toBe(1);
    });

    it("should find bindings by agentId", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { agentId: "agent_1" });
      mapper.bindSession("session_2", { agentId: "agent_2" });

      const bindings = mapper.findBindings({ agentId: "agent_1" });
      expect(bindings.length).toBe(1);
    });

    it("should find bindings with multiple criteria", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { userId: "user_1", channelId: "feishu" });
      mapper.bindSession("session_2", { userId: "user_1", channelId: "wecom" });
      mapper.bindSession("session_3", { userId: "user_2", channelId: "feishu" });

      const bindings = mapper.findBindings({ userId: "user_1", channelId: "feishu" });
      expect(bindings.length).toBe(1);
      expect(bindings[0].sessionId).toBe("session_1");
    });
  });

  describe("getPolicyProfileId", () => {
    it("should return policy profile id", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { policyProfileId: "restricted" });

      const profileId = mapper.getPolicyProfileId("session_1");
      expect(profileId).toBe("restricted");
    });

    it("should return default for non-existent session", () => {
      const mapper = new SessionMapper();
      const profileId = mapper.getPolicyProfileId("nonexistent");
      expect(profileId).toBe("default");
    });
  });

  describe("updatePolicyProfile", () => {
    it("should update policy profile", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { policyProfileId: "default" });

      const result = mapper.updatePolicyProfile("session_1", "full");
      expect(result).toBe(true);

      const profileId = mapper.getPolicyProfileId("session_1");
      expect(profileId).toBe("full");
    });

    it("should return false for non-existent session", () => {
      const mapper = new SessionMapper();
      const result = mapper.updatePolicyProfile("nonexistent", "full");
      expect(result).toBe(false);
    });
  });

  describe("cleanupExpired", () => {
    it("should remove expired bindings", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", { expiresAt: Date.now() - 1000 });
      mapper.bindSession("session_2", { expiresAt: Date.now() + 1000 });

      mapper.cleanupExpired();

      const binding1 = mapper.getBinding("session_1");
      const binding2 = mapper.getBinding("session_2");

      expect(binding1).toBeUndefined();
      expect(binding2).toBeDefined();
    });
  });

  describe("getStats", () => {
    it("should return stats", () => {
      const mapper = new SessionMapper();
      mapper.bindSession("session_1", {});
      mapper.bindSession("session_2", { expiresAt: Date.now() - 1000 });

      const stats = mapper.getStats();
      expect(stats.totalBindings).toBe(2);
      expect(stats.activeBindings).toBe(1);
      expect(stats.expiredBindings).toBe(1);
    });
  });
});
