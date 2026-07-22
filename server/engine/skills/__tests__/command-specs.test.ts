import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  registerCommandSpec,
  unregisterCommandSpec,
  getCommandSpec,
  getSkillCommands,
  getAllCommandSpecs,
  listCommandCategories,
  addCommandCategory,
  searchCommands,
  validateCommandParams,
  formatCommandHelp,
  clearCommandRegistry,
} from "../discovery/command-specs.js";
import {
  dispatchCommand,
  registerCommandHandler,
  unregisterCommandHandler,
  hasCommandHandler,
  listAvailableCommands,
  clearCommandHandlers,
} from "../discovery/command-dispatch.js";
import type { SkillCommandDispatchSpec, SkillCommandSpec } from "../discovery/command-specs.js";

const testSkillSpec: SkillCommandDispatchSpec = {
  skillName: "test-skill",
  dispatch: "tool",
  commands: [
    {
      command: "search-items",
      description: "搜索项目列表",
      category: "query",
      icon: "🔍",
      examples: [
        "search-items --keyword test",
        "search-items --category books --limit 10",
      ],
      parameters: [
        {
          name: "keyword",
          type: "string",
          description: "搜索关键词",
          required: true,
        },
        {
          name: "category",
          type: "string",
          description: "分类筛选",
          required: false,
          enum: ["books", "electronics", "clothing"],
        },
        {
          name: "limit",
          type: "number",
          description: "结果数量限制",
          required: false,
          default: 20,
        },
        {
          name: "verbose",
          type: "boolean",
          description: "是否显示详细信息",
          required: false,
          default: false,
        },
      ],
      output: {
        type: "json",
        description: "返回匹配的项目列表",
      },
      permissions: ["items:read"],
    },
    {
      command: "create-item",
      description: "创建新项目",
      category: "action",
      examples: [
        "create-item --name 'New Item' --price 99.99",
      ],
      parameters: [
        {
          name: "name",
          type: "string",
          description: "项目名称",
          required: true,
        },
        {
          name: "price",
          type: "number",
          description: "项目价格",
          required: true,
        },
        {
          name: "tags",
          type: "array",
          description: "标签列表",
          required: false,
        },
        {
          name: "metadata",
          type: "object",
          description: "元数据",
          required: false,
        },
      ],
      output: {
        type: "json",
        description: "返回创建的项目",
      },
      permissions: ["items:write"],
    },
    {
      command: "validate-data",
      description: "验证数据格式",
      category: "utility",
      examples: ["validate-data --input data.json"],
      parameters: [
        {
          name: "input",
          type: "string",
          description: "输入文件路径",
          required: true,
        },
      ],
      output: {
        type: "text",
        description: "验证结果",
      },
    },
  ],
};

const adminSkillSpec: SkillCommandDispatchSpec = {
  skillName: "admin-skill",
  dispatch: "chat",
  commands: [
    {
      command: "config-set",
      description: "设置系统配置",
      category: "admin",
      examples: ["config-set --key debug --value true"],
      parameters: [
        {
          name: "key",
          type: "string",
          description: "配置键",
          required: true,
        },
        {
          name: "value",
          type: "string",
          description: "配置值",
          required: true,
        },
      ],
      permissions: ["admin:config"],
    },
  ],
};

