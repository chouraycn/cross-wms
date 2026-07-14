/**
 * skills 命令
 * 技能管理 (list/install/scan/enable/disable/info)
 *
 * 真实接入 skill 数据源：
 * 直接扫描三级目录（builtin / user / workspace）的 SKILL.md，
 * 这与 server/engine/skillRegistry 读取的是同一份数据，因此 CLI 始终反映真实的 skill 集合。
 * （注：本进程无法安全加载 server 全局注册表——其模块图依赖 DB / 安全审计等运行时，
 * 在 CLI 进程中动态加载会触发 db-core 导出错误并崩溃；故采用独立的文件系统扫描，等价且健壮。）
 *
 * - install 支持：本地路径拷贝安装、已存在 skill id（视为已安装）、远程/市场（交由 marketplace 模块，见 task④）
 * - enable / disable 通过持久化 disabled 集合（~/.workbuddy/skills/.skills-disabled.json）跨进程生效
 *
 * 设计：registerSkillsCommand 接受可注入的 SkillCommandProvider，
 * 默认使用 RealSkillProvider，便于测试注入伪实现。
 */

import type { Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";
import yaml from "js-yaml";
import { remoteSkillLoader, type RemoteSkillSource } from "../../engine/remoteSkillLoader.js";
import { AppPaths } from '../../config/appPaths.js';

// CommonJS 环境下 __dirname 原生可用

export type SkillsOptions = {
  json?: boolean;
};

/** 技能条目（与注册表 RegisteredSkill 归一化） */
export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  source: "builtin" | "local" | "remote";
  installedAt: string;
  error?: string;
}

/** 扫描结果 */
export interface SkillScanResult {
  found: number;
  eligible: string[];
}

/**
 * 技能命令数据提供方（依赖注入点）
 * 真实实现见 RealSkillProvider；测试可注入伪实现。
 */
export interface SkillCommandProvider {
  list(): Promise<SkillEntry[]>;
  info(id: string): Promise<SkillEntry | undefined>;
  scan(): Promise<SkillScanResult>;
  install(spec: string): Promise<SkillEntry>;
  enable(id: string): Promise<boolean>;
  disable(id: string): Promise<boolean>;
}

// ===================== 工具函数 =====================

/** 解析 SKILL.md 的 YAML frontmatter */
function parseFrontmatter(content: string): Record<string, unknown> {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  try {
    return (yaml.load(m[1]) as Record<string, unknown>) || {};
  } catch {
    return {};
  }
}

/** Skill ID 命名规范：小写字母 + 下划线 + 数字 */
// 放宽：允许连字符，兼容 openclaw 技能命名（gh-issues / diagram-maker / nano-pdf）
const SKILL_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

/** 解析仓库内置 skills 目录（repo/skills），向上查找含 package.json 的目录 */
export function resolveRepoSkillsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "skills"))) {
      return path.join(dir, "skills");
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, "../../../skills");
}

// ===================== 真实 Provider 实现 =====================

export class RealSkillProvider implements SkillCommandProvider {
  private loaded = false;
  private disabled = new Set<string>();
  private dirs: {
    bundledDir: string;
    builtinDir: string;
    userGlobalDir: string;
    workspaceDir: string;
  } | null = null;

  private async getDirs() {
    if (this.dirs) return this.dirs;
    const userGlobalDir = AppPaths.skillsDir;
    const workspaceDir = path.join(process.cwd(), "skills");
    const bundledDir = resolveRepoSkillsDir();
    let builtinDir: string;
    try {
      const appPathsMod: any = await import("../../config/appPaths.js");
      builtinDir = appPathsMod.AppPaths.skillsDir;
    } catch {
      // 回退：复刻 appPaths 解析逻辑
      const env = process.env.CDF_DATA_DIR;
      const base = env
        ? path.dirname(env)
        : process.platform === "darwin"
          ? path.join(os.homedir(), "Library", "Application Support", "CDFKnow")
          : path.join(os.homedir(), ".cdf-know");
      builtinDir = path.join(base, "skills");
    }
    this.dirs = { bundledDir, builtinDir, userGlobalDir, workspaceDir };
    return this.dirs;
  }

