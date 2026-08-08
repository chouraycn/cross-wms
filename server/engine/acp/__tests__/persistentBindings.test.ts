import { describe, it, expect, beforeEach } from "vitest";
import {
  buildConfiguredAcpSessionKey,
  toConfiguredAcpBindingRecord,
  parseConfiguredAcpSessionKey,
  resolveConfiguredAcpBindingSpecFromRecord,
  toResolvedConfiguredAcpBinding,
  resolveConfiguredAcpBinding,
  isConfiguredAcpSessionKey,
  normalizeText,
  normalizeAccountId,
  sanitizeAgentId,
  normalizeMode,
  normalizeBindingConfig,
  ensureConfiguredAcpBindingSession,
  ensureConfiguredAcpBindingSessions,
  removeConfiguredAcpBindingSession,
} from "../persistentBindings.js";
import type {
  ConfiguredAcpBindingSpec,
  SessionBindingRecord,
  AcpSessionManagerLike,
  BindingLifecycleConfig,
  SessionAcpMeta,
  BindingResolutionResult,
} from "../persistentBindings.js";

describe("Persistent Bindings - Resolve", () => {
  describe("normalizeText", () => {
    it("should return trimmed string", () => {
      expect(normalizeText("  hello  ")).toBe("hello");
    });

    it("should return undefined for empty string", () => {
      expect(normalizeText("")).toBeUndefined();
    });

    it("should return undefined for non-string", () => {
      expect(normalizeText(123)).toBeUndefined();
    });
  });

  describe("normalizeAccountId", () => {
    it("should trim and return account id", () => {
      expect(normalizeAccountId("user1")).toBe("user1");
    });

    it("should return 'default' for empty string", () => {
      expect(normalizeAccountId("")).toBe("default");
    });

    it("should trim whitespace", () => {
      expect(normalizeAccountId("  user1  ")).toBe("user1");
    });
  });

  describe("sanitizeAgentId", () => {
    it("should lowercase and trim", () => {
      expect(sanitizeAgentId("AGENT_1")).toBe("agent_1");
    });

    it("should replace special chars with dash", () => {
      expect(sanitizeAgentId("agent@1!")).toBe("agent-1-");
    });
  });

  describe("normalizeMode", () => {
    it("should return 'oneshot' for 'oneshot'", () => {
      expect(normalizeMode("oneshot")).toBe("oneshot");
    });

    it("should return 'persistent' for 'persistent'", () => {
      expect(normalizeMode("persistent")).toBe("persistent");
    });

    it("should return 'persistent' as default", () => {
      expect(normalizeMode("unknown")).toBe("persistent");
    });
  });

  describe("normalizeBindingConfig", () => {
    it("should return empty object for null", () => {
      expect(normalizeBindingConfig(null)).toEqual({});
    });

    it("should normalize all fields", () => {
      const result = normalizeBindingConfig({
        mode: "oneshot",
        cwd: "/tmp",
        backend: "codex",
        label: "Test",
      });
      expect(result.mode).toBe("oneshot");
      expect(result.cwd).toBe("/tmp");
      expect(result.backend).toBe("codex");
      expect(result.label).toBe("Test");
    });
  });

  describe("buildConfiguredAcpSessionKey", () => {
    it("should produce stable session key", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const key1 = buildConfiguredAcpSessionKey(spec);
      const key2 = buildConfiguredAcpSessionKey(spec);
      expect(key1).toBe(key2);
    });

    it("should produce different keys for different specs", () => {
      const spec1: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const spec2: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv2",
        agentId: "test-agent",
      };
      expect(buildConfiguredAcpSessionKey(spec1)).not.toBe(buildConfiguredAcpSessionKey(spec2));
    });
  });

  describe("parseConfiguredAcpSessionKey", () => {
    it("should parse valid session key", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const key = buildConfiguredAcpSessionKey(spec);
      const parsed = parseConfiguredAcpSessionKey(key);
      expect(parsed?.channel).toBe("feishu");
      expect(parsed?.accountId).toBe("user1");
    });

    it("should return null for invalid key", () => {
      expect(parseConfiguredAcpSessionKey("invalid:key")).toBeNull();
    });
  });

  describe("toConfiguredAcpBindingRecord", () => {
    it("should create record with active status", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
        mode: "persistent",
      };
      const record = toConfiguredAcpBindingRecord(spec);
      expect(record.status).toBe("active");
      expect(record.targetKind).toBe("session");
      expect(record.metadata?.source).toBe("config");
      expect(record.metadata?.mode).toBe("persistent");
    });
  });

  describe("resolveConfiguredAcpBindingSpecFromRecord", () => {
    it("should resolve spec from record", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
        mode: "persistent",
      };
      const record = toConfiguredAcpBindingRecord(spec);
      const resolved = resolveConfiguredAcpBindingSpecFromRecord(record);
      expect(resolved?.channel).toBe(spec.channel);
      expect(resolved?.agentId).toBe(spec.agentId);
    });

    it("should return null for non-session target", () => {
      const record: SessionBindingRecord = {
        bindingId: "x",
        targetSessionKey: "y",
        targetKind: "session",
        conversation: { channel: "c", accountId: "a", conversationId: "conv" },
        status: "active",
        boundAt: 0,
      };
      (record as any).targetKind = "channel";
      expect(resolveConfiguredAcpBindingSpecFromRecord(record)).toBeNull();
    });
  });

  describe("toResolvedConfiguredAcpBinding", () => {
    it("should return resolved binding", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const record = toConfiguredAcpBindingRecord(spec);
      const resolved = toResolvedConfiguredAcpBinding(record);
      expect(resolved).not.toBeNull();
      expect(resolved?.spec.agentId).toBe(spec.agentId);
    });
  });

  describe("resolveConfiguredAcpBinding", () => {
    it("should return ok result for valid record", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const record = toConfiguredAcpBindingRecord(spec);
      const result = resolveConfiguredAcpBinding({ record });
      expect(result.ok).toBe(true);
    });
  });

  describe("isConfiguredAcpSessionKey", () => {
    it("should return true for valid key", () => {
      const spec: ConfiguredAcpBindingSpec = {
        channel: "feishu",
        accountId: "user1",
        conversationId: "conv1",
        agentId: "test-agent",
      };
      const key = buildConfiguredAcpSessionKey(spec);
      expect(isConfiguredAcpSessionKey(key)).toBe(true);
    });

    it("should return false for invalid key", () => {
      expect(isConfiguredAcpSessionKey("invalid")).toBe(false);
    });
  });
});

