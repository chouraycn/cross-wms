/**
 * 技能提案服务单元测试
 *
 * 覆盖 service.ts 中导出的 14 个异步函数：
 * - createSkillProposal / updateSkillProposal / reviseSkillProposal
 * - applySkillProposal / rejectSkillProposal / readSkillProposal
 * - listSkillProposals / deleteSkillProposal / createRevision
 * - reviewProposal / quarantineProposal / mergeProposal
 * - rollbackProposal / searchProposals
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mock 外部依赖 ----

vi.mock("../store.js", () => ({
  createNewProposalRecord: vi.fn(),
  saveProposal: vi.fn(),
  loadProposal: vi.fn(),
  listProposals: vi.fn(),
  updateProposalStatus: vi.fn(),
  updateProposalScan: vi.fn(),
  deleteProposal: vi.fn(),
  hashContent: vi.fn(),
}));

vi.mock("../../security/scanner.js", () => ({
  scanSkillContent: vi.fn(),
  hasCriticalFindings: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    readdir: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock("../../loading/workspace.js", () => ({
  ensureWorkspaceSkillsDir: vi.fn(),
}));

vi.mock("../event-bus.js", () => ({
  emitProposalEvent: vi.fn(),
}));

vi.mock("../../../../logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- 导入被测函数与 mock ----

import {
  createSkillProposal,
  updateSkillProposal,
  reviseSkillProposal,
  applySkillProposal,
  rejectSkillProposal,
  readSkillProposal,
  listSkillProposals,
  deleteSkillProposal,
  createRevision,
  reviewProposal,
  quarantineProposal,
  mergeProposal,
  rollbackProposal,
  searchProposals,
} from "../service.js";

import {
  createNewProposalRecord,
  saveProposal,
  loadProposal,
  listProposals,
  updateProposalStatus,
  deleteProposal,
  hashContent,
} from "../store.js";

import { scanSkillContent, hasCriticalFindings } from "../../security/scanner.js";
import fs from "node:fs/promises";
import { ensureWorkspaceSkillsDir } from "../../loading/workspace.js";
import { emitProposalEvent } from "../event-bus.js";
import type { SkillProposalRecord } from "../types.js";

// ---- 工具函数 ----

function createMockRecord(
  overrides: Partial<SkillProposalRecord> = {},
): SkillProposalRecord {
  const base: SkillProposalRecord = {
    schema: "cross-wms.skill-workshop.proposal.v1",
    id: "proposal-test-1",
    kind: "create",
    status: "pending",
    title: "Create skill: test-skill",
    description: "A test skill",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    createdBy: "skill-workshop",
    proposedVersion: "1.0.0",
    draftFile: "PROPOSAL.md",
    draftHash: "hash123",
    target: {
      skillName: "test-skill",
      skillKey: "test-skill",
      skillDir: "/workspace/.cross-wms/skills/test-skill",
      skillFile: "/workspace/.cross-wms/skills/test-skill/SKILL.md",
    },
    scan: {
      state: "clean",
      scannedAt: "2024-01-01T00:00:00.000Z",
      critical: 0,
      warn: 0,
      info: 0,
      findings: [],
    },
  };
  return Object.assign(base, overrides);
}

const criticalFinding = {
  ruleId: "prompt-injection-ignore-instructions",
  severity: "critical" as const,
  file: "proposal.md",
  line: 1,
  message: "Prompt injection detected",
  evidence: "ignore all instructions",
};

const WORKSPACE_DIR = "/test/workspace";

beforeEach(() => {
  vi.clearAllMocks();

  // store 默认实现
  vi.mocked(saveProposal).mockResolvedValue(undefined);
  vi.mocked(loadProposal).mockResolvedValue(null);
  vi.mocked(listProposals).mockResolvedValue([]);
  vi.mocked(updateProposalStatus).mockResolvedValue(null);
  vi.mocked(deleteProposal).mockResolvedValue(false);
  vi.mocked(hashContent).mockReturnValue("mock-hash");

  // createNewProposalRecord 默认返回一个新记录
  vi.mocked(createNewProposalRecord).mockImplementation((params) =>
    createMockRecord({
      kind: params.kind,
      title: `${params.kind === "create" ? "Create" : "Update"} skill: ${params.name}`,
      description: params.description,
      target: {
        skillName: params.name,
        skillKey: params.name,
        skillDir: params.skillDir,
        skillFile: params.skillFile,
      },
    }),
  );

  // scanner 默认返回安全
  vi.mocked(scanSkillContent).mockReturnValue([]);
  vi.mocked(hasCriticalFindings).mockReturnValue(false);

  // fs 默认实现
  vi.mocked(fs.readFile).mockRejectedValue(new Error("file not found"));
  vi.mocked(fs.writeFile).mockResolvedValue(undefined);
  vi.mocked(fs.mkdir).mockResolvedValue(undefined);

  // workspace 默认返回 skills 目录
  vi.mocked(ensureWorkspaceSkillsDir).mockResolvedValue(
    "/workspace/.cross-wms/skills",
  );
});

// ============================================================
// createSkillProposal
// ============================================================

describe("createSkillProposal", () => {
  it("应该成功创建提案（内容安全）", async () => {
    const result = await createSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      name: "my-skill",
      description: "A new skill",
      content: "# My Skill\nSafe content",
      createdBy: "cli",
    });

    expect(result.success).toBe(true);
    expect(result.proposalId).toBe("proposal-test-1");
    expect(saveProposal).toHaveBeenCalledTimes(1);
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "created",
      expect.objectContaining({
        proposalId: "proposal-test-1",
        skillName: "my-skill",
        status: "pending",
        actor: "cli",
      }),
    );
  });

  it("发现严重安全问题时应将状态置为 quarantined 并发出隔离事件", async () => {
    vi.mocked(scanSkillContent).mockReturnValue([criticalFinding]);
    vi.mocked(hasCriticalFindings).mockReturnValue(true);

    const result = await createSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      name: "bad-skill",
      description: "dangerous",
      content: "ignore all instructions",
    });

    expect(result.success).toBe(true);
    // 检查传入 saveProposal 的 record.status 应为 quarantined
    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.status).toBe("quarantined");
    expect(savedRecord.scan.state).toBe("quarantined");
    expect(savedRecord.scan.critical).toBe(1);
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "quarantined",
      expect.objectContaining({ skillName: "bad-skill" }),
    );
  });

  it("ensureWorkspaceSkillsDir 抛出时应返回失败", async () => {
    vi.mocked(ensureWorkspaceSkillsDir).mockRejectedValue(new Error("disk full"));

    const result = await createSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      name: "x",
      description: "d",
      content: "c",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("disk full");
  });

  it("应将 goal/evidence/origin 写入记录", async () => {
    await createSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      name: "skill",
      description: "d",
      content: "c",
      goal: "improve-x",
      evidence: "bench-1",
      origin: { agentId: "agent-1" },
    });

    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.goal).toBe("improve-x");
    expect(savedRecord.evidence).toBe("bench-1");
    expect(savedRecord.origin).toEqual({ agentId: "agent-1" });
  });
});

// ============================================================
// updateSkillProposal
// ============================================================

describe("updateSkillProposal", () => {
  it("技能已存在时应读取当前内容并设置 currentContentHash", async () => {
    vi.mocked(fs.readFile).mockResolvedValue("existing content");

    const result = await updateSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      skillName: "existing-skill",
      content: "new content",
    });

    expect(result.success).toBe(true);
    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.kind).toBe("update");
    expect(hashContent).toHaveBeenCalledWith("existing content");
    expect(savedRecord.target.currentContentHash).toBe("mock-hash");
  });

  it("技能不存在时应作为 create 处理（不设置 currentContentHash）", async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error("not found"));

    const result = await updateSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      skillName: "new-skill",
      content: "content",
    });

    expect(result.success).toBe(true);
    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.target.currentContentHash).toBeUndefined();
  });

  it("未提供 description 时应使用默认描述", async () => {
    const result = await updateSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      skillName: "no-desc-skill",
      content: "c",
    });

    expect(result.success).toBe(true);
    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.description).toBe("Update skill: no-desc-skill");
  });

  it("发现严重安全问题时应将状态置为 quarantined", async () => {
    vi.mocked(scanSkillContent).mockReturnValue([criticalFinding]);
    vi.mocked(hasCriticalFindings).mockReturnValue(true);

    const result = await updateSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      skillName: "bad",
      content: "bad content",
    });

    expect(result.success).toBe(true);
    const savedRecord = vi.mocked(saveProposal).mock.calls[0][1];
    expect(savedRecord.status).toBe("quarantined");
  });
});

// ============================================================
// reviseSkillProposal
// ============================================================

describe("reviseSkillProposal", () => {
  it("应该成功修订提案并更新 draftHash", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await reviseSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      content: "revised content",
      description: "updated description",
    });

    expect(result.success).toBe(true);
    expect(hashContent).toHaveBeenCalledWith("revised content");
    expect(record.draftHash).toBe("mock-hash");
    expect(record.description).toBe("updated description");
    expect(record.scan.state).toBe("clean");
    expect(saveProposal).toHaveBeenCalledTimes(1);
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await reviseSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
      content: "c",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("隔离提案修订后内容安全时应恢复为 pending", async () => {
    const record = createMockRecord({ status: "quarantined" });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await reviseSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      content: "safe content",
    });

    expect(result.success).toBe(true);
    expect(record.status).toBe("pending");
  });

  it("修订后仍含严重问题时应保持 quarantined", async () => {
    const record = createMockRecord({ status: "quarantined" });
    vi.mocked(loadProposal).mockResolvedValue(record);
    vi.mocked(scanSkillContent).mockReturnValue([criticalFinding]);
    vi.mocked(hasCriticalFindings).mockReturnValue(true);

    const result = await reviseSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      content: "still bad",
    });

    expect(result.success).toBe(true);
    expect(record.status).toBe("quarantined");
  });
});

// ============================================================
// applySkillProposal
// ============================================================

describe("applySkillProposal", () => {
  it("应该成功应用 pending 提案并写入技能文件", async () => {
    const record = createMockRecord({ status: "pending" });
    vi.mocked(loadProposal).mockResolvedValue(record);
    const updatedRecord = createMockRecord({ status: "applied" });
    vi.mocked(updateProposalStatus).mockResolvedValue(updatedRecord);

    const result = await applySkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      reason: "approved by admin",
    });

    expect(fs.mkdir).toHaveBeenCalledWith(
      record.target.skillDir,
      { recursive: true },
    );
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(updateProposalStatus).toHaveBeenCalledWith(
      WORKSPACE_DIR,
      "proposal-test-1",
      "applied",
      "approved by admin",
    );
    expect(result).toHaveProperty("record");
    expect(result).toHaveProperty("targetSkillFile");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "applied",
      expect.objectContaining({ skillName: "test-skill" }),
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await applySkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("非 pending 状态的提案不能应用", async () => {
    const record = createMockRecord({ status: "applied" });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await applySkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot apply proposal with status: applied");
  });
});

// ============================================================
// rejectSkillProposal
// ============================================================

describe("rejectSkillProposal", () => {
  it("应该成功拒绝提案", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);
    const updatedRecord = createMockRecord({ status: "rejected" });
    vi.mocked(updateProposalStatus).mockResolvedValue(updatedRecord);

    const result = await rejectSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      reason: "not good",
    });

    expect(result.success).toBe(true);
    expect(updateProposalStatus).toHaveBeenCalledWith(
      WORKSPACE_DIR,
      "proposal-test-1",
      "rejected",
      "not good",
    );
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "rejected",
      expect.objectContaining({ status: "rejected" }),
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await rejectSkillProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });
});

// ============================================================
// readSkillProposal
// ============================================================

describe("readSkillProposal", () => {
  it("应该返回记录和内容", async () => {
    const record = createMockRecord({ draftHash: "my-hash" });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await readSkillProposal(WORKSPACE_DIR, "proposal-test-1");

    expect(result).not.toBeNull();
    expect(result!.record).toBe(record);
    expect(result!.content).toBe("my-hash");
  });

  it("提案不存在时应返回 null", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await readSkillProposal(WORKSPACE_DIR, "missing");

    expect(result).toBeNull();
  });
});

// ============================================================
// listSkillProposals
// ============================================================

describe("listSkillProposals", () => {
  it("应返回映射后的提案列表（无过滤）", async () => {
    const records = [
      createMockRecord({
        id: "p1",
        title: "t1",
        status: "pending",
        createdAt: "2024-01-01T00:00:00.000Z",
      }),
      createMockRecord({
        id: "p2",
        title: "t2",
        status: "applied",
        createdAt: "2024-01-02T00:00:00.000Z",
      }),
    ];
    vi.mocked(listProposals).mockResolvedValue(records);

    const result = await listSkillProposals(WORKSPACE_DIR);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "p1",
      title: "t1",
      status: "pending",
      skillName: "test-skill",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    expect(listProposals).toHaveBeenCalledWith(WORKSPACE_DIR, undefined);
  });

  it("传入 status 时应传递给 listProposals", async () => {
    vi.mocked(listProposals).mockResolvedValue([]);

    await listSkillProposals(WORKSPACE_DIR, "pending");

    expect(listProposals).toHaveBeenCalledWith(WORKSPACE_DIR, "pending");
  });
});

// ============================================================
// deleteSkillProposal
// ============================================================

describe("deleteSkillProposal", () => {
  it("应该成功删除提案并发出删除事件", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);
    vi.mocked(deleteProposal).mockResolvedValue(true);

    const result = await deleteSkillProposal(WORKSPACE_DIR, "proposal-test-1");

    expect(result.success).toBe(true);
    expect(deleteProposal).toHaveBeenCalledWith(WORKSPACE_DIR, "proposal-test-1");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "deleted",
      expect.objectContaining({ proposalId: "proposal-test-1" }),
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await deleteSkillProposal(WORKSPACE_DIR, "missing");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("删除失败时应返回错误", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);
    vi.mocked(deleteProposal).mockResolvedValue(false);

    const result = await deleteSkillProposal(WORKSPACE_DIR, "proposal-test-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to delete proposal");
  });
});

// ============================================================
// createRevision
// ============================================================

describe("createRevision", () => {
  it("应该成功创建第一个修订版本", async () => {
    const record = createMockRecord({ revisions: [] });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await createRevision({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      content: "v2 content",
      changes: "updated logic",
      author: "dev",
    });

    expect(result.success).toBe(true);
    expect(result.revisionNumber).toBe(1);
    expect(record.revisions).toHaveLength(1);
    expect(record.revisions![0]).toEqual({
      revisionNumber: 1,
      changes: "updated logic",
      timestamp: expect.any(String),
      author: "dev",
    });
    expect(record.history).toBeDefined();
    expect(record.history![0].action).toBe("revised");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "revised",
      expect.objectContaining({ actor: "dev" }),
    );
  });

  it("后续修订版本号应递增", async () => {
    const record = createMockRecord({
      revisions: [{ revisionNumber: 1, changes: "v1", timestamp: "t1", author: "a" }],
    });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await createRevision({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      content: "v3",
      changes: "third",
      author: "b",
    });

    expect(result.success).toBe(true);
    expect(result.revisionNumber).toBe(2);
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await createRevision({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
      content: "c",
      changes: "x",
      author: "a",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("修订后内容有严重问题时应将状态置为 quarantined", async () => {
    const record = createMockRecord({ status: "pending" });
    vi.mocked(loadProposal).mockResolvedValue(record);
    vi.mocked(scanSkillContent).mockReturnValue([criticalFinding]);
    vi.mocked(hasCriticalFindings).mockReturnValue(true);

    const result = await createRevision({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      content: "bad",
      changes: "x",
      author: "a",
    });

    expect(result.success).toBe(true);
    expect(record.status).toBe("quarantined");
  });
});

// ============================================================
// reviewProposal
// ============================================================

describe("reviewProposal", () => {
  it("应该成功添加审阅记录", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await reviewProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      reviewer: "reviewer-1",
      status: "approved",
      comments: "looks good",
    });

    expect(result.success).toBe(true);
    expect(record.reviews).toHaveLength(1);
    expect(record.reviews![0]).toEqual({
      reviewer: "reviewer-1",
      reviewAt: expect.any(String),
      status: "approved",
      comments: "looks good",
    });
    expect(record.history).toBeDefined();
    expect(record.history![0].action).toBe("reviewed");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "reviewed",
      expect.objectContaining({ actor: "reviewer-1" }),
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await reviewProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
      reviewer: "r",
      status: "rejected",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });
});

// ============================================================
// quarantineProposal
// ============================================================

describe("quarantineProposal", () => {
  it("应该成功隔离提案", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);
    const updatedRecord = createMockRecord({ status: "quarantined" });
    vi.mocked(updateProposalStatus).mockResolvedValue(updatedRecord);

    const result = await quarantineProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      reason: "security concern",
    });

    expect(result.success).toBe(true);
    expect(updateProposalStatus).toHaveBeenCalledWith(
      WORKSPACE_DIR,
      "proposal-test-1",
      "quarantined",
      "security concern",
    );
    expect(updatedRecord.history).toBeDefined();
    expect(updatedRecord.history![0].action).toBe("quarantined");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "quarantined",
      expect.objectContaining({ reason: "security concern" }),
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await quarantineProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
      reason: "x",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("状态更新失败时应返回错误", async () => {
    const record = createMockRecord();
    vi.mocked(loadProposal).mockResolvedValue(record);
    vi.mocked(updateProposalStatus).mockResolvedValue(null);

    const result = await quarantineProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      reason: "x",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to update proposal status");
  });
});

// ============================================================
// mergeProposal
// ============================================================

describe("mergeProposal", () => {
  it("应该成功合并 pending 提案并写入技能文件", async () => {
    const record = createMockRecord({ status: "pending" });
    vi.mocked(loadProposal).mockResolvedValue(record);
    const updatedRecord = createMockRecord({ status: "applied" });
    vi.mocked(updateProposalStatus).mockResolvedValue(updatedRecord);

    const result = await mergeProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "proposal-test-1",
      reason: "merge it",
    });

    expect(fs.mkdir).toHaveBeenCalledWith(record.target.skillDir, {
      recursive: true,
    });
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(updateProposalStatus).toHaveBeenCalledWith(
      WORKSPACE_DIR,
      "proposal-test-1",
      "applied",
      "merge it",
    );
    expect(result).toHaveProperty("record");
    expect(result).toHaveProperty("targetSkillFile");
    expect(updatedRecord.history![0].action).toBe("merged");
  });

  it("未提供 reason 时应使用默认 Merged", async () => {
    const record = createMockRecord({ status: "pending" });
    vi.mocked(loadProposal).mockResolvedValue(record);
    const updatedRecord = createMockRecord({ status: "applied" });
    vi.mocked(updateProposalStatus).mockResolvedValue(updatedRecord);

    await mergeProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
    });

    expect(updateProposalStatus).toHaveBeenCalledWith(
      WORKSPACE_DIR,
      record.id,
      "applied",
      "Merged",
    );
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await mergeProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("非 pending 状态的提案不能合并", async () => {
    const record = createMockRecord({ status: "rejected" });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await mergeProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot merge proposal with status: rejected");
  });
});

// ============================================================
// rollbackProposal
// ============================================================

describe("rollbackProposal", () => {
  const revisions = [
    { revisionNumber: 1, changes: "v1", timestamp: "t1", author: "a" },
    { revisionNumber: 2, changes: "v2", timestamp: "t2", author: "a" },
    { revisionNumber: 3, changes: "v3", timestamp: "t3", author: "a" },
  ];

  it("应该成功回滚到指定修订版本并截断后续修订", async () => {
    const record = createMockRecord({ revisions: [...revisions] });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await rollbackProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      targetRevision: 2,
      reason: "v3 was broken",
    });

    expect(result.success).toBe(true);
    expect(record.revisions).toHaveLength(2);
    expect(record.revisions!.map((r) => r.revisionNumber)).toEqual([1, 2]);
    expect(record.history).toBeDefined();
    expect(record.history![0].action).toBe("rollback");
    expect(record.history![0].details).toContain("revision 2");
    expect(emitProposalEvent).toHaveBeenCalledWith(
      "updated",
      expect.objectContaining({ reason: "Rollback to revision 2" }),
    );
  });

  it("未指定 targetRevision 时应回滚到最新版本", async () => {
    const record = createMockRecord({ revisions: [...revisions] });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await rollbackProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      reason: "rollback to latest",
    });

    expect(result.success).toBe(true);
    // 回滚到最新（3），不截断
    expect(record.revisions).toHaveLength(3);
  });

  it("提案不存在时应返回失败", async () => {
    vi.mocked(loadProposal).mockResolvedValue(null);

    const result = await rollbackProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: "missing",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Proposal not found");
  });

  it("没有修订记录时应返回失败", async () => {
    const record = createMockRecord({ revisions: [] });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await rollbackProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No revisions available to rollback");
  });

  it("目标修订版本不存在时应返回失败", async () => {
    const record = createMockRecord({ revisions: [...revisions] });
    vi.mocked(loadProposal).mockResolvedValue(record);

    const result = await rollbackProposal({
      workspaceDir: WORKSPACE_DIR,
      proposalId: record.id,
      targetRevision: 99,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Revision 99 not found");
  });
});

// ============================================================
// searchProposals
// ============================================================

describe("searchProposals", () => {
  function makeSearchRecords(): SkillProposalRecord[] {
    return [
      createMockRecord({
        id: "p1",
        title: "Create skill: alpha",
        description: "alpha skill",
        status: "pending",
        kind: "create",
        target: { skillName: "alpha", skillKey: "alpha", skillDir: "", skillFile: "" },
        metadata: { category: "utils", tags: ["core", "fast"] },
      }),
      createMockRecord({
        id: "p2",
        title: "Update skill: beta",
        description: "beta update",
        status: "applied",
        kind: "update",
        target: { skillName: "beta", skillKey: "beta", skillDir: "", skillFile: "" },
        metadata: { category: "io", tags: ["experimental"] },
      }),
      createMockRecord({
        id: "p3",
        title: "Create skill: gamma",
        description: "gamma alpha helper",
        status: "pending",
        kind: "create",
        target: { skillName: "gamma", skillKey: "gamma", skillDir: "", skillFile: "" },
        metadata: { category: "utils", tags: ["core"] },
      }),
    ];
  }

  it("status 过滤应只返回匹配状态的提案", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      status: "pending",
    });

    expect(result.total).toBe(2);
    expect(result.proposals.every((p) => p.status === "pending")).toBe(true);
  });

  it("skillName 过滤应大小写不敏感", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      skillName: "ALPH",
    });

    expect(result.total).toBe(1);
    expect(result.proposals[0].target.skillName).toBe("alpha");
  });

  it("kind 过滤应只返回匹配类型", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      kind: "update",
    });

    expect(result.total).toBe(1);
    expect(result.proposals[0].kind).toBe("update");
  });

  it("query 应匹配标题、描述或技能名", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      query: "alpha",
    });

    // p1 (title + skillName 含 alpha) 和 p3 (description 含 alpha)
    expect(result.total).toBe(2);
  });

  it("category 过滤应基于 metadata.category", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      category: "utils",
    });

    expect(result.total).toBe(2);
    expect(result.proposals.every((p) => p.metadata?.category === "utils")).toBe(true);
  });

  it("tags 过滤应返回包含所有指定标签的提案", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      tags: ["core", "fast"],
    });

    expect(result.total).toBe(1);
    expect(result.proposals[0].id).toBe("p1");
  });

  it("分页应正确切片结果", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      limit: 1,
      offset: 1,
    });

    expect(result.total).toBe(3);
    expect(result.proposals).toHaveLength(1);
  });

  it("listProposals 抛出时应返回空结果而非抛错", async () => {
    vi.mocked(listProposals).mockRejectedValue(new Error("disk error"));

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
    });

    expect(result.total).toBe(0);
    expect(result.proposals).toEqual([]);
  });

  it("组合多个过滤条件", async () => {
    vi.mocked(listProposals).mockResolvedValue(makeSearchRecords());

    const result = await searchProposals({
      workspaceDir: WORKSPACE_DIR,
      status: "pending",
      kind: "create",
      category: "utils",
      tags: ["core"],
    });

    expect(result.total).toBe(2);
  });
});