  /** 解析仓库内置 skills 目录（repo/skills），向上查找含 package.json 的目录 */
  private getTierDirs(): Array<[string, SkillEntry["source"]]> {
    const dirs = this.dirs!;
    const raw: Array<[string, SkillEntry["source"]]> = [
      [dirs.bundledDir, "builtin"],
      [dirs.builtinDir, "builtin"],
      [dirs.userGlobalDir, "local"],
      [dirs.workspaceDir, "local"],
    ];
    // 去重：解析后路径相同只扫描一次（builtin 优先，workspace 覆盖同名）
    const seen = new Set<string>();
    const result: Array<[string, SkillEntry["source"]]> = [];
    for (const [dir, src] of raw) {
      const resolved = path.resolve(dir);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      result.push([dir, src]);
    }
    return result;
  }

  private disabledFile(userGlobalDir: string): string {
    return path.join(userGlobalDir, ".skills-disabled.json");
  }

  private loadDisabled(userGlobalDir: string): void {
    try {
      const raw = fs.readFileSync(this.disabledFile(userGlobalDir), "utf-8");
      const parsed = JSON.parse(raw) as { disabled?: string[] };
      this.disabled = new Set(parsed.disabled ?? []);
    } catch {
      this.disabled = new Set();
    }
  }

  private saveDisabled(userGlobalDir: string): void {
    fs.mkdirSync(userGlobalDir, { recursive: true });
    fs.writeFileSync(
      this.disabledFile(userGlobalDir),
      JSON.stringify({ disabled: Array.from(this.disabled) }, null, 2),
    );
  }

  /** 统一在首次读取前加载 dirs + disabled */
  private async ensureState(): Promise<void> {
    if (this.loaded) return;
    const dirs = await this.getDirs();
    this.loadDisabled(dirs.userGlobalDir);
    this.loaded = true;
  }