describe("Persistent Bindings - Lifecycle", () => {
  let sessions: Map<string, SessionAcpMeta>;
  let manager: AcpSessionManagerLike;

  beforeEach(() => {
    sessions = new Map();
    manager = {
      resolveSession({ sessionKey }) {
        const meta = sessions.get(sessionKey);
        if (!meta) return { kind: "missing" };
        return { kind: "ready", meta };
      },
      upsertSession({ sessionKey, meta }) {
        sessions.set(sessionKey, meta);
        return { ok: true, sessionKey };
      },
      removeSession({ sessionKey }) {
        sessions.delete(sessionKey);
      },
    };
  });

  it("should create new session for binding", async () => {
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
    };
    const result = await ensureConfiguredAcpBindingSession({ manager, spec });
    expect(result.ok).toBe(true);
    expect(sessions.size).toBe(1);
  });

  it("should reuse existing session if matches", async () => {
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
    };
    await ensureConfiguredAcpBindingSession({ manager, spec });
    const size1 = sessions.size;
    await ensureConfiguredAcpBindingSession({ manager, spec });
    expect(sessions.size).toBe(size1);
  });

  it("should replace session if not matching", async () => {
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
    };
    await ensureConfiguredAcpBindingSession({ manager, spec });
    // Modify the spec to force replacement
    const newSpec = { ...spec, agentId: "different-agent" };
    const result = await ensureConfiguredAcpBindingSession({ manager, spec: newSpec });
    expect(result.ok).toBe(true);
  });

  it("should process multiple specs", async () => {
    const specs: ConfiguredAcpBindingSpec[] = [
      { channel: "feishu", accountId: "u1", conversationId: "c1", agentId: "a1" },
      { channel: "wecom", accountId: "u2", conversationId: "c2", agentId: "a2" },
      { channel: "web", accountId: "u3", conversationId: "c3", agentId: "a3" },
    ];
    const result = await ensureConfiguredAcpBindingSessions({ manager, specs });
    expect(result.successful).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("should remove session", async () => {
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
    };
    await ensureConfiguredAcpBindingSession({ manager, spec });
    expect(sessions.size).toBe(1);
    removeConfiguredAcpBindingSession({ manager, spec });
    expect(sessions.size).toBe(0);
  });

  it("should handle error gracefully", async () => {
    const errorManager: AcpSessionManagerLike = {
      resolveSession: () => { throw new Error("Test error"); },
      upsertSession: () => ({ ok: true, sessionKey: "x" }),
      removeSession: () => {},
    };
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
    };
    const result = await ensureConfiguredAcpBindingSession({ manager: errorManager, spec });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Test error");
    }
  });

  it("should use default config when not provided", async () => {
    const spec: ConfiguredAcpBindingSpec = {
      channel: "feishu",
      accountId: "user1",
      conversationId: "conv1",
      agentId: "test-agent",
      backend: "codex",
      cwd: "/workspace",
    };
    const result = await ensureConfiguredAcpBindingSession({ manager, spec });
    expect(result.ok).toBe(true);
  });
});
