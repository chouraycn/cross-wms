/**
 * wiki 命令
 * Wiki 管理 (list/search/view/create)
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type WikiOptions = {
  json?: boolean;
};

/** Wiki 条目 */
interface WikiItem {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
}

/** 模拟 Wiki 存储 */
const WIKI_STORE: Map<string, WikiItem> = new Map([
  [
    "wiki-001",
    {
      id: "wiki-001",
      title: "React 组件开发最佳实践",
      content:
        "## React 组件开发最佳实践\n\n### 1. 组件命名\n使用 PascalCase 命名组件\n\n### 2. Props 定义\n使用 TypeScript interface 定义 Props\n\n### 3. 状态管理\n- 使用 useState 管理本地状态\n- 使用 Context 或 Redux 管理全局状态\n\n### 4. 性能优化\n- 使用 React.memo 避免不必要的重渲染\n- 使用 useMemo 和 useCallback 优化计算和回调",
      category: "development",
      tags: ["react", "best-practices", "frontend"],
      author: "system",
      createdAt: "2025-01-10T08:00:00Z",
      updatedAt: "2025-01-12T14:30:00Z",
    },
  ],
  [
    "wiki-002",
    {
      id: "wiki-002",
      title: "TypeScript 配置指南",
      content:
        "## TypeScript 配置指南\n\n### tsconfig.json 基础配置\n\n```json\n{\n  \"compilerOptions\": {\n    \"target\": \"ES2020\",\n    \"module\": \"ESNext\",\n    \"moduleResolution\": \"bundler\",\n    \"strict\": true,\n    \"esModuleInterop\": true\n  }\n}\n```\n\n### 类型定义安装\n使用 `npm install @types/package-name` 安装类型定义",
      category: "configuration",
      tags: ["typescript", "configuration", "guide"],
      author: "system",
      createdAt: "2025-01-11T10:00:00Z",
      updatedAt: "2025-01-11T10:00:00Z",
    },
  ],
  [
    "wiki-003",
    {
      id: "wiki-003",
      title: "Git 分支管理策略",
      content:
        "## Git 分支管理策略\n\n### 主分支\n- `main`: 生产环境代码\n- `develop`: 开发环境代码\n\n### 功能分支\n命名规则: `feature/description`\n\n### 修复分支\n命名规则: `fix/description`\n\n### 发布流程\n1. 从 develop 创建 release 分支\n2. 测试并合并到 main\n3. 打 tag 标记版本",
      category: "workflow",
      tags: ["git", "workflow", "branch"],
      author: "system",
      createdAt: "2025-01-13T15:00:00Z",
      updatedAt: "2025-01-13T15:00:00Z",
    },
  ],
]);

