import { logger } from '../../logger.js';
import type { SkillEntry, SkillDependency } from './types.js';

export type SandboxPermission =
  | 'network.read'
  | 'network.write'
  | 'file.read'
  | 'file.write'
  | 'exec.shell'
  | 'tool.use'
  | 'memory.read'
  | 'memory.write';

export interface SkillSandboxConfig {
  allowedPermissions: SandboxPermission[];
  blockedApis: string[];
  maxExecutionTimeMs: number;
  maxMemoryMB: number;
  allowedPaths: string[];
  blockedPaths: string[];
}

export interface SkillExecutionContext {
  skillId: string;
  skillVersion: string;
  permissions: SandboxPermission[];
  startTime: number;
  memoryUsedMB: number;
}

export interface SkillExecutionResult<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
  context: SkillExecutionContext;
}

const DEFAULT_BLOCKED_PATHS = ['/etc', '/usr', '/bin', '/sbin'];

export class SkillSandbox {
  private config: SkillSandboxConfig;

  constructor(config?: Partial<SkillSandboxConfig>) {
    this.config = {
      allowedPermissions: ['network.read', 'tool.use', 'memory.read', 'memory.write'],
      blockedApis: ['eval', 'Function', 'require', 'process.exit', 'child_process'],
      maxExecutionTimeMs: 30000,
      maxMemoryMB: 256,
      allowedPaths: [],
      blockedPaths: [...DEFAULT_BLOCKED_PATHS],
      ...config,
    };
  }

  async execute<T>(
    skill: SkillEntry,
    fn: () => T | Promise<T>,
  ): Promise<SkillExecutionResult<T>> {
    const context: SkillExecutionContext = {
      skillId: skill.skill.name,
      skillVersion: skill.frontmatter.version ?? 'unknown',
      permissions: this.config.allowedPermissions,
      startTime: Date.now(),
      memoryUsedMB: 0,
    };

    try {
      await this.validateSkill(skill);

      this.checkBlockedApis(fn);

      const result = await this.runWithTimeout(fn, this.config.maxExecutionTimeMs);

      context.memoryUsedMB = this.getMemoryUsageMB();

      return {
        success: true,
        result,
        context,
      };
    } catch (error) {
      context.memoryUsedMB = this.getMemoryUsageMB();

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        context,
      };
    }
  }

  private async validateSkill(skill: SkillEntry): Promise<void> {
    if (skill.skill.disableModelInvocation) {
      throw new Error(`Skill ${skill.skill.name} is disabled (disableModelInvocation)`);
    }

    if (!skill.skill.description && !skill.frontmatter.description) {
      throw new Error(`Skill ${skill.skill.name} has empty content`);
    }

    const deps = this.extractDependencies(skill);
    for (const dep of deps) {
      if (!this.isDependencyAllowed(dep)) {
        throw new Error(`Skill ${skill.skill.name} has unauthorized dependency: ${dep.skill}`);
      }
    }
  }

  /** 从 SkillEntry.metadata（或 frontmatter）中提取依赖列表 */
  private extractDependencies(skill: SkillEntry): SkillDependency[] {
    const deps = (skill.frontmatter['depends-on'] || skill.frontmatter['dependencies'] || '').trim();
    if (!deps) return [];
    return deps
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((name) => ({ skill: name, required: true }));
  }

  private isDependencyAllowed(dependency: SkillDependency): boolean {
    // 默认允许所有声明的依赖；可在此处接入黑白名单
    void dependency;
    return true;
  }

  private checkBlockedApis(fn: () => unknown): void {
    const fnStr = fn.toString();
    for (const api of this.config.blockedApis) {
      if (fnStr.includes(api)) {
        throw new Error(`Sandbox security policy blocked access to API "${api}"`);
      }
    }
  }

  private async runWithTimeout<T>(fn: () => T | Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private getMemoryUsageMB(): number {
    if (process.memoryUsage) {
      return Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
    }
    return 0;
  }

  hasPermission(permission: SandboxPermission): boolean {
    return this.config.allowedPermissions.includes(permission);
  }

  isPathAllowed(filePath: string): boolean {
    for (const blocked of this.config.blockedPaths) {
      if (filePath.startsWith(blocked)) {
        return false;
      }
    }

    if (this.config.allowedPaths.length > 0) {
      return this.config.allowedPaths.some((allowed) => filePath.startsWith(allowed));
    }

    return true;
  }

  getConfig(): Readonly<SkillSandboxConfig> {
    return {
      allowedPermissions: [...this.config.allowedPermissions],
      blockedApis: [...this.config.blockedApis],
      maxExecutionTimeMs: this.config.maxExecutionTimeMs,
      maxMemoryMB: this.config.maxMemoryMB,
      allowedPaths: [...this.config.allowedPaths],
      blockedPaths: [...this.config.blockedPaths],
    };
  }

  updateConfig(config: Partial<SkillSandboxConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('[SkillSandbox] Updated sandbox configuration');
  }
}

export const skillSandbox = new SkillSandbox();
