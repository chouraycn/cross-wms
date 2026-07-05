/**
 * LSP Manager (模拟实现 / Mock Implementation)
 *
 * ⚠️ 注意：本文件中的 `LspManager` 类及其方法（getCompletion / getDefinition /
 * getHover / getDiagnostics / startServer 等）均为**模拟实现**，
 * 返回硬编码的占位数据（参见 `simulateServerStart`、`模拟补全结果`、
 * `模拟生成诊断` 等注释标记），不与真实 LSP 服务器通信。
 *
 * ✅ 真实实现请使用 `./lspClient.ts`：
 *    - `getLspClientManager()` 返回的 `LSPClientManager` 实例
 *    - `LSPClient` 类封装了真实的 LSP JSON-RPC 通信
 *    - `lspTools.ts` 已通过 `getLspClientManager()` 调用真实实现
 *
 * 本文件目前仅作为**类型定义来源**（`LspServerConfig`、`LspLanguage`、
 * `LspServerStatus` 等）被 `lspClient.ts` / `lspServerRegistry.ts` /
 * `lspTypes.ts` 引用。运行时 LSP 功能不应依赖此文件中的 `LspManager` 类。
 *
 * 如需扩展 LSP 功能，请修改 `lspClient.ts` 而非本文件。
 */

export type LspServerStatus = "stopped" | "starting" | "running" | "stopping" | "error";
export type LspLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "json"
  | "yaml"
  | "html"
  | "css"
  | "markdown"
  | "go"
  | "rust"
  | "java";

export interface LspServerConfig {
  id: string;
  name: string;
  language: LspLanguage;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  initializationOptions?: Record<string, unknown>;
  capabilities?: string[];
  fileExtensions: string[];
}

export interface LspServerInstance {
  id: string;
  config: LspServerConfig;
  status: LspServerStatus;
  pid?: number;
  startedAt?: number;
  stoppedAt?: number;
  lastActiveAt?: number;
  totalRequests: number;
  activeRequests: number;
  errorCount: number;
  errorMessage?: string;
  serverInfo?: {
    name: string;
    version: string;
  };
  capabilities?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface LspDocument {
  uri: string;
  languageId: string;
  version: number;
  content: string;
  dirty: boolean;
  lastOpenedAt: number;
  lastModifiedAt: number;
}

export interface LspDiagnostic {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: 1 | 2 | 3 | 4;
  message: string;
  source?: string;
  code?: string;
  relatedInformation?: Array<{
    location: { uri: string; range: LspDiagnostic["range"] };
    message: string;
  }>;
}

export interface LspCompletionItem {
  label: string;
  kind: number;
  detail?: string;
  documentation?: string;
  insertText?: string;
  sortText?: string;
  filterText?: string;
  preselect?: boolean;
}

export interface LspDefinition {
  uri: string;
  range: LspDiagnostic["range"];
  originSelectionRange?: LspDiagnostic["range"];
}

export interface LspHover {
  contents: string | { kind: string; value: string };
  range?: LspDiagnostic["range"];
}

/**
 * ⚠️ 模拟实现 — 不与真实 LSP 服务器通信。
 * 真实实现见 `./lspClient.ts` 中的 `LSPClient` / `LSPClientManager`。
 * 详见文件头部说明。
 */
class LspManager {
  private readonly servers = new Map<string, LspServerInstance>();
  private readonly documents = new Map<string, LspDocument>();
  private readonly diagnostics = new Map<string, LspDiagnostic[]>();
  private readonly defaultServers: LspServerConfig[];

  constructor() {
    this.defaultServers = this.getDefaultServers();
  }

