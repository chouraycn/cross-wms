/**
 * Doctor 核心检查 — 参考 openclaw/src/flows/doctor-core-checks.ts
 *
 * 收集环境、配置、运行时就绪性等核心诊断检查，作为 doctor 流程的基础检查集。
 * 整合并扩展现有 doctor-health 中的检查，提供可组合的核心检查工厂。
 */

import type {
  FlowConfig,
  HealthCheck,
  HealthCheckContext,
  HealthFinding,
  HealthRepairContext,
  HealthRepairResult,
} from './types.js';
import { registerHealthCheck } from './health-check-registry.js';
import { logger } from '../../logger.js';

// ===================== 检查 ID 常量 =====================

export const CONFIG_INTEGRITY_CHECK_ID = 'core/doctor/config-integrity';
export const PROVIDER_AUTH_CHECK_ID = 'core/doctor/provider-auth';
export const CHANNEL_CONFIG_CHECK_ID = 'core/doctor/channel-config';
export const SEARCH_PROVIDER_CHECK_ID = 'core/doctor/search-provider';
export const DEFAULT_MODEL_CHECK_ID = 'core/doctor/default-model';
export const WORKING_DIR_CHECK_ID = 'core/doctor/working-directory';
export const ENVIRONMENT_CHECK_ID = 'core/doctor/environment';

// ===================== 辅助函数 =====================

/** 构建单条 finding 的便捷函数。 */
function buildFinding(params: {
  checkId: string;
  severity: HealthFinding['severity'];
  message: string;
  path?: string;
  source?: string;
  target?: string;
  fixHint?: string;
  requirement?: string;
}): HealthFinding {
  return {
    checkId: params.checkId,
    severity: params.severity,
    message: params.message,
    ...(params.path ? { path: params.path } : {}),
    ...(params.source ? { source: params.source } : {}),
    ...(params.target ? { target: params.target } : {}),
    ...(params.fixHint ? { fixHint: params.fixHint } : {}),
    ...(params.requirement ? { requirement: params.requirement } : {}),
  };
}

// ===================== 配置完整性检查 =====================

/**
 * 配置完整性检查：验证配置存在且非空。
 * 支持修复：空配置时初始化基础结构。
 */
export const configIntegrityCheck: HealthCheck = {
  id: CONFIG_INTEGRITY_CHECK_ID,
  kind: 'core',
  description: '应用配置完整性与基础结构验证',
  source: 'doctor',
  async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
    const findings: HealthFinding[] = [];
    const cfg = ctx.cfg;

    if (!cfg || Object.keys(cfg).length === 0) {
      findings.push(
        buildFinding({
          checkId: CONFIG_INTEGRITY_CHECK_ID,
          severity: 'warning',
          message: '应用配置为空，可能需要完成初始化向导',
          path: '<root>',
          source: 'config-integrity',
          fixHint: '运行 setup 流程完成基础配置，或执行 doctor --fix 初始化默认配置',
        }),
      );
      return findings;
    }

    const requiredTopLevel = ['model', 'channels'];
    for (const key of requiredTopLevel) {
      if (!(key in cfg)) {
        findings.push(
          buildFinding({
            checkId: CONFIG_INTEGRITY_CHECK_ID,
            severity: 'info',
            message: `配置缺少 "${key}" 顶层节点`,
            path: key,
            source: 'config-integrity',
            fixHint: `添加 ${key} 配置节点`,
          }),
        );
      }
    }

    return findings;
  },
  async repair(ctx: HealthRepairContext): Promise<HealthRepairResult> {
    const cfg = ctx.cfg;
    if (cfg && Object.keys(cfg).length > 0) {
      return { status: 'skipped', reason: '配置非空，无需初始化', changes: [] };
    }
    const defaultConfig: FlowConfig = {
      model: {},
      channels: {},
      search: {},
    };
    const changes = ['初始化基础配置结构（model/channels/search 顶层节点）'];
    if (ctx.dryRun) {
      return { status: 'repaired', changes, effects: [{ kind: 'config', action: 'init-config', dryRunSafe: true }] };
    }
    return {
      status: 'repaired',
      config: defaultConfig,
      changes,
      effects: [{ kind: 'config', action: 'init-config', target: '<root>', dryRunSafe: true }],
    };
  },
};

// ===================== 工作目录检查 =====================

