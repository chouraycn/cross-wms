/**
 * 技能门控系统
 *
 * 参考 OpenClaw 的 metadata.openclaw.requires 配置：
 * - bins: 所有二进制必须存在
 * - anyBins: 至少一个二进制存在
 * - env: 所有环境变量必须存在
 * - config: 所有配置项必须为真
 *
 * 技能加载时检查门控条件，不满足则自动禁用并提供安装指引。
 */

import { exec } from "child_process";
import { promisify } from "util";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skill-gating" } as any);

const execAsync = promisify(exec);

// ============================================================================
// 类型定义
// ============================================================================

/** 技能依赖要求 */
export interface SkillRequires {
  /** 所有二进制必须存在 */
  bins?: string[];
  /** 至少一个二进制存在 */
  anyBins?: string[];
  /** 所有环境变量必须存在 */
  env?: string[];
  /** 所有配置项必须为真 */
  config?: string[];
}

/** 门控检查结果 */
export interface GatingCheckResult {
  /** 是否通过 */
  passed: boolean;
  /** 缺失的二进制 */
  missingBins: string[];
  /** 满足的 anyBins */
  satisfiedAnyBins: string[];
  /** 缺失的环境变量 */
  missingEnv: string[];
  /** 缺失的配置项 */
  missingConfig: string[];
  /** 安装指引 */
  installGuidance: string[];
}

/** 配置项检查器函数类型 */
export type ConfigChecker = (configPath: string) => boolean;

/** 二进制检查结果缓存 */
interface BinCheckCache {
  bin: string;
  exists: boolean;
  checkedAt: number;
}

// ============================================================================
// 技能门控管理器
// ============================================================================

/** 技能门控管理器 */
export class SkillGatingManager {
  private binCache: Map<string, BinCheckCache> = new Map();
  private configChecker: ConfigChecker | null = null;
  private cacheTimeout: number = 60000; // 1 分钟缓存

  constructor(options?: { configChecker?: ConfigChecker; cacheTimeout?: number }) {
    if (options?.configChecker) {
      this.configChecker = options.configChecker;
    }
    if (options?.cacheTimeout) {
      this.cacheTimeout = options.cacheTimeout;
    }
  }

  /** 设置配置项检查器 */
  setConfigChecker(checker: ConfigChecker): void {
    this.configChecker = checker;
  }

  /** 检查二进制是否存在 */
  async checkBin(bin: string): Promise<boolean> {
    // 检查缓存
    const cached = this.binCache.get(bin);
    if (cached && Date.now() - cached.checkedAt < this.cacheTimeout) {
      return cached.exists;
    }

    // 执行检查
    let exists = false;
    try {
      // 使用 which/where 命令检查
      const command = process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
      await execAsync(command, { timeout: 5000 });
      exists = true;
    } catch {
      exists = false;
    }

    // 更新缓存
    this.binCache.set(bin, {
      bin,
      exists,
      checkedAt: Date.now(),
    });

    return exists;
  }

  /** 批量检查二进制 */
  async checkBins(bins: string[]): Promise<{ exists: string[]; missing: string[] }> {
    const results = await Promise.all(bins.map(async (bin) => ({
      bin,
      exists: await this.checkBin(bin),
    })));

    return {
      exists: results.filter((r) => r.exists).map((r) => r.bin),
      missing: results.filter((r) => !r.exists).map((r) => r.bin),
    };
  }

  /** 检查环境变量 */
  checkEnv(envVar: string): boolean {
    return process.env[envVar] !== undefined && process.env[envVar] !== "";
  }

  /** 批量检查环境变量 */
  checkEnvs(envVars: string[]): { exists: string[]; missing: string[] } {
    const exists: string[] = [];
    const missing: string[] = [];

    for (const env of envVars) {
      if (this.checkEnv(env)) {
        exists.push(env);
      } else {
        missing.push(env);
      }
    }

    return { exists, missing };
  }

  /** 检查配置项 */
  checkConfig(configPath: string): boolean {
    if (!this.configChecker) {
      logger.warn(`[SkillGating] No config checker set for path: ${configPath}`);
      return false;
    }
    return this.configChecker(configPath);
  }

  /** 批量检查配置项 */
  checkConfigs(configPaths: string[]): { exists: string[]; missing: string[] } {
    if (!this.configChecker) {
      return { exists: [], missing: configPaths };
    }

    const exists: string[] = [];
    const missing: string[] = [];

    for (const path of configPaths) {
      if (this.checkConfig(path)) {
        exists.push(path);
      } else {
        missing.push(path);
      }
    }

    return { exists, missing };
  }

