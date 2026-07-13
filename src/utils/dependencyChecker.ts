/**
 * 技能环境依赖检测器
 *
 * 被前端（import type，仅类型擦除）与后端（server/routes/skills.ts 运行时 import）共用。
 * 后端在 /api/skills/dependency-check 路由中调用 dependencyChecker.checkAll(...) 批量检测技能声明
 * 的环境依赖（bins / anyBins / env / config），返回结构化结果供前端渲染。
 *
 * 注意：本文件为运行时模块，仅后端实际执行；前端的 import 均为 import type，编译后被擦除。
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** 单条依赖检测结果 */
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

/** 单个技能的环境依赖检测结果 */
export interface DependencyCheckResult {
  /** 是否全部满足 */
  allFound: boolean;
  /** 逐项检测结果 */
  checks: CheckItem[];
  /** 缺失的命令 */
  missingBins: string[];
  /** 缺失的环境变量 */
  missingEnv: string[];
  /** 缺失的配置文件/项 */
  missingConfig: string[];
}

/** 检测一个命令是否存在于 PATH 中 */
function checkBin(bin: string): { ok: boolean; value?: string } {
  try {
    const resolved = execSync(`command -v ${JSON.stringify(bin)}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return { ok: true, value: resolved || bin };
  } catch {
    return { ok: false };
  }
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

export const dependencyChecker = {
  /**
   * 批量检测技能环境依赖。
   * @param bins 必须全部存在的命令
   * @param anyBins 至少存在一个即可的命令（OR 组）
   * @param env 必须设置的环境变量
   * @param config 必须存在的配置项/文件路径
   */
  async checkAll(
    bins: string[],
    anyBins: string[],
    env: string[],
    config: string[]
  ): Promise<DependencyCheckResult> {
    const checks: CheckItem[] = [];
    const missingBins: string[] = [];
    const missingEnv: string[] = [];
    const missingConfig: string[] = [];

    // 必须存在的命令
    for (const bin of bins) {
      const r = checkBin(bin);
      checks.push({ type: 'bin', name: bin, found: r.ok, ...(r.ok ? { value: r.value } : {}) });
      if (!r.ok) missingBins.push(bin);
    }

    // 至少一个存在的命令（OR 组）
    const anyBinFound = anyBins.some((bin) => checkBin(bin).ok);
    for (const bin of anyBins) {
      const r = checkBin(bin);
      checks.push({ type: 'bin', name: bin, found: r.ok, ...(r.ok ? { value: r.value } : {}) });
    }
    if (anyBins.length > 0 && !anyBinFound) {
      for (const bin of anyBins) missingBins.push(bin);
    }

    // 必须设置的环境变量
    for (const e of env) {
      const v = process.env[e];
      const found = v !== undefined && v !== '';
      checks.push({ type: 'env', name: e, found, ...(found ? { value: v } : {}) });
      if (!found) missingEnv.push(e);
    }

    // 必须存在的配置项/文件路径
    for (const c of config) {
      const r = checkConfig(c);
      checks.push({ type: 'config', name: c, found: r.ok, ...(r.ok ? { value: r.value } : {}) });
      if (!r.ok) missingConfig.push(c);
    }

    const allFound =
      missingBins.length === 0 && missingEnv.length === 0 && missingConfig.length === 0;

    return { allFound, checks, missingBins, missingEnv, missingConfig };
  },
};