/** 获取所有 Wiki 条目 */
function getAllWikis(): WikiItem[] {
  return Array.from(WIKI_STORE.values()).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** 搜索 Wiki */
function searchWikis(query: string): WikiItem[] {
  const lowerQuery = query.toLowerCase();
  return getAllWikis().filter(
    (item) =>
      item.title.toLowerCase().includes(lowerQuery) ||
      item.content.toLowerCase().includes(lowerQuery) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
      item.category.toLowerCase().includes(lowerQuery)
  );
}

/** 获取 Wiki 详情 */
function getWikiById(id: string): WikiItem | undefined {
  return WIKI_STORE.get(id);
}

/** 创建 Wiki */
function createWiki(title: string, content: string = "", category: string = "general", tags: string[] = []): WikiItem {
  const id = `wiki-${Date.now()}`;
  const now = new Date().toISOString();
  const item: WikiItem = {
    id,
    title,
    content,
    category,
    tags,
    author: "user",
    createdAt: now,
    updatedAt: now,
  };
  WIKI_STORE.set(id, item);
  return item;
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化 Wiki 列表文本输出 */
function formatWikiList(wikis: WikiItem[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  Wiki 条目 (共 ${wikis.length} 条):`);
  lines.push("");
  for (const wiki of wikis) {
    const tags = wiki.tags.length > 0 ? ` [${wiki.tags.join(", ")}]` : "";
    lines.push(`  ${wiki.id}: ${wiki.title}`);
    lines.push(`    分类: ${wiki.category}${tags}`);
    lines.push(`    更新: ${new Date(wiki.updatedAt).toLocaleString("zh-CN")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 格式化 Wiki 详情文本输出 */
function formatWikiView(wiki: WikiItem | undefined): string {
  if (!wiki) {
    return "Wiki 条目不存在";
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  ${wiki.title}`);
  lines.push("");
  lines.push(`  ID: ${wiki.id}`);
  lines.push(`  分类: ${wiki.category}`);
  lines.push(`  标签: ${wiki.tags.length > 0 ? wiki.tags.join(", ") : "无"}`);
  lines.push(`  作者: ${wiki.author}`);
  lines.push(`  创建: ${new Date(wiki.createdAt).toLocaleString("zh-CN")}`);
  lines.push(`  更新: ${new Date(wiki.updatedAt).toLocaleString("zh-CN")}`);
  lines.push("");
  lines.push("  内容:");
  lines.push("");
  lines.push(wiki.content);
  lines.push("");
  return lines.join("\n");
}

/** 格式化搜索结果文本输出 */
function formatSearchResult(query: string, wikis: WikiItem[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  搜索 "${query}" 找到 ${wikis.length} 条 Wiki:`);
  lines.push("");
  for (const wiki of wikis) {
    const tags = wiki.tags.length > 0 ? ` [${wiki.tags.join(", ")}]` : "";
    lines.push(`  ${wiki.id}: ${wiki.title} (${wiki.category})${tags}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化创建 Wiki 文本输出 */
function formatCreateWiki(wiki: WikiItem): string {
  return `已创建 Wiki ${wiki.id}: ${wiki.title}`;
}

/**
 * 注册 wiki 命令
 */
export function registerWikiCommand(program: Command): void {
  const wikiCmd = program
    .command("wiki")
    .description("Wiki 管理 (list/search/view/create)");

  // list 子命令
  wikiCmd
    .command("list")
    .description("列出 Wiki 条目")
    .option("--json", "JSON 输出格式")
    .action((options: WikiOptions) => {
      const wikis = getAllWikis();
      if (options.json) {
        logger.info(formatJsonOutput(wikis));
      } else {
        logger.info(formatWikiList(wikis));
      }
    });

  // search 子命令
  wikiCmd
    .command("search <query>")
    .description("搜索 Wiki")
    .option("--json", "JSON 输出格式")
    .action((query: string, options: WikiOptions) => {
      const wikis = searchWikis(query);
      if (options.json) {
        logger.info(formatJsonOutput({ query, results: wikis, count: wikis.length }));
      } else {
        logger.info(formatSearchResult(query, wikis));
      }
    });

  // view 子命令
  wikiCmd
    .command("view <id>")
    .description("查看条目内容")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: WikiOptions) => {
      const wiki = getWikiById(id);
      if (options.json) {
        logger.info(formatJsonOutput(wiki ?? { id, error: "not_found" }));
      } else {
        logger.info(formatWikiView(wiki));
      }
    });

  // create 子命令
  wikiCmd
    .command("create <title>")
    .description("创建新条目")
    .option("-c, --content <content>", "条目内容")
    .option("--category <category>", "分类", "general")
    .option("-t, --tags <tags>", "标签 (逗号分隔)")
    .option("--json", "JSON 输出格式")
    .action((title: string, options: WikiOptions & { content?: string; category?: string; tags?: string }) => {
      const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : [];
      const wiki = createWiki(
        title,
        options.content || "",
        options.category || "general",
        tags
      );
      if (options.json) {
        logger.info(formatJsonOutput(wiki));
      } else {
        logger.info(formatCreateWiki(wiki));
      }
    });

  // 默认 list 子命令
  wikiCmd.action((options: WikiOptions) => {
    const wikis = getAllWikis();
    if (options.json) {
      logger.info(formatJsonOutput(wikis));
    } else {
      logger.info(formatWikiList(wikis));
    }
  });
}