  private getDefaultServers(): LspServerConfig[] {
    return [
      {
        id: "typescript-language-server",
        name: "TypeScript Language Server",
        language: "typescript",
        command: "typescript-language-server",
        args: ["--stdio"],
        fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
        capabilities: [
          "completion",
          "definition",
          "hover",
          "references",
          "rename",
          "formatting",
          "diagnostics",
          "codeAction",
          "signatureHelp",
        ],
      },
      {
        id: "pyright",
        name: "Pyright",
        language: "python",
        command: "pyright-langserver",
        args: ["--stdio"],
        fileExtensions: [".py"],
        capabilities: [
          "completion",
          "definition",
          "hover",
          "references",
          "diagnostics",
          "codeAction",
          "signatureHelp",
        ],
      },
      {
        id: "json-languageservice",
        name: "JSON Language Service",
        language: "json",
        command: "vscode-json-languageserver",
        args: ["--stdio"],
        fileExtensions: [".json", ".jsonc"],
        capabilities: [
          "completion",
          "hover",
          "diagnostics",
          "formatting",
        ],
      },
      {
        id: "yaml-language-server",
        name: "YAML Language Server",
        language: "yaml",
        command: "yaml-language-server",
        args: ["--stdio"],
        fileExtensions: [".yml", ".yaml"],
        capabilities: [
          "completion",
          "hover",
          "diagnostics",
          "formatting",
        ],
      },
    ];
  }

  // ========== Server Management ==========

  getAvailableServers(): LspServerConfig[] {
    return [...this.defaultServers];
  }

  async startServer(config: LspServerConfig): Promise<LspServerInstance> {
    if (this.servers.has(config.id)) {
      const existing = this.servers.get(config.id)!;
      if (existing.status === "running" || existing.status === "starting") {
        return existing;
      }
    }

    const instance: LspServerInstance = {
      id: config.id,
      config,
      status: "starting",
      totalRequests: 0,
      activeRequests: 0,
      errorCount: 0,
    };

    this.servers.set(config.id, instance);

    try {
      await this.simulateServerStart(instance);
      instance.status = "running";
      instance.startedAt = Date.now();
      instance.lastActiveAt = Date.now();
      instance.pid = Math.floor(Math.random() * 60000) + 1000;
      instance.serverInfo = {
        name: config.name,
        version: "1.0.0",
      };
      instance.capabilities = this.buildCapabilities(config);
    } catch (error) {
      instance.status = "error";
      instance.errorMessage = error instanceof Error ? error.message : String(error);
      this.servers.set(config.id, instance);
      throw error;
    }

    this.servers.set(config.id, instance);
    return instance;
  }

  private async simulateServerStart(instance: LspServerInstance): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  private buildCapabilities(config: LspServerConfig): Record<string, unknown> {
    const caps: Record<string, unknown> = {};
    for (const cap of config.capabilities ?? []) {
      caps[cap] = true;
    }
    return caps;
  }

  async stopServer(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) return false;

    if (server.status === "stopped") return true;

    server.status = "stopping";
    this.servers.set(serverId, server);

    await new Promise((resolve) => setTimeout(resolve, 100));

    server.status = "stopped";
    server.stoppedAt = Date.now();
    this.servers.set(serverId, server);

    return true;
  }

  getServer(serverId: string): LspServerInstance | undefined {
    return this.servers.get(serverId);
  }

  listServers(status?: LspServerStatus): LspServerInstance[] {
    let servers = Array.from(this.servers.values());
    if (status) {
      servers = servers.filter((s) => s.status === status);
    }
    return servers.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  }

  getServerForFile(filePath: string): LspServerInstance | undefined {
    const extension = "." + filePath.split(".").pop()?.toLowerCase();
    for (const server of this.servers.values()) {
      if (
        server.status === "running" &&
        server.config.fileExtensions.some((ext) => ext.toLowerCase() === extension)
      ) {
        return server;
      }
    }
    return undefined;
  }

  // ========== Document Management ==========

