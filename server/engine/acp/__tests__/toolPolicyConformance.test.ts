import { describe, it, expect } from "vitest";
import {
  POLICY_TOOL_GROUPS,
  getToolGroups,
  getToolsInGroup,
  getGroupsForTool,
  isToolInGroup,
  validateToolGroupId,
} from "../toolPolicyConformance.js";

describe("ToolPolicyConformance", () => {
  describe("getToolGroups", () => {
    it("should return all tool group ids", () => {
      const groups = getToolGroups();
      expect(groups).toHaveLength(Object.keys(POLICY_TOOL_GROUPS).length);
      expect(groups).toContain("group:openclaw");
      expect(groups).toContain("group:fs");
      expect(groups).toContain("group:runtime");
    });
  });

  describe("getToolsInGroup", () => {
    it("should return tools in group:fs", () => {
      const tools = getToolsInGroup("group:fs");
      expect(tools).toEqual(["read", "write", "edit", "apply_patch"]);
    });

    it("should return tools in group:runtime", () => {
      const tools = getToolsInGroup("group:runtime");
      expect(tools).toEqual(["exec", "process", "code_execution"]);
    });

    it("should return empty array for unknown group", () => {
      const tools = getToolsInGroup("group:unknown" as any);
      expect(tools).toEqual([]);
    });
  });

  describe("getGroupsForTool", () => {
    it("should return groups for code_execution", () => {
      const groups = getGroupsForTool("code_execution");
      expect(groups).toContain("group:openclaw");
      expect(groups).toContain("group:runtime");
    });

    it("should return groups for web_search", () => {
      const groups = getGroupsForTool("web_search");
      expect(groups).toContain("group:openclaw");
      expect(groups).toContain("group:web");
    });

    it("should return empty array for unknown tool", () => {
      const groups = getGroupsForTool("unknown_tool");
      expect(groups).toEqual([]);
    });
  });

  describe("isToolInGroup", () => {
    it("should return true for tool in group", () => {
      expect(isToolInGroup("exec", "group:runtime")).toBe(true);
      expect(isToolInGroup("read", "group:fs")).toBe(true);
    });

    it("should return false for tool not in group", () => {
      expect(isToolInGroup("exec", "group:fs")).toBe(false);
      expect(isToolInGroup("read", "group:runtime")).toBe(false);
    });

    it("should return false for unknown group", () => {
      expect(isToolInGroup("exec", "group:unknown" as any)).toBe(false);
    });
  });

  describe("validateToolGroupId", () => {
    it("should return true for valid group ids", () => {
      expect(validateToolGroupId("group:fs")).toBe(true);
      expect(validateToolGroupId("group:runtime")).toBe(true);
      expect(validateToolGroupId("group:openclaw")).toBe(true);
    });

    it("should return false for invalid group ids", () => {
      expect(validateToolGroupId("invalid")).toBe(false);
      expect(validateToolGroupId("group:unknown")).toBe(false);
      expect(validateToolGroupId("")).toBe(false);
    });
  });
});