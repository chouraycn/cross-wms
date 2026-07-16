/**
 * Doctor 诊断流程 — 参考 openclaw/src/flows/doctor-health.ts
 *
 * 创建诊断检查列表并运行，输出结构化健康检查结果。
 * 不依赖 @openclaw/* 包，复用本目录 health-checks.js 与 types.js。
 */

import type {
  FlowConfig,
  HealthCheckContext,
  HealthFinding,
  HealthCheckScope,
} from './types.js';
import {
  runHealthChecks,
  formatHealthFindings,
  type HealthCheckDefinition,
  type HealthCheckResult,
} from './health-checks.js';
import { getAllProviders } from '../modelProviderRegistry.js';
import { resolveProviderAuthStatus } from './provider-flow.js';
import { buildChannelSetupOptions } from './channel-setup.js';
import { getWebSearchProviders } from '../../plugins/web-search-providers.js';
import { isSearchProviderCredentialReady } from './search-setup.js';

// ===================== 类型定义 =====================

/** Doctor 诊断检查条目，包装 HealthCheckDefinition 并附带分类标签。 */
export interface DoctorCheck {
  readonly id: string;
  readonly category: 'core' | 'provider' | 'channel' | 'search' | 'config';
  readonly description: string;
  readonly definition: HealthCheckDefinition;
}

/** createDoctorChecks 的可选参数。 */
export interface CreateDoctorChecksParams {
  /** 环境变量来源，默认 process.env。 */
  env?: NodeJS.ProcessEnv;
  /** 应用配置，用于渠道/搜索检查。 */
  config?: FlowConfig;
}

// ===================== 检查列表构建 =====================

/**
 * 创建诊断检查列表，覆盖 provider 认证、渠道配置、搜索 provider 与配置完整性。
 *
 * 每个检查以 detect 函数形式返回 findings；当前实现为只读诊断，不提供 repair。
 */
export function createDoctorChecks(params: CreateDoctorChecksParams = {}): DoctorCheck[] {
  const env = params.env ?? process.env;
  const checks: DoctorCheck[] = [
    createProviderAuthCheck(env),
    createChannelConfigCheck(params.config),
    createSearchProviderCheck(params.config, env),
    createConfigIntegrityCheck(params.config),
  ];
  return checks;
}

/** Provider 认证检查：识别未认证的非本地 provider。 */
function createProviderAuthCheck(env: NodeJS.ProcessEnv): DoctorCheck {
  const id = 'provider-auth';
  const definition: HealthCheckDefinition = {
    id,
    kind: 'core',
    description: '检查已注册 provider 的认证状态',
    detect: async (): Promise<readonly HealthFinding[]> => {
      const findings: HealthFinding[] = [];
      for (const provider of getAllProviders()) {
        const status = resolveProviderAuthStatus(provider, env);
        if (status === 'unauthenticated') {
          const envVars = provider.envVars ?? [];
          const requirement = envVars.length > 0 ? envVars.join(' 或 ') : '查看 provider 文档';
          findings.push({
            checkId: id,
            severity: 'warning',
            message: `Provider "${provider.id}" 未认证`,
            source: 'provider-auth',
            target: provider.id,
            requirement,
            fixHint: envVars.length > 0 ? `设置环境变量 ${envVars.join(' / ')}` : undefined,
          });
        }
      }
      return findings;
    },
  };
  return { id, category: 'provider', description: definition.description, definition };
}

/** 渠道配置检查：识别已注册但未配置的渠道。 */
function createChannelConfigCheck(config: FlowConfig | undefined): DoctorCheck {
  const id = 'channel-config';
  const definition: HealthCheckDefinition = {
    id,
    kind: 'core',
    description: '检查渠道插件的配置状态',
    detect: async (): Promise<readonly HealthFinding[]> => {
      const findings: HealthFinding[] = [];
      const options = buildChannelSetupOptions({ config: config as never });
      if (options.length === 0) {
        findings.push({
          checkId: id,
          severity: 'info',
          message: '未注册任何渠道插件',
          source: 'channel-config',
        });
        return findings;
      }
      for (const option of options) {
        if (!option.configured) {
          findings.push({
            checkId: id,
            severity: 'info',
            message: `渠道 "${option.label}" 已注册但未配置`,
            source: 'channel-config',
            target: option.channelId,
            fixHint: `通过渠道设置流程配置 ${option.label}`,
          });
        }
      }
      return findings;
    },
  };
  return { id, category: 'channel', description: definition.description, definition };
}