/**
 * 工作目录检查：验证 cwd 存在且可写。
 */
export const workingDirectoryCheck: HealthCheck = {
  id: WORKING_DIR_CHECK_ID,
  kind: 'core',
  description: '工作目录存在性与可写性验证',
  source: 'doctor',
  async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
    const findings: HealthFinding[] = [];
    const cwd = ctx.cwd ?? ctx.runtime?.cwd;

    if (!cwd) {
      findings.push(
        buildFinding({
          checkId: WORKING_DIR_CHECK_ID,
          severity: 'warning',
          message: '未设置工作目录（cwd）',
          source: 'working-directory',
          fixHint: '确保在有效目录下运行，或显式指定 --cwd',
        }),
      );
      return findings;
    }

    findings.push(
      buildFinding({
        checkId: WORKING_DIR_CHECK_ID,
        severity: 'info',
        message: `工作目录: ${cwd}`,
        path: cwd,
        source: 'working-directory',
      }),
    );

    return findings;
  },
};

// ===================== 环境变量检查 =====================

/**
 * 环境变量检查：验证关键环境变量设置。
 */
export const environmentCheck: HealthCheck = {
  id: ENVIRONMENT_CHECK_ID,
  kind: 'core',
  description: '运行环境变量与平台信息验证',
  source: 'doctor',
  async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
    const findings: HealthFinding[] = [];
    const env = ctx.runtime?.env ?? process.env;
    const platform = ctx.runtime?.platform ?? process.platform;

    findings.push(
      buildFinding({
        checkId: ENVIRONMENT_CHECK_ID,
        severity: 'info',
        message: `运行平台: ${platform}`,
        source: 'environment',
      }),
    );

    if (ctx.runtime?.isDev || env.NODE_ENV === 'development') {
      findings.push(
        buildFinding({
          checkId: ENVIRONMENT_CHECK_ID,
          severity: 'info',
          message: '运行模式: 开发模式（development）',
          source: 'environment',
        }),
      );
    }

    const nodeVersion = process.versions.node;
    if (nodeVersion) {
      const major = parseInt(nodeVersion.split('.')[0], 10);
      if (major < 20) {
        findings.push(
          buildFinding({
            checkId: ENVIRONMENT_CHECK_ID,
            severity: 'warning',
            message: `Node.js 版本 ${nodeVersion} 低于推荐的 20.x`,
            source: 'environment',
            fixHint: '升级到 Node.js 20 或更高版本',
          }),
        );
      } else {
        findings.push(
          buildFinding({
            checkId: ENVIRONMENT_CHECK_ID,
            severity: 'info',
            message: `Node.js 版本: ${nodeVersion}`,
            source: 'environment',
          }),
        );
      }
    }

    return findings;
  },
};

// ===================== Provider 认证检查 =====================

/**
 * Provider 认证检查依赖。
 * 提取为接口便于测试注入。
 */
export interface ProviderAuthCheckDeps {
  readonly getAllProviders: () => ReadonlyArray<{
    id: string;
    label?: string;
    name?: string;
    isLocal?: boolean;
    envVars?: readonly string[];
  }>;
  readonly resolveAuthStatus: (
    provider: { id: string; isLocal?: boolean; envVars?: readonly string[] },
    env: NodeJS.ProcessEnv,
  ) => 'authenticated' | 'unauthenticated' | 'local';
}

/**
 * 创建 Provider 认证检查。
 *
 * 识别未认证的非本地 provider，并提供修复建议。
 */
