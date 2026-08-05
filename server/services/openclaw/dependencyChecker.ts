/**
 * 技能环境依赖检测器（合并自 src/utils/dependencyChecker.ts）
 *
 * 设计目标：
 *  1. 作为运行时模块被后端使用（checkSkillDependencies / dependencyChecker.checkAll）
 *  2. 通过 `import type` 被前端共享 DependencyCheckResult / CheckItem 类型
 *  3. 同时支持「扁平 checkAll(bins, anyBins, env, config)」与「按技能 checkSkillDependencies(...)」两种调用风格
 *
 * 历史背景：原 src/utils/dependencyChecker.ts 使用 execSync 同步实现，server/services/openclaw/dependencyChecker.ts
 * 使用 execFile 异步实现。两份接口形状不同但功能高度重叠，此处合并为单一权威实现，消除双实现维护负担。
 */

import { promisify } from 'util';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SkillRequires, SkillInstallStep } from './skillMetadata';

const execFileAsync = promisify(execFile);

// ===================== 共享类型 =====================

/** 单条依赖检测结果（扁平视图，对应 checkAll 的 checks 数组元素） */
export interface CheckItem {
  /** 依赖类别 */
  type: 'bin' | 'env' | 'config';
  /** 依赖名称（命令名 / 环境变量名 / 配置项名） */
  name: string;
  /** 是否找到 */
  found: boolean;
  /** 找到时的实际值（命令路径 / 环境变量值 / 配置文件路径） */
  value?: string;
}

/** 命令搜索结果（细粒度视图，对应 checkSkillDependencies 的 bins/anyBins 数组元素） */
export interface BinSearchResult {
  found: boolean;
  path?: string;
}

/**
 * 统一的依赖检测结果。
 *
 * 字段说明：
 *  - `allFound` / `allSatisfied`：互为别名，始终同值；前者被 checkAll 路径使用，后者被 checkSkillDependencies 路径使用
 *  - `checks`：扁平的逐项结果（兼容旧前端 UI）
 *  - `bins` / `anyBins` / `env`：分类的细粒度结果（兼容 skillLifecycle）
 *  - `installSteps`：仅 checkSkillDependencies 路径填充
 */
export interface DependencyCheckResult {
  /** 技能 ID（仅 checkSkillDependencies 路径填充） */
  skillId?: string;
  /** 技能名称（仅 checkSkillDependencies 路径填充） */
  skillName?: string;
  /** 是否全部满足 — allFound 的别名 */
  allSatisfied: boolean;
  /** 是否全部满足 — allSatisfied 的别名 */
  allFound: boolean;
  /** 扁平的逐项检测结果 */
  checks: CheckItem[];
  /** 必须全部存在的命令的细粒度结果 */
  bins: { name: string; found: boolean; path?: string }[];
  /** OR 组（至少存在一个）命令的细粒度结果 */
  anyBins: { name: string; found: boolean; path?: string }[];
  /** 环境变量的细粒度结果 */
  env: { name: string; found: boolean; value?: string }[];
  /** 安装步骤（仅 checkSkillDependencies 路径填充） */
  installSteps?: SkillInstallStep[];
  /** 缺失的命令 */
  missingBins: string[];
  /** 缺失的环境变量 */
  missingEnv: string[];
  /** 缺失的配置项/文件路径 */
  missingConfig: string[];
}

// ===================== 内部工具 =====================

async function searchBinary(name: string): Promise<BinSearchResult> {
  try {
    const result = await execFileAsync('which', [name]);
    return { found: true, path: result.stdout.trim() };
  } catch {
    return { found: false };
  }
}

async function checkEnvVar(name: string): Promise<{ found: boolean; value?: string }> {
  const value = process.env[name];
  return { found: value !== undefined && value !== '', value };
}

/** 检测一个配置项（文件/路径/环境变量）是否存在 */
function checkConfig(name: string): { ok: boolean; value?: string } {
  // 形如路径的配置（包含 /、以 ~ 或 . 开头），按文件存在性判断
  if (name.includes('/') || name.startsWith('~') || name.startsWith('.')) {
    const expanded = name.startsWith('~')
      ? path.join(os.homedir(), name.slice(1))
      : path.resolve(name);
    if (fs.existsSync(expanded)) {
      return { ok: true, value: expanded };
    }
  }
  // 否则按环境变量判断
  const envVal = process.env[name];
  if (envVal !== undefined && envVal !== '') {
    return { ok: true, value: envVal };
  }
  return { ok: false };
}

// ===================== 按技能检测（openclaw 风格） =====================