  openDocument(uri: string, content: string, languageId: string): LspDocument {
    const existing = this.documents.get(uri);
    if (existing) {
      existing.version++;
      existing.content = content;
      existing.lastOpenedAt = Date.now();
      existing.lastModifiedAt = Date.now();
      existing.dirty = true;
      this.documents.set(uri, existing);
      return existing;
    }

    const doc: LspDocument = {
      uri,
      languageId,
      version: 1,
      content,
      dirty: true,
      lastOpenedAt: Date.now(),
      lastModifiedAt: Date.now(),
    };

    this.documents.set(uri, doc);
    return doc;
  }

  updateDocument(uri: string, content: string, version?: number): LspDocument | undefined {
    const doc = this.documents.get(uri);
    if (!doc) return undefined;

    doc.content = content;
    doc.version = version ?? doc.version + 1;
    doc.lastModifiedAt = Date.now();
    doc.dirty = true;
    this.documents.set(uri, doc);

    return doc;
  }

  closeDocument(uri: string): boolean {
    this.diagnostics.delete(uri);
    return this.documents.delete(uri);
  }

  getDocument(uri: string): LspDocument | undefined {
    return this.documents.get(uri);
  }

  listDocuments(): LspDocument[] {
    return Array.from(this.documents.values()).sort((a, b) => b.lastModifiedAt - a.lastModifiedAt);
  }

  // ========== LSP Features ==========

  async getCompletion(
    uri: string,
    position: { line: number; character: number },
  ): Promise<LspCompletionItem[]> {
    const doc = this.documents.get(uri);
    if (!doc) return [];

    const server = this.getServerForFile(uri);
    if (!server || server.status !== "running") return [];

    server.totalRequests++;
    server.activeRequests++;
    server.lastActiveAt = Date.now();
    this.servers.set(server.id, server);

    // 模拟补全结果
    const line = doc.content.split("\n")[position.line] || "";
    const prefix = line.slice(0, position.character);
    const lastWord = prefix.split(/\s+/).pop() || "";

    const completions: LspCompletionItem[] = [
      { label: lastWord + "Item", kind: 5, detail: "string" },
      { label: lastWord + "Method", kind: 2, detail: "function" },
      { label: lastWord + "Class", kind: 7, detail: "class" },
      { label: lastWord + "Constant", kind: 21, detail: "const" },
      { label: lastWord + "Variable", kind: 6, detail: "var" },
    ];

    server.activeRequests--;
    this.servers.set(server.id, server);

    return completions;
  }

  async getDefinition(
    uri: string,
    position: { line: number; character: number },
  ): Promise<LspDefinition[]> {
    const doc = this.documents.get(uri);
    if (!doc) return [];

    const server = this.getServerForFile(uri);
    if (!server || server.status !== "running") return [];

    server.totalRequests++;
    server.lastActiveAt = Date.now();
    this.servers.set(server.id, server);

    return [
      {
        uri,
        range: {
          start: { line: Math.max(0, position.line - 5), character: 0 },
          end: { line: Math.max(0, position.line - 5), character: 50 },
        },
      },
    ];
  }

  async getHover(
    uri: string,
    position: { line: number; character: number },
  ): Promise<LspHover | null> {
    const doc = this.documents.get(uri);
    if (!doc) return null;

    const server = this.getServerForFile(uri);
    if (!server || server.status !== "running") return null;

    server.totalRequests++;
    server.lastActiveAt = Date.now();
    this.servers.set(server.id, server);

    const line = doc.content.split("\n")[position.line] || "";
    const word = line.split(/\s+/).find((w) => w.length > 0) || "symbol";

    return {
      contents: {
        kind: "markdown",
        value: `**${word}**\n\n类型: \`string\`\n\n这是一个示例悬停文档。`,
      },
    };
  }