export function createProviderAuthCheck(deps: ProviderAuthCheckDeps): HealthCheck {
  return {
    id: PROVIDER_AUTH_CHECK_ID,
    kind: 'core',
    description: '已注册 provider 的认证状态检查',
    source: 'doctor',
    async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
      const findings: HealthFinding[] = [];
      const env = ctx.runtime?.env ?? process.env;
      const providers = deps.getAllProviders();

      if (providers.length === 0) {
        findings.push(
          buildFinding({
            checkId: PROVIDER_AUTH_CHECK_ID,
            severity: 'info',
            message: '未注册任何 model provider',
            source: 'provider-auth',
            fixHint: '配置至少一个 model provider 以启用 AI 功能',
          }),
        );
        return findings;
      }

      let authenticatedCount = 0;
      for (const provider of providers) {
        const status = deps.resolveAuthStatus(provider, env);
        if (status === 'unauthenticated') {
          const envVars = provider.envVars ?? [];
          const requirement = envVars.length > 0 ? envVars.join(' 或 ') : '查看 provider 文档';
          findings.push(
            buildFinding({
              checkId: PROVIDER_AUTH_CHECK_ID,
              severity: 'warning',
              message: `Provider "${provider.id}" 未认证`,
              source: 'provider-auth',
              target: provider.id,
              requirement,
              fixHint:
                envVars.length > 0
                  ? `设置环境变量 ${envVars.join(' / ')}`
                  : '配置 provider 认证信息',
            }),
          );
        } else {
          authenticatedCount++;
        }
      }

      if (authenticatedCount === 0 && findings.length === 0) {
        findings.push(
          buildFinding({
            checkId: PROVIDER_AUTH_CHECK_ID,
            severity: 'warning',
            message: '没有已认证的 model provider，AI 功能将不可用',
            source: 'provider-auth',
            fixHint: '配置至少一个 provider 的 API 密钥',
          }),
        );
      }

      return findings;
    },
  };
}

// ===================== 渠道配置检查 =====================

/**
 * 渠道配置检查依赖。
 */
export interface ChannelConfigCheckDeps {
  readonly getChannelOptions: (config?: FlowConfig) => ReadonlyArray<{
    channelId: string;
    label: string;
    configured: boolean;
    enabled: boolean;
  }>;
}

/**
 * 创建渠道配置检查。
 */
export function createChannelConfigCheck(deps: ChannelConfigCheckDeps): HealthCheck {
  return {
    id: CHANNEL_CONFIG_CHECK_ID,
    kind: 'core',
    description: '渠道插件配置状态检查',
    source: 'doctor',
    async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
      const findings: HealthFinding[] = [];
      const options = deps.getChannelOptions(ctx.cfg);

      if (options.length === 0) {
        findings.push(
          buildFinding({
            checkId: CHANNEL_CONFIG_CHECK_ID,
            severity: 'info',
            message: '未注册任何渠道插件',
            source: 'channel-config',
          }),
        );
        return findings;
      }

      let configuredCount = 0;
      for (const option of options) {
        if (!option.configured) {
          findings.push(
            buildFinding({
              checkId: CHANNEL_CONFIG_CHECK_ID,
              severity: 'info',
              message: `渠道 "${option.label}" 已注册但未配置`,
              source: 'channel-config',
              target: option.channelId,
              fixHint: `通过渠道设置流程配置 ${option.label}`,
            }),
          );
        } else {
          configuredCount++;
        }
      }

      if (configuredCount === 0 && findings.length > 0) {
        findings.push(
          buildFinding({
            checkId: CHANNEL_CONFIG_CHECK_ID,
            severity: 'warning',
            message: '所有已注册渠道均未配置，消息通道不可用',
            source: 'channel-config',
            fixHint: '配置至少一个渠道以启用消息收发',
          }),
        );
      }

      return findings;
    },
  };
}

// ===================== 搜索 Provider 检查 =====================

/**
 * 搜索 provider 检查依赖。
 */
export interface SearchProviderCheckDeps {
  readonly getSearchProviders: () => ReadonlyArray<{
    id: string;
    label: string;
    requiresCredential?: boolean;
  }>;
  readonly isCredentialReady: (
    provider: { id: string; requiresCredential?: boolean },
    params: { config?: FlowConfig; env?: NodeJS.ProcessEnv },
  ) => boolean;
}

/**
 * 创建搜索 provider 检查。
 */
export function createSearchProviderCheck(deps: SearchProviderCheckDeps): HealthCheck {
  return {
    id: SEARCH_PROVIDER_CHECK_ID,
    kind: 'core',
    description: 'Web 搜索 provider 凭证就绪状态检查',
    source: 'doctor',
    async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
      const findings: HealthFinding[] = [];
      const env = ctx.runtime?.env ?? process.env;
      const providers = deps.getSearchProviders();

      if (providers.length === 0) {
        findings.push(
          buildFinding({
            checkId: SEARCH_PROVIDER_CHECK_ID,
            severity: 'info',
            message: '未注册任何 Web 搜索 provider',
            source: 'search-provider',
          }),
        );
        return findings;
      }

      const ready = providers.filter((provider) =>
        deps.isCredentialReady(provider, { config: ctx.cfg, env }),
      );

      if (ready.length === 0) {
        findings.push(
          buildFinding({
            checkId: SEARCH_PROVIDER_CHECK_ID,
            severity: 'warning',
            message: '所有 Web 搜索 provider 均未配置凭证，web_search 不可用',
            source: 'search-provider',
            fixHint: '为任一搜索 provider 配置 API 密钥',
          }),
        );
      } else {
        findings.push(
          buildFinding({
            checkId: SEARCH_PROVIDER_CHECK_ID,
            severity: 'info',
            message: `${ready.length}/${providers.length} 个搜索 provider 凭证就绪`,
            source: 'search-provider',
          }),
        );
      }

      return findings;
    },
  };
}