export async function checkSkillDependencies(
  skillId: string,
  skillName: string,
  requires: SkillRequires | undefined,
  installSteps: SkillInstallStep[],
): Promise<DependencyCheckResult> {
  const bins = requires?.bins || [];
  const anyBins = requires?.anyBins || [];
  const env = requires?.env || [];
  const config = requires?.config || [];

  const binResults = await Promise.all(
    bins.map(async (name) => ({ name, ...await searchBinary(name) })),
  );

  const anyBinResults = await Promise.all(
    anyBins.map(async (name) => ({ name, ...await searchBinary(name) })),
  );

  const envResults = await Promise.all(
    env.map(async (name) => ({ name, ...await checkEnvVar(name) })),
  );

  const missingBins = binResults.filter((r) => !r.found).map((r) => r.name);
  const missingEnv = envResults.filter((r) => !r.found).map((r) => r.name);
  const missingConfig: string[] = [];
  for (const c of config) {
    const r = checkConfig(c);
    if (!r.ok) missingConfig.push(c);
  }

  const anyBinsSatisfied = anyBins.length === 0 || anyBinResults.some((r) => r.found);
  const allSatisfied =
    missingBins.length === 0 && missingEnv.length === 0 && missingConfig.length === 0 && anyBinsSatisfied;

  // 构建扁平 checks 数组，供旧前端 UI 复用
  const checks: CheckItem[] = [];
  for (const r of binResults) {
    checks.push({ type: 'bin', name: r.name, found: r.found, ...(r.path ? { value: r.path } : {}) });
  }
  for (const r of anyBinResults) {
    checks.push({ type: 'bin', name: r.name, found: r.found, ...(r.path ? { value: r.path } : {}) });
  }
  for (const r of envResults) {
    checks.push({ type: 'env', name: r.name, found: r.found, ...(r.value ? { value: r.value } : {}) });
  }
  for (const c of config) {
    const r = checkConfig(c);
    checks.push({ type: 'config', name: c, found: r.ok, ...(r.value ? { value: r.value } : {}) });
  }

  return {
    skillId,
    skillName,
    allSatisfied,
    allFound: allSatisfied,
    checks,
    bins: binResults,
    anyBins: anyBinResults,
    env: envResults,
    installSteps,
    missingBins,
    missingEnv,
    missingConfig,
  };
}

export async function checkAllSkillsDependencies(
  skills: Array<{ id: string; name: string; requires?: SkillRequires; installSteps?: SkillInstallStep[] }>,
): Promise<DependencyCheckResult[]> {
  return Promise.all(
    skills.map((skill) =>
      checkSkillDependencies(
        skill.id,
        skill.name,
        skill.requires,
        skill.installSteps || [],
      ),
    ),
  );
}

export function generateInstallCommands(installSteps: SkillInstallStep[]): string[] {
  const commands: string[] = [];
  for (const step of installSteps) {
    switch (step.type) {
      case 'brew':
        commands.push(`brew install ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'node':
        commands.push(`npm install -g ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'pip':
        commands.push(`pip install ${step.name}${step.version ? `==${step.version}` : ''}`);
        break;
      case 'go':
        commands.push(`go install ${step.name}${step.version ? `@${step.version}` : ''}`);
        break;
      case 'cargo':
        commands.push(`cargo install ${step.name}`);
        break;
      case 'bash':
        commands.push(step.args?.join(' ') || '');
        break;
      case 'download':
        commands.push(`# Download: ${step.url || step.name}`);
        break;
    }
  }
  return commands;
}

// ===================== 扁平 checkAll（兼容 src/utils/dependencyChecker 旧接口） =====================

/**
 * 批量检测技能环境依赖（扁平签名）。
 *
 * 与 `checkSkillDependencies` 共享底层实现，但接受原始数组而非 SkillRequires 对象，
 * 供 server/routes/skills.ts 的 `/api/skills/dependency-check` 路由直接调用。
 *
 * @param bins 必须全部存在的命令
 * @param anyBins 至少存在一个即可的命令（OR 组）
 * @param env 必须设置的环境变量
 * @param config 必须存在的配置项/文件路径
 */
export const dependencyChecker = {
  async checkAll(
    bins: string[],
    anyBins: string[],
    env: string[],
    config: string[],
  ): Promise<DependencyCheckResult> {
    const binResults = await Promise.all(
      bins.map(async (name) => ({ name, ...await searchBinary(name) })),
    );
    const anyBinResults = await Promise.all(
      anyBins.map(async (name) => ({ name, ...await searchBinary(name) })),
    );
    const envResults = await Promise.all(
      env.map(async (name) => ({ name, ...await checkEnvVar(name) })),
    );

    const missingBins: string[] = [];
    for (const r of binResults) if (!r.found) missingBins.push(r.name);

    const anyBinFound = anyBinResults.some((r) => r.found);
    if (anyBins.length > 0 && !anyBinFound) {
      for (const r of anyBinResults) missingBins.push(r.name);
    }

    const missingEnv: string[] = [];
    for (const r of envResults) if (!r.found) missingEnv.push(r.name);

    const missingConfig: string[] = [];
    for (const c of config) {
      const r = checkConfig(c);
      if (!r.ok) missingConfig.push(c);
    }

    const allFound =
      missingBins.length === 0 && missingEnv.length === 0 && missingConfig.length === 0;

    // 扁平 checks 数组（保持与旧 src/utils/dependencyChecker 完全一致）
    const checks: CheckItem[] = [];
    for (const r of binResults) {
      checks.push({ type: 'bin', name: r.name, found: r.found, ...(r.path ? { value: r.path } : {}) });
    }
    for (const r of anyBinResults) {
      checks.push({ type: 'bin', name: r.name, found: r.found, ...(r.path ? { value: r.path } : {}) });
    }
    for (const r of envResults) {
      checks.push({ type: 'env', name: r.name, found: r.found, ...(r.value ? { value: r.value } : {}) });
    }
    for (const c of config) {
      const r = checkConfig(c);
      checks.push({ type: 'config', name: c, found: r.ok, ...(r.value ? { value: r.value } : {}) });
    }

    return {
      allSatisfied: allFound,
      allFound,
      checks,
      bins: binResults,
      anyBins: anyBinResults,
      env: envResults,
      missingBins,
      missingEnv,
      missingConfig,
    };
  },
};