  /** 检查技能门控条件 */
  async checkGating(requires: SkillRequires): Promise<GatingCheckResult> {
    const missingBins: string[] = [];
    const satisfiedAnyBins: string[] = [];
    const missingEnv: string[] = [];
    const missingConfig: string[] = [];
    const installGuidance: string[] = [];

    // 检查 bins（所有必须存在）
    if (requires.bins && requires.bins.length > 0) {
      const { missing } = await this.checkBins(requires.bins);
      missingBins.push(...missing);

      for (const bin of missing) {
        installGuidance.push(this.getBinInstallGuidance(bin));
      }
    }

    // 检查 anyBins（至少一个存在）
    if (requires.anyBins && requires.anyBins.length > 0) {
      const { exists } = await this.checkBins(requires.anyBins);
      satisfiedAnyBins.push(...exists);

      if (exists.length === 0) {
        // 没有任何二进制存在，添加安装指引
        installGuidance.push(
          `At least one of these binaries is required: ${requires.anyBins.join(", ")}`
        );
      }
    }

    // 检查 env（所有必须存在）
    if (requires.env && requires.env.length > 0) {
      const { missing } = this.checkEnvs(requires.env);
      missingEnv.push(...missing);

      for (const env of missing) {
        installGuidance.push(`Set environment variable: ${env}`);
      }
    }

    // 检查 config（所有必须为真）
    if (requires.config && requires.config.length > 0) {
      const { missing } = this.checkConfigs(requires.config);
      missingConfig.push(...missing);

      for (const config of missing) {
        installGuidance.push(`Enable configuration: ${config}`);
      }
    }

    // 计算是否通过
    const passed =
      missingBins.length === 0 &&
      (satisfiedAnyBins.length > 0 || !requires.anyBins || requires.anyBins.length === 0) &&
      missingEnv.length === 0 &&
      missingConfig.length === 0;

    return {
      passed,
      missingBins,
      satisfiedAnyBins,
      missingEnv,
      missingConfig,
      installGuidance,
    };
  }

  /** 获取二进制安装指引 */
  private getBinInstallGuidance(bin: string): string {
    // 常见二进制的安装指引
    const guidance: Record<string, string> = {
      node: "Install Node.js: https://nodejs.org/ or brew install node",
      npm: "Install Node.js: https://nodejs.org/ or brew install node",
      pnpm: "Install pnpm: npm install -g pnpm or brew install pnpm",
      yarn: "Install Yarn: npm install -g yarn or brew install yarn",
      bun: "Install Bun: https://bun.sh/ or brew install bun",
      go: "Install Go: https://go.dev/ or brew install go",
      python: "Install Python: https://python.org/ or brew install python",
      python3: "Install Python 3: https://python.org/ or brew install python3",
      pip: "Install Python pip: usually included with Python",
      pip3: "Install Python 3 pip: usually included with Python3",
      uv: "Install uv: pip install uv or brew install uv",
      gemini: "Install Gemini CLI: npm install -g @anthropic-ai/gemini-cli or brew install gemini-cli",
      claude: "Install Claude CLI: npm install -g @anthropic-ai/claude-cli",
      gh: "Install GitHub CLI: brew install gh",
      git: "Install Git: brew install git",
      docker: "Install Docker: https://docker.com/ or brew install docker",
    };

    return guidance[bin] || `Install ${bin}: check documentation for installation instructions`;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.binCache.clear();
    logger.debug("[SkillGating] Cache cleared");
  }

  /** 获取缓存状态 */
  getCacheStatus(): { size: number; entries: BinCheckCache[] } {
    return {
      size: this.binCache.size,
      entries: Array.from(this.binCache.values()),
    };
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalGatingManager: SkillGatingManager | null = null;

/** 获取全局门控管理器 */
export function getSkillGatingManager(): SkillGatingManager {
  if (!globalGatingManager) {
    globalGatingManager = new SkillGatingManager();
  }
  return globalGatingManager;
}

/** 初始化全局门控管理器 */
export function initSkillGatingManager(
  options?: { configChecker?: ConfigChecker; cacheTimeout?: number },
): SkillGatingManager {
  globalGatingManager = new SkillGatingManager(options as any);
  return globalGatingManager;
}

/** 重置全局管理器 */
export function resetSkillGatingManager(): void {
  globalGatingManager = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/** 快速检查门控条件（不使用缓存） */
export async function quickGatingCheck(requires: SkillRequires): Promise<GatingCheckResult> {
  const manager = new SkillGatingManager();
  return manager.checkGating(requires);
}

/** 检查单个二进制是否存在 */
export async function isBinAvailable(bin: string): Promise<boolean> {
  const manager = getSkillGatingManager();
  return manager.checkBin(bin);
}

/** 检查单个环境变量是否存在 */
export function isEnvAvailable(envVar: string): boolean {
  return process.env[envVar] !== undefined && process.env[envVar] !== "";
}