// ===================== 默认模型检查 =====================

/**
 * 默认模型检查依赖。
 */
export interface DefaultModelCheckDeps {
  readonly resolveDefaultModel: (params: {
    config?: FlowConfig;
    authenticatedOnly?: boolean;
  }) => string | undefined;
}

/**
 * 创建默认模型检查。
 */
export function createDefaultModelCheck(deps: DefaultModelCheckDeps): HealthCheck {
  return {
    id: DEFAULT_MODEL_CHECK_ID,
    kind: 'core',
    description: '默认模型可用性检查',
    source: 'doctor',
    async detect(ctx: HealthCheckContext): Promise<readonly HealthFinding[]> {
      const findings: HealthFinding[] = [];

      const defaultModel = deps.resolveDefaultModel({
        config: ctx.cfg,
        authenticatedOnly: true,
      });

      if (!defaultModel) {
        findings.push(
          buildFinding({
            checkId: DEFAULT_MODEL_CHECK_ID,
            severity: 'warning',
            message: '没有可用的已认证默认模型',
            source: 'default-model',
            path: 'model.default',
            fixHint: '配置至少一个已认证的 provider，或设置 model.default',
          }),
        );
      } else {
        findings.push(
          buildFinding({
            checkId: DEFAULT_MODEL_CHECK_ID,
            severity: 'info',
            message: `默认模型: ${defaultModel}`,
            source: 'default-model',
            path: 'model.default',
          }),
        );
      }

      return findings;
    },
  };
}

// ===================== 核心检查集合 =====================

/** 核心健康检查依赖集合。 */
export interface CoreHealthCheckDeps {
  readonly providerAuth?: ProviderAuthCheckDeps;
  readonly channelConfig?: ChannelConfigCheckDeps;
  readonly searchProvider?: SearchProviderCheckDeps;
  readonly defaultModel?: DefaultModelCheckDeps;
}

/**
 * 构建核心健康检查集合。
 *
 * 所有检查按推荐顺序排列：环境 → 配置 → provider → 渠道 → 搜索。
 * 未提供依赖的检查会被跳过。
 */
export function buildCoreHealthChecks(
  deps: CoreHealthCheckDeps = {},
): readonly HealthCheck[] {
  const checks: HealthCheck[] = [
    environmentCheck,
    workingDirectoryCheck,
    configIntegrityCheck,
  ];

  if (deps.providerAuth) {
    checks.push(createProviderAuthCheck(deps.providerAuth));
  }
  if (deps.defaultModel) {
    checks.push(createDefaultModelCheck(deps.defaultModel));
  }
  if (deps.channelConfig) {
    checks.push(createChannelConfigCheck(deps.channelConfig));
  }
  if (deps.searchProvider) {
    checks.push(createSearchProviderCheck(deps.searchProvider));
  }

  return checks;
}

let coreRegistered = false;

/**
 * 注册核心健康检查到全局注册表。
 * 幂等操作，重复调用不会重复注册。
 */
export function registerCoreHealthChecks(deps: CoreHealthCheckDeps = {}): void {
  if (coreRegistered) {
    return;
  }
  const checks = buildCoreHealthChecks(deps);
  for (const check of checks) {
    try {
      registerHealthCheck(check);
    } catch (err) {
      logger.warn(`[doctor-core-checks] 注册检查 ${check.id} 失败: ${err}`);
    }
  }
  coreRegistered = true;
  logger.debug(`[doctor-core-checks] 已注册 ${checks.length} 个核心检查`);
}

/** 重置注册标记，用于测试。 */
export function resetCoreHealthChecksForTest(): void {
  coreRegistered = false;
}