  /** 扫描三级目录，返回真实 skill 列表（workspace > user > builtin 覆盖同名） */
  private scanFilesystem(): SkillEntry[] {
    const tiers = this.getTierDirs();
    const map = new Map<string, SkillEntry>();
    for (const [dir, src] of tiers) {
      if (!fs.existsSync(dir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        const skillMd = path.join(dir, e.name, "SKILL.md");
        if (!fs.existsSync(skillMd)) continue;
        if (!SKILL_ID_PATTERN.test(e.name)) continue;
        const content = fs.readFileSync(skillMd, "utf-8");
        const fm = parseFrontmatter(content);
        let mtime: number;
        try {
          mtime = fs.statSync(skillMd).mtimeMs;
        } catch {
          mtime = Date.now();
        }
        map.set(e.name, {
          id: e.name,
          name: (fm.name as string) || e.name,
          description: (fm.description as string) || "",
          version: (fm.version as string) || "0.0.0",
          enabled: !this.disabled.has(e.name),
          source: src,
          installedAt: new Date(mtime).toISOString(),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  }

  // ---------- 公共方法 ----------

  async list(): Promise<SkillEntry[]> {
    await this.ensureState();
    return this.scanFilesystem();
  }

  async info(id: string): Promise<SkillEntry | undefined> {
    await this.ensureState();
    return this.scanFilesystem().find((s) => s.id === id);
  }

  async scan(): Promise<SkillScanResult> {
    await this.ensureState();
    const tiers = this.getTierDirs();
    const eligible: string[] = [];
    const seen = new Set<string>();
    for (const [dir] of tiers) {
      if (!fs.existsSync(dir)) continue;
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (!e.isDirectory() || e.name.startsWith(".")) continue;
        if (
          fs.existsSync(path.join(dir, e.name, "SKILL.md")) &&
          !seen.has(e.name)
        ) {
          seen.add(e.name);
          eligible.push(e.name);
        }
      }
    }
    return { found: eligible.length, eligible };
  }

  async install(spec: string): Promise<SkillEntry> {
    await this.ensureState();
    const { id, version } = this.parseInstallSpec(spec);

    // 已存在（builtin / user / workspace）视为已安装
    const existing = this.scanFilesystem().find((s) => s.id === id);
    if (existing) {
      return { ...existing, enabled: true };
    }

    const isPath =
      spec.startsWith("/") ||
      spec.startsWith("./") ||
      spec.startsWith("../") ||
      (spec.includes("/") && fs.existsSync(spec));

    if (isPath) {
      const srcDir = path.resolve(spec);
      if (!fs.existsSync(path.join(srcDir, "SKILL.md"))) {
        return {
          id,
          name: id,
          description: "",
          version,
          enabled: false,
          source: "local",
          installedAt: new Date().toISOString(),
          error: `路径 ${srcDir} 不含 SKILL.md`,
        };
      }
      const { userGlobalDir } = this.dirs!;
      const destDir = path.join(userGlobalDir, id);
      this.copyDir(srcDir, destDir);
      const installed = this.scanFilesystem().find((s) => s.id === id);
      if (installed) return { ...installed, enabled: true };
      return {
        id,
        name: id,
        description: "",
        version,
        enabled: false,
        source: "local",
        installedAt: new Date().toISOString(),
        error: "安装后未找到该 skill",
      };
    }

    // 远程 / 市场安装：通过 RemoteSkillLoader 实际下载并安装文件
    const remote = this.resolveRemoteSource(spec);
    if (!remote) {
      return {
        id,
        name: id,
        description: "",
        version,
        enabled: false,
        source: "remote",
        installedAt: new Date().toISOString(),
        error: `无法识别远程源 '${spec}'：CLI 支持 http(s)://、git、file:// 或 npm: 形式的远程安装`,
      };
    }

    try {
      remoteSkillLoader.addSource(remote.source);
      const targetDir = path.join(this.dirs!.userGlobalDir, id);
      const res = await remoteSkillLoader.installSkill(
        id,
        version === "0.0.0" ? undefined : version,
        remote.source.url,
        targetDir,
      );
      if (!res.success) {
        return {
          id,
          name: id,
          description: "",
          version,
          enabled: false,
          source: "remote",
          installedAt: new Date().toISOString(),
          error: `远程安装失败: ${res.error}`,
        };
      }
      const installed = this.scanFilesystem().find((s) => s.id === id);
      return installed
        ? { ...installed, enabled: true }
        : {
            id,
            name: id,
            description: "",
            version: res.version ?? version,
            enabled: true,
            source: "local",
            installedAt: new Date().toISOString(),
          };
    } catch (e: any) {
      return {
        id,
        name: id,
        description: "",
        version,
        enabled: false,
        source: "remote",
        installedAt: new Date().toISOString(),
        error: `远程安装异常: ${e?.message ?? String(e)}`,
      };
    }
  }

  /** 从 spec 解析远程源（URL scheme → RemoteSkillSource）；无法识别返回 null */
  private resolveRemoteSource(
    spec: string,
  ): { source: RemoteSkillSource } | null {
    let type: RemoteSkillSource["type"] | null = null;
    let url = spec;
    if (spec.startsWith("file://")) {
      type = "local";
      url = spec.slice("file://".length);
    } else if (spec.startsWith("http://") || spec.startsWith("https://")) {
      type = "http";
    } else if (spec.startsWith("git@") || spec.endsWith(".git")) {
      type = "git";
    } else if (spec.startsWith("npm:") || spec.includes("registry.npmjs.org")) {
      type = "npm";
      url = spec.startsWith("npm:") ? spec.slice("npm:".length) : spec;
    } else if (
      spec.startsWith("/") ||
      spec.startsWith("./") ||
      spec.startsWith("../")
    ) {
      // 本地路径已在 isPath 分支处理，这里不作为远程
      return null;
    } else {
      // 裸 id：无法解析为远程源
      return null;
    }
    if (!type) return null;
    return {
      source: { type, url, enabled: true, priority: 0 },
    };
  }

  /**
   * 从安装 spec 解析 skill id 与版本：
   * - `name@version`（name 为合法 id，无 scheme/路径/主机分隔符）
   * - `file://<path>` / 本地路径 → id 取目录 basename
   * - `git@host:path` → id 取 path 末段（去 .git）
   * - http/git/npm URL → id 取 URL 末段（去后缀），需合法
   * - `@scope/name` → 去除 scope
   * - 裸 id → 直接使用
   */
  private parseInstallSpec(spec: string): { id: string; version: string } {
    // name@version：仅当 name 合法且 version 不含主机/路径分隔符（排除 git@host:path、name@url）
    const atIdx = spec.indexOf("@");
    if (atIdx > 0) {
      const left = spec.slice(0, atIdx);
      const right = spec.slice(atIdx + 1);
      if (
        !left.includes("://") &&
        !left.includes("/") &&
        !left.includes(":") &&
        SKILL_ID_PATTERN.test(left) &&
        !right.includes(":") &&
        !right.includes("/")
      ) {
        return { id: left, version: right || "0.0.0" };
      }
    }
    // file:// / 本地路径 → basename
    let rawPath = spec;
    if (rawPath.startsWith("file://")) rawPath = rawPath.slice("file://".length);
    if (
      rawPath.startsWith("/") ||
      rawPath.startsWith("./") ||
      rawPath.startsWith("../")
    ) {
      return { id: path.basename(path.resolve(rawPath)), version: "0.0.0" };
    }
    // git@host:path → path 末段
    const gitMatch = spec.match(/^git@[^:]+:(.+)$/);
    if (gitMatch) {
      const seg = path.basename(gitMatch[1]).replace(/\.git$/, "");
      if (seg && SKILL_ID_PATTERN.test(seg)) {
        return { id: seg, version: "0.0.0" };
      }
    }
    // http(s) URL → 末段
    if (spec.startsWith("http://") || spec.startsWith("https://")) {
      try {
        const u = new URL(spec);
        const seg = path
          .basename(u.pathname)
          .replace(/\.(git|tar\.gz|tgz|zip)$/, "");
        if (seg && SKILL_ID_PATTERN.test(seg)) {
          return { id: seg, version: "0.0.0" };
        }
      } catch {
        // not a valid URL
      }
    }
    // npm: 前缀
    if (spec.startsWith("npm:")) {
      const pkg = spec.slice("npm:".length).split("@")[0];
      const seg = path.basename(pkg);
      if (seg && SKILL_ID_PATTERN.test(seg)) {
        return { id: seg, version: "0.0.0" };
      }
    }
    // @scope/name → 去除 scope
    const scoped = spec.replace(/^@[^/]+\//, "");
    if (SKILL_ID_PATTERN.test(scoped)) {
      return { id: scoped, version: "0.0.0" };
    }
    // 裸 id 或回退
    return { id: spec, version: "0.0.0" };
  }

  private copyDir(src: string, dest: string): void {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    const walk = (s: string, d: string): void => {
      for (const e of fs.readdirSync(s, { withFileTypes: true })) {
        const sp = path.join(s, e.name);
        const dp = path.join(d, e.name);
        if (e.isDirectory()) {
          fs.mkdirSync(dp, { recursive: true });
          walk(sp, dp);
        } else {
          fs.copyFileSync(sp, dp);
        }
      }
    };
    walk(src, dest);
  }

  async enable(id: string): Promise<boolean> {
    await this.ensureState();
    const found = this.scanFilesystem().some((s) => s.id === id);
    if (!found) return false;
    this.disabled.delete(id);
    this.saveDisabled(this.dirs!.userGlobalDir);
    return true;
  }

  async disable(id: string): Promise<boolean> {
    await this.ensureState();
    const found = this.scanFilesystem().some((s) => s.id === id);
    if (!found) return false;
    this.disabled.add(id);
    this.saveDisabled(this.dirs!.userGlobalDir);
    return true;
  }
}

// ===================== 输出格式化 =====================

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatSkillsList(skills: SkillEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  技能列表 (共 ${skills.length} 个):`);
  lines.push("");
  for (const skill of skills) {
    const status = skill.enabled ? "✓ 启用" : "⏸ 禁用";
    lines.push(
      `    ${status}  ${skill.id.padEnd(16)} v${skill.version}  [${skill.source}]`,
    );
    lines.push(`             ${skill.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

function formatSkillInfo(skill: SkillEntry | undefined, id: string): string {
  if (!skill) {
    return `技能 ${id} 不存在`;
  }
  const lines: string[] = [];
  lines.push("");
  lines.push(`  技能详情: ${skill.name}`);
  lines.push(`    ID:          ${skill.id}`);
  lines.push(`    描述:        ${skill.description}`);
  lines.push(`    版本:        ${skill.version}`);
  lines.push(`    来源:        ${skill.source}`);
  lines.push(`    状态:        ${skill.enabled ? "启用" : "禁用"}`);
  lines.push(`    安装时间:    ${new Date(skill.installedAt).toLocaleString("zh-CN")}`);
  lines.push("");
  return lines.join("\n");
}

// ===================== 命令注册 =====================

/**
 * 注册 skills 命令
 *
 * @param program - commander 实例
 * @param provider - 数据提供方（默认 RealSkillProvider，真实扫描三级目录）
 */
export function registerSkillsCommand(
  program: Command,
  provider: SkillCommandProvider = new RealSkillProvider(),
): void {
  const skillsCmd = program
    .command("skill")
    .description("技能管理 (list/install/scan/enable/disable/info)");

  skillsCmd
    .command("list")
    .description("列出所有技能")
    .option("--json", "JSON 输出格式")
    .action(async (options: SkillsOptions) => {
      const skills = await provider.list();
      if (options.json) {
        process.stdout.write(formatJsonOutput(skills) + "\n");
      } else {
        process.stdout.write(formatSkillsList(skills));
      }
    });

  skillsCmd
    .command("install <spec>")
    .description("安装技能 (本地路径 / 已存在 skill id)")
    .option("--json", "JSON 输出格式")
    .action(async (spec: string, options: SkillsOptions) => {
      const skill = await provider.install(spec);
      if (options.json) {
        process.stdout.write(formatJsonOutput(skill) + "\n");
      } else if (skill.error) {
        process.stdout.write(`安装失败: ${skill.error}\n`);
      } else {
        process.stdout.write(`已安装技能 ${skill.id}@${skill.version}\n`);
      }
    });

  skillsCmd
    .command("scan")
    .description("扫描可用技能")
    .option("--json", "JSON 输出格式")
    .action(async (options: SkillsOptions) => {
      const result = await provider.scan();
      if (options.json) {
        process.stdout.write(formatJsonOutput(result) + "\n");
      } else {
        process.stdout.write(`扫描完成: 发现 ${result.found} 个可用技能\n`);
        for (const id of result.eligible) {
          process.stdout.write(`  - ${id}\n`);
        }
      }
    });

  skillsCmd
    .command("enable <id>")
    .description("启用技能")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: SkillsOptions) => {
      const success = await provider.enable(id);
      if (options.json) {
        process.stdout.write(formatJsonOutput({ id, enabled: success }) + "\n");
      } else {
        process.stdout.write(
          success ? `已启用技能 ${id}\n` : `技能 ${id} 不存在\n`,
        );
      }
    });

  skillsCmd
    .command("disable <id>")
    .description("禁用技能")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: SkillsOptions) => {
      const success = await provider.disable(id);
      if (options.json) {
        process.stdout.write(formatJsonOutput({ id, disabled: success }) + "\n");
      } else {
        process.stdout.write(
          success ? `已禁用技能 ${id}\n` : `技能 ${id} 不存在\n`,
        );
      }
    });

  skillsCmd
    .command("info <id>")
    .description("查看技能详情")
    .option("--json", "JSON 输出格式")
    .action(async (id: string, options: SkillsOptions) => {
      const skill = await provider.info(id);
      if (options.json) {
        process.stdout.write(
          formatJsonOutput(skill ?? { id, error: "not found" }) + "\n",
        );
      } else {
        process.stdout.write(formatSkillInfo(skill, id));
      }
    });

  // 默认 list 子命令
  skillsCmd.action(async (options: SkillsOptions) => {
    const skills = await provider.list();
    if (options.json) {
      process.stdout.write(formatJsonOutput(skills) + "\n");
    } else {
      process.stdout.write(formatSkillsList(skills));
    }
  });
}