/** 搜索 provider 检查：识别需要凭证但未就绪的 provider。 */
function createSearchProviderCheck(
  config: FlowConfig | undefined,
  env: NodeJS.ProcessEnv,
): DoctorCheck {
  const id = 'search-provider';
  const definition: HealthCheckDefinition = {
    id,
    kind: 'core',
    description: '检查 Web 搜索 provider 的凭证就绪状态',
    detect: async (): Promise<readonly HealthFinding[]> => {
      const findings: HealthFinding[] = [];
      const providers = getWebSearchProviders();
      if (providers.length === 0) {
        findings.push({
          checkId: id,
          severity: 'info',
          message: '未注册任何 Web 搜索 provider',
          source: 'search-provider',
        });
        return findings;
      }
      const ready = providers.filter((provider) =>
        isSearchProviderCredentialReady(provider, { config, env }),
      );
      if (ready.length === 0) {
        findings.push({
          checkId: id,
          severity: 'warning',
          message: '所有 Web 搜索 provider 均未配置凭证，web_search 不可用',
          source: 'search-provider',
          fixHint: '为任一搜索 provider 配置 API 密钥',
        });
      }
      return findings;
    },
  };
  return { id, category: 'search', description: definition.description, definition };
}

/** 配置完整性检查：识别配置缺失或为空的场景。 */
function createConfigIntegrityCheck(config: FlowConfig | undefined): DoctorCheck {
  const id = 'config-integrity';
  const definition: HealthCheckDefinition = {
    id,
    kind: 'core',
    description: '检查应用配置的完整性',
    detect: async (): Promise<readonly HealthFinding[]> => {
      const findings: HealthFinding[] = [];
      if (!config) {
        findings.push({
          checkId: id,
          severity: 'info',
          message: '未提供应用配置，跳过配置完整性检查',
          source: 'config-integrity',
        });
        return findings;
      }
      const keys = Object.keys(config);
      if (keys.length === 0) {
        findings.push({
          checkId: id,
          severity: 'warning',
          message: '应用配置为空，可能需要完成初始化向导',
          source: 'config-integrity',
          fixHint: '运行 setup 流程完成基础配置',
        });
      }
      return findings;
    },
  };
  return { id, category: 'config', description: definition.description, definition };
}

// ===================== 运行入口 =====================

/** runDoctorChecks 的可选参数。 */
export interface RunDoctorChecksParams extends CreateDoctorChecksParams {
  /** 健康检查模式，默认 doctor。 */
  mode?: HealthCheckContext['mode'];
  /** 工作目录。 */
  cwd?: string;
  /** 配置文件路径。 */
  configPath?: string;
  /** 收窄的校验范围。 */
  scope?: HealthCheckScope;
}

/**
 * 运行 doctor 诊断检查，返回检查结果与格式化输出。
 *
 * 内部调用 runHealthChecks 汇总所有 DoctorCheck 的 findings；
 * 单个检查抛错不会中断其余检查。
 */
export async function runDoctorChecks(
  params: RunDoctorChecksParams = {},
): Promise<{
  results: HealthCheckResult[];
  findings: readonly HealthFinding[];
  formatted: string;
}> {
  const checks = createDoctorChecks(params);
  const ctx: HealthCheckContext = {
    mode: params.mode ?? 'doctor',
    runtime: {
      cwd: params.cwd ?? process.cwd(),
      env: params.env ?? process.env,
      platform: process.platform,
    },
    cfg: params.config ?? {},
    ...(params.cwd !== undefined ? { cwd: params.cwd } : {}),
    ...(params.configPath !== undefined ? { configPath: params.configPath } : {}),
  };
  const results = await runHealthChecks(
    checks.map((check) => check.definition),
    ctx,
    params.scope,
  );
  const findings = results.flatMap((result) => result.findings);
  const formatted = formatHealthFindings(results);
  return { results, findings, formatted };
}