describe("command-specs", () => {
  beforeEach(() => {
    clearCommandRegistry();
    clearCommandHandlers();
  });

  describe("registerCommandSpec & getCommandSpec", () => {
    it("应该注册并获取命令规范", () => {
      registerCommandSpec(testSkillSpec);

      const spec = getCommandSpec("test-skill", "search-items");
      expect(spec).toBeDefined();
      expect(spec?.command).toBe("search-items");
      expect(spec?.description).toBe("搜索项目列表");
      expect(spec?.category).toBe("query");
      expect(spec?.parameters).toHaveLength(4);
    });

    it("命令名称不区分大小写", () => {
      registerCommandSpec(testSkillSpec);

      const spec1 = getCommandSpec("test-skill", "SEARCH-ITEMS");
      const spec2 = getCommandSpec("TEST-SKILL", "search-items");
      expect(spec1).toBeDefined();
      expect(spec2).toBeDefined();
    });

    it("获取不存在的命令应该返回 undefined", () => {
      registerCommandSpec(testSkillSpec);
      expect(getCommandSpec("test-skill", "nonexistent")).toBeUndefined();
      expect(getCommandSpec("nonexistent-skill", "search-items")).toBeUndefined();
    });

    it("注册同名技能应该覆盖旧的", () => {
      registerCommandSpec(testSkillSpec);

      const updatedSpec: SkillCommandDispatchSpec = {
        ...testSkillSpec,
        commands: [
          {
            ...testSkillSpec.commands[0],
            description: "更新后的描述",
          },
        ],
      };
      registerCommandSpec(updatedSpec);

      const spec = getCommandSpec("test-skill", "search-items");
      expect(spec?.description).toBe("更新后的描述");
    });
  });

  describe("getSkillCommands", () => {
    it("应该返回技能的所有命令", () => {
      registerCommandSpec(testSkillSpec);
      const commands = getSkillCommands("test-skill");
      expect(commands).toHaveLength(3);
      expect(commands.map((c) => c.command)).toEqual([
        "search-items",
        "create-item",
        "validate-data",
      ]);
    });

    it("不存在的技能应该返回空数组", () => {
      expect(getSkillCommands("nonexistent")).toEqual([]);
    });

    it("返回的应该是副本而非引用", () => {
      registerCommandSpec(testSkillSpec);
      const commands = getSkillCommands("test-skill");
      commands.push({} as SkillCommandSpec);
      expect(getSkillCommands("test-skill")).toHaveLength(3);
    });
  });

  describe("getAllCommandSpecs", () => {
    it("应该返回所有已注册的技能命令规范", () => {
      registerCommandSpec(testSkillSpec);
      registerCommandSpec(adminSkillSpec);

      const all = getAllCommandSpecs();
      expect(all).toHaveLength(2);
      expect(all.map((s) => s.skillName)).toContain("test-skill");
      expect(all.map((s) => s.skillName)).toContain("admin-skill");
    });

    it("清空后应该返回空数组", () => {
      registerCommandSpec(testSkillSpec);
      clearCommandRegistry();
      expect(getAllCommandSpecs()).toHaveLength(0);
    });
  });

  describe("listCommandCategories", () => {
    it("应该返回所有内置分类", () => {
      const categories = listCommandCategories();
      expect(categories.length).toBeGreaterThanOrEqual(4);

      const ids = categories.map((c) => c.id);
      expect(ids).toContain("query");
      expect(ids).toContain("action");
      expect(ids).toContain("utility");
      expect(ids).toContain("admin");
    });

    it("内置分类应该有名称和图标", () => {
      const categories = listCommandCategories();
      const query = categories.find((c) => c.id === "query");
      expect(query?.name).toBeDefined();
      expect(query?.icon).toBeDefined();
    });
  });

  describe("addCommandCategory", () => {
    it("应该可以添加自定义分类", () => {
      addCommandCategory({
        id: "custom",
        name: "自定义",
        description: "自定义分类",
        icon: "🎯",
      });

      const categories = listCommandCategories();
      expect(categories.some((c) => c.id === "custom")).toBe(true);
    });

    it("不能覆盖内置分类", () => {
      addCommandCategory({
        id: "query",
        name: "已覆盖",
        description: "尝试覆盖内置分类",
      });

      const categories = listCommandCategories();
      const query = categories.find((c) => c.id === "query");
      expect(query?.name).not.toBe("已覆盖");
    });
  });

  describe("searchCommands", () => {
    beforeEach(() => {
      registerCommandSpec(testSkillSpec);
      registerCommandSpec(adminSkillSpec);
    });

    it("应该按命令名称搜索", () => {
      const results = searchCommands("search");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((c) => c.command === "search-items")).toBe(true);
    });

    it("应该按描述搜索", () => {
      const results = searchCommands("创建");
      expect(results.some((c) => c.command === "create-item")).toBe(true);
    });

    it("应该按示例搜索", () => {
      const results = searchCommands("data.json");
      expect(results.some((c) => c.command === "validate-data")).toBe(true);
    });

    it("应该按分类过滤", () => {
      const results = searchCommands("", { category: "action" });
      expect(results.every((c) => c.category === "action")).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it("应该按技能名称过滤", () => {
      const results = searchCommands("", { skillName: "admin-skill" });
      expect(results.every(() => true)).toBe(true);
      expect(results.length).toBe(1);
      expect(results[0].command).toBe("config-set");
    });

    it("应该支持 limit 选项", () => {
      const results = searchCommands("", { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("空查询应该返回所有命令", () => {
      const results = searchCommands("");
      expect(results.length).toBeGreaterThan(2);
    });

    it("搜索不区分大小写", () => {
      const results1 = searchCommands("SEARCH");
      const results2 = searchCommands("search");
      expect(results1.length).toBe(results2.length);
    });
  });

  describe("validateCommandParams", () => {
    beforeEach(() => {
      registerCommandSpec(testSkillSpec);
    });

    it("有效参数应该通过验证", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
        category: "books",
        limit: 10,
        verbose: true,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("缺少必需参数应该失败", () => {
      const result = validateCommandParams("test-skill", "search-items", {});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("keyword"))).toBe(true);
    });

    it("类型错误应该失败", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: 123,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("string"))).toBe(true);
    });

    it("number 类型验证", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
        limit: "not-a-number",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("number"))).toBe(true);
    });

    it("boolean 类型验证", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
        verbose: "yes",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("boolean"))).toBe(true);
    });

    it("array 类型验证", () => {
      const result = validateCommandParams("test-skill", "create-item", {
        name: "test",
        price: 10,
        tags: "not-array",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("array"))).toBe(true);
    });

    it("object 类型验证", () => {
      const result = validateCommandParams("test-skill", "create-item", {
        name: "test",
        price: 10,
        metadata: ["not", "object"],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("object"))).toBe(true);
    });

    it("enum 验证", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
        category: "invalid-category",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("one of"))).toBe(true);
    });

    it("未知参数应该报错", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
        unknownParam: "value",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Unknown parameter"))).toBe(true);
    });

    it("不存在的命令应该返回错误", () => {
      const result = validateCommandParams("test-skill", "nonexistent", {});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("not found"))).toBe(true);
    });

    it("可选参数可以省略", () => {
      const result = validateCommandParams("test-skill", "search-items", {
        keyword: "test",
      });
      expect(result.valid).toBe(true);
    });
  });

  describe("formatCommandHelp", () => {
    beforeEach(() => {
      registerCommandSpec(testSkillSpec);
    });

    it("应该格式化帮助文本", () => {
      const help = formatCommandHelp("test-skill", "search-items");
      expect(help).toContain("search-items");
      expect(help).toContain("搜索项目列表");
      expect(help).toContain("参数");
      expect(help).toContain("示例");
      expect(help).toContain("输出");
      expect(help).toContain("权限");
    });

    it("应该包含分类信息", () => {
      const help = formatCommandHelp("test-skill", "search-items");
      expect(help).toContain("查询类");
    });

    it("应该包含参数详情", () => {
      const help = formatCommandHelp("test-skill", "search-items");
      expect(help).toContain("keyword");
      expect(help).toContain("必需");
      expect(help).toContain("string");
    });

    it("应该包含示例代码", () => {
      const help = formatCommandHelp("test-skill", "search-items");
      expect(help).toContain("```");
      expect(help).toContain("search-items --keyword test");
    });

    it("不存在的命令应该返回错误信息", () => {
      const help = formatCommandHelp("test-skill", "nonexistent");
      expect(help).toContain("not found");
    });

    it("没有权限的命令不应该显示权限部分", () => {
      const help = formatCommandHelp("test-skill", "validate-data");
      expect(help).not.toContain("所需权限");
    });
  });

  describe("unregisterCommandSpec", () => {
    it("应该注销已注册的命令规范", () => {
      registerCommandSpec(testSkillSpec);
      expect(getCommandSpec("test-skill", "search-items")).toBeDefined();

      const result = unregisterCommandSpec("test-skill");
      expect(result).toBe(true);
      expect(getCommandSpec("test-skill", "search-items")).toBeUndefined();
    });

    it("注销不存在的技能应该返回 false", () => {
      const result = unregisterCommandSpec("nonexistent");
      expect(result).toBe(false);
    });
  });
});