  async getDiagnostics(uri: string): Promise<LspDiagnostic[]> {
    const doc = this.documents.get(uri);
    if (!doc) return [];

    // 从缓存获取
    const cached = this.diagnostics.get(uri);
    if (cached) return cached;

    // 模拟生成诊断
    const diagnostics: LspDiagnostic[] = [];

    // 模拟一些常见的诊断
    const lines = doc.content.split("\n");
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const line = lines[i];
      if (line.includes("TODO") || line.includes("FIXME")) {
        diagnostics.push({
          uri,
          range: {
            start: { line: i, character: line.indexOf("TODO") },
            end: { line: i, character: line.indexOf("TODO") + 4 },
          },
          severity: 3,
          message: line.trim(),
          source: "lsp",
        });
      }
    }

    this.diagnostics.set(uri, diagnostics);
    return diagnostics;
  }

  // ========== Stats ==========

  getStats(): {
    totalServers: number;
    runningServers: number;
    stoppedServers: number;
    errorServers: number;
    openDocuments: number;
    totalRequests: number;
    totalDiagnostics: number;
    errorsBySeverity: { error: number; warning: number; info: number; hint: number };
  } {
    const servers = Array.from(this.servers.values());
    const allDiagnostics = Array.from(this.diagnostics.values()).flat();

    return {
      totalServers: servers.length,
      runningServers: servers.filter((s) => s.status === "running").length,
      stoppedServers: servers.filter((s) => s.status === "stopped").length,
      errorServers: servers.filter((s) => s.status === "error").length,
      openDocuments: this.documents.size,
      totalRequests: servers.reduce((sum, s) => sum + s.totalRequests, 0),
      totalDiagnostics: allDiagnostics.length,
      errorsBySeverity: {
        error: allDiagnostics.filter((d) => d.severity === 1).length,
        warning: allDiagnostics.filter((d) => d.severity === 2).length,
        info: allDiagnostics.filter((d) => d.severity === 3).length,
        hint: allDiagnostics.filter((d) => d.severity === 4).length,
      },
    };
  }

  // ========== 工作区配置和项目检测（v7.0 新增） ==========

  /**
   * 检测项目类型
   * 根据工作区文件判断项目类型和推荐的语言服务器
   */
  async detectProject(workspaceRoot: string): Promise<{
    type: LspLanguage | "mixed" | "unknown";
    configFiles: string[];
    recommendedServers: string[];
    dependenciesInstalled: boolean;
  }> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const configFiles: string[] = [];
    const recommendedServers: string[] = [];
    let dependenciesInstalled = false;

    try {
      // 检测 TypeScript/JavaScript 项目
      const tsconfig = path.join(workspaceRoot, "tsconfig.json");
      const packageJson = path.join(workspaceRoot, "package.json");

      try {
        await fs.access(tsconfig);
        configFiles.push("tsconfig.json");
        recommendedServers.push("typescript-language-server");
      } catch {}

      try {
        await fs.access(packageJson);
        configFiles.push("package.json");

        // 检查 node_modules 是否存在
        const nodeModules = path.join(workspaceRoot, "node_modules");
        try {
          await fs.access(nodeModules);
          dependenciesInstalled = true;
        } catch {}

        // 如果没有 tsconfig.json，但有 package.json，也可能是 JS 项目
        if (!configFiles.includes("tsconfig.json")) {
          recommendedServers.push("typescript-language-server");
        }
      } catch {}

      // 检测 Python 项目
      const pyprojectToml = path.join(workspaceRoot, "pyproject.toml");
      const setupPy = path.join(workspaceRoot, "setup.py");
      const requirementsTxt = path.join(workspaceRoot, "requirements.txt");

      try {
        await fs.access(pyprojectToml);
        configFiles.push("pyproject.toml");
        recommendedServers.push("pyright");
      } catch {}

      try {
        await fs.access(setupPy);
        configFiles.push("setup.py");
        if (!recommendedServers.includes("pyright")) {
          recommendedServers.push("pyright");
        }
      } catch {}

      try {
        await fs.access(requirementsTxt);
        configFiles.push("requirements.txt");
        if (!recommendedServers.includes("pyright")) {
          recommendedServers.push("pyright");
        }
      } catch {}

      // 检测 Go 项目
      const goMod = path.join(workspaceRoot, "go.mod");
      try {
        await fs.access(goMod);
        configFiles.push("go.mod");
        recommendedServers.push("gopls");
      } catch {}

      // 检测 Rust 项目
      const cargoToml = path.join(workspaceRoot, "Cargo.toml");
      try {
        await fs.access(cargoToml);
        configFiles.push("Cargo.toml");
        recommendedServers.push("rust-analyzer");
      } catch {}

      // 检测 Java 项目
      const pomXml = path.join(workspaceRoot, "pom.xml");
      const buildGradle = path.join(workspaceRoot, "build.gradle");
      const buildGradleKts = path.join(workspaceRoot, "build.gradle.kts");

      try {
        await fs.access(pomXml);
        configFiles.push("pom.xml");
        recommendedServers.push("jdtls");
      } catch {}

      try {
        await fs.access(buildGradle);
        configFiles.push("build.gradle");
        if (!recommendedServers.includes("jdtls")) {
          recommendedServers.push("jdtls");
        }
      } catch {}

      try {
        await fs.access(buildGradleKts);
        configFiles.push("build.gradle.kts");
        if (!recommendedServers.includes("jdtls")) {
          recommendedServers.push("jdtls");
        }
      } catch {}

      // 判断项目类型
      let type: LspLanguage | "mixed" | "unknown" = "unknown";

      if (recommendedServers.length === 1) {
        const serverId = recommendedServers[0];
        if (serverId === "typescript-language-server") type = "typescript";
        else if (serverId === "pyright") type = "python";
        else if (serverId === "gopls") type = "go";
        else if (serverId === "rust-analyzer") type = "rust";
        else if (serverId === "jdtls") type = "java";
      } else if (recommendedServers.length > 1) {
        type = "mixed";
      }

      return {
        type,
        configFiles,
        recommendedServers,
        dependenciesInstalled,
      };
    } catch (error) {
      return {
        type: "unknown",
        configFiles: [],
        recommendedServers: [],
        dependenciesInstalled: false,
      };
    }
  }

  /**
   * 获取工作区配置
   */
  getWorkspaceConfig(workspaceRoot: string): {
    rootPath: string;
    rootUri: string;
    projectType?: LspLanguage | "mixed" | "unknown";
    activeServers: string[];
  } {
    const runningServers = this.listServers("running").map((s) => s.id);

    return {
      rootPath: workspaceRoot,
      rootUri: `file://${workspaceRoot}`,
      activeServers: runningServers,
    };
  }

  /**
   * 根据项目检测自动启动推荐的语言服务器
   */
  async autoStartForWorkspace(workspaceRoot: string): Promise<string[]> {
    const detection = await this.detectProject(workspaceRoot);
    const startedServers: string[] = [];

    for (const serverId of detection.recommendedServers) {
      const config = this.defaultServers.find((s) => s.id === serverId);
      if (config) {
        try {
          await this.startServer(config);
          startedServers.push(serverId);
        } catch (error) {
          // 启动失败，跳过
        }
      }
    }

    return startedServers;
  }

  clear(): void {
    for (const server of this.servers.values()) {
      if (server.status === "running" || server.status === "starting") {
        this.stopServer(server.id).catch(() => {});
      }
    }
    this.servers.clear();
    this.documents.clear();
    this.diagnostics.clear();
  }
}

const LSP_INSTANCE = new LspManager();

export function getLspManager(): LspManager {
  return LSP_INSTANCE;
}

export async function startLspServer(config: LspServerConfig): Promise<LspServerInstance> {
  return LSP_INSTANCE.startServer(config);
}

export function getLspCompletion(
  uri: string,
  position: { line: number; character: number },
): Promise<LspCompletionItem[]> {
  return LSP_INSTANCE.getCompletion(uri, position);
}

export function resetLspManagerForTests(): void {
  LSP_INSTANCE.clear();
}

export type { LspManager };