describe("command-dispatch", () => {
  beforeEach(() => {
    clearCommandRegistry();
    clearCommandHandlers();
    registerCommandSpec(testSkillSpec);
  });

  describe("registerCommandHandler & hasCommandHandler", () => {
    it("应该注册处理器", () => {
      const handler = vi.fn().mockResolvedValue({ success: true, result: "ok" });
      registerCommandHandler("test-skill", "search-items", handler);
      expect(hasCommandHandler("test-skill", "search-items")).toBe(true);
    });

    it("注册不区分大小写", () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      registerCommandHandler("test-skill", "search-items", handler);
      expect(hasCommandHandler("TEST-SKILL", "SEARCH-ITEMS")).toBe(true);
    });
  });

  describe("unregisterCommandHandler", () => {
    it("应该移除已注册的处理器", () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      registerCommandHandler("test-skill", "search-items", handler);
      expect(hasCommandHandler("test-skill", "search-items")).toBe(true);

      const result = unregisterCommandHandler("test-skill", "search-items");
      expect(result).toBe(true);
      expect(hasCommandHandler("test-skill", "search-items")).toBe(false);
    });

    it("移除不存在的处理器不应该报错", () => {
      const result = unregisterCommandHandler("test-skill", "nonexistent");
      expect(result).toBe(false);
    });
  });

  describe("listAvailableCommands", () => {
    it("应该列出所有可用命令", () => {
      registerCommandHandler("test-skill", "search-items", vi.fn());
      registerCommandHandler("test-skill", "create-item", vi.fn());
      registerCommandHandler("admin-skill", "config-set", vi.fn());

      const commands = listAvailableCommands();
      expect(commands.length).toBeGreaterThanOrEqual(2);
    });

    it("应该可以按技能过滤", () => {
      registerCommandHandler("test-skill", "search-items", vi.fn());
      registerCommandHandler("admin-skill", "config-set", vi.fn());

      const commands = listAvailableCommands("test-skill");
      expect(commands).toContain("search-items");
      expect(commands).not.toContain("config-set");
    });

    it("应该返回排序后的列表", () => {
      registerCommandHandler("test-skill", "create-item", vi.fn());
      registerCommandHandler("test-skill", "search-items", vi.fn());
      registerCommandHandler("test-skill", "validate-data", vi.fn());

      const commands = listAvailableCommands("test-skill");
      const sorted = [...commands].sort();
      expect(commands).toEqual(sorted);
    });
  });

  describe("dispatchCommand", () => {
    it("应该分派到已注册的处理器", async () => {
      const handler = vi.fn().mockResolvedValue({
        success: true,
        result: { items: [] },
      });
      registerCommandHandler("test-skill", "search-items", handler);

      const response = await dispatchCommand({
        skillName: "test-skill",
        command: "search-items",
        params: { keyword: "test" },
      });

      expect(response.success).toBe(true);
      expect(response.result).toEqual({ items: [] });
      expect(response.command).toBe("search-items");
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          skillName: "test-skill",
          command: "search-items",
          params: { keyword: "test" },
        }),
      );
    });

    it("应该传递 context", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      registerCommandHandler("test-skill", "search-items", handler);

      const context = { userId: "123", role: "admin" };
      await dispatchCommand({
        skillName: "test-skill",
        command: "search-items",
        params: { keyword: "test" },
        context,
      });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ context }),
      );
    });

    it("未注册的命令应该返回错误", async () => {
      const response = await dispatchCommand({
        skillName: "test-skill",
        command: "nonexistent",
        params: {},
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.command).toBe("nonexistent");
    });

    it("参数验证失败应该返回错误", async () => {
      const handler = vi.fn().mockResolvedValue({ success: true });
      registerCommandHandler("test-skill", "search-items", handler);

      const response = await dispatchCommand({
        skillName: "test-skill",
        command: "search-items",
        params: {},
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain("validation failed");
      expect(handler).not.toHaveBeenCalled();
    });

    it("处理器抛出异常应该返回错误", async () => {
      const handler = vi.fn().mockRejectedValue(new Error("something went wrong"));
      registerCommandHandler("test-skill", "search-items", handler);

      const response = await dispatchCommand({
        skillName: "test-skill",
        command: "search-items",
        params: { keyword: "test" },
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain("something went wrong");
    });

    it("同步处理器也应该正常工作", async () => {
      const handler = vi.fn().mockReturnValue({ success: true, result: "sync-result" });
      registerCommandHandler("test-skill", "search-items", handler);

      const response = await dispatchCommand({
        skillName: "test-skill",
        command: "search-items",
        params: { keyword: "test" },
      });

      expect(response.success).toBe(true);
      expect(response.result).toBe("sync-result");
    });
  });
});

describe("分类管理集成测试", () => {
  beforeEach(() => {
    clearCommandRegistry();
    clearCommandHandlers();
  });

  it("四个内置分类应该都存在", () => {
    const categories = listCommandCategories();
    const ids = categories.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(["query", "action", "utility", "admin"]));
  });

  it("命令应该正确关联到分类", () => {
    registerCommandSpec(testSkillSpec);

    const queryCommands = searchCommands("", { category: "query" });
    const actionCommands = searchCommands("", { category: "action" });
    const utilityCommands = searchCommands("", { category: "utility" });

    expect(queryCommands.some((c) => c.command === "search-items")).toBe(true);
    expect(actionCommands.some((c) => c.command === "create-item")).toBe(true);
    expect(utilityCommands.some((c) => c.command === "validate-data")).toBe(true);
  });

  it("管理类命令应该在 admin 分类中", () => {
    registerCommandSpec(adminSkillSpec);

    const adminCommands = searchCommands("", { category: "admin" });
    expect(adminCommands.some((c) => c.command === "config-set")).toBe(true);
  });
});
