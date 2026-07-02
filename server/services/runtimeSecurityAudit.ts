/**
 * 运行时安全审计服务
 *
 * 与 securityAuditor.ts（专注于 SKILL.md 文件静态扫描）互补，本模块专注于
 * 运行时配置安全审计：检查 settings.json 中的危险组合、exec 漂移、开放通道、
 * 网关无认证暴露、文件系统权限过宽、沙箱危险配置等运行时风险。
 *
 * 设计参考 OpenClaw 的 src/security/audit.ts：每个审计收集器为独立函数，
 * 返回 RuntimeAuditFinding[]，由 runRuntimeSecurityAudit 统一编排与抑制处理。
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

// ===================== 类型定义 =====================

/** 单条运行时安全审计发现 */
export interface RuntimeAuditFinding {
  /** 检查项稳定标识，用于抑制匹配与去重 */
  checkId: string;
  /** 简短标题 */
  title: string;
  /** 详细说明 */
  detail: string;
  /** 严重程度 */
  severity: 'critical' | 'warn' | 'info';
  /** 检查类别 */
  category: 'exec' | 'hardening' | 'permissions' | 'channels';
  /** 可选的修复建议 */
  recommendation?: string;
}

/** 审计抑制规则 */
export interface RuntimeAuditSuppression {
  /** 按 checkId 精确匹配 */
  checkId?: string;
  /** 按 title 正则匹配 */
  titlePattern?: string;
  /** 按 detail 正则匹配 */
  detailPattern?: string;
}

/** 运行时审计选项 */
export interface RuntimeAuditOptions {
  /** 抑制规则列表，匹配的 finding 会被移除并计入 suppressedCount */
  suppressions?: RuntimeAuditSuppression[];
}

/** 运行时审计结果 */
export interface RuntimeAuditResult {
  /** 经过抑制处理后保留的审计发现 */
  findings: RuntimeAuditFinding[];
  /** 被抑制的发现数量 */
  suppressedCount: number;
  /** 审计时间（ISO 字符串） */
  auditedAt: string;
}

// ===================== 辅助函数 =====================

/** 判断值是否为非空字符串 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** 规范化为小写字符串（非字符串返回 undefined） */
function normalizeLowercase(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim().toLowerCase();
}

/**
 * 读取 settings.json 配置。
 * 文件不存在或解析失败时返回空对象，避免审计流程因配置读取错误而中断。
 */
function readSettingsConfig(): Record<string, unknown> {
  const settingsPath = AppPaths.settingsFile;
  try {
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err) {
    logger.warn(
      '[RuntimeSecurityAudit] 读取 settings.json 失败，将以空配置继续审计:',
      err instanceof Error ? err.message : err,
    );
    return {};
  }
}

/** 从配置中按点分路径读取嵌套字段（如 "tools.exec.security"） */
function getField(cfg: Record<string, unknown>, dottedPath: string): unknown {
  const segments = dottedPath.split('.');
  let current: unknown = cfg;
  for (const seg of segments) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * 判断绑定地址是否为非 localhost。
 * 仅当显式绑定到 0.0.0.0、:: 或具体外部 IP/域名时返回 true。
 */
function isNonLocalhostBind(bind: unknown): boolean {
  const value = normalizeLowercase(bind);
  if (!value) {
    return false;
  }
  if (value === 'loopback' || value === 'localhost' || value === '127.0.0.1' || value === '::1') {
    return false;
  }
  if (value === '0.0.0.0' || value === '::' || value === 'all' || value === '*') {
    return true;
  }
  return true;
}

/**
 * 获取 POSIX 文件/目录的权限模式。
 * 返回 null 表示无法获取（如文件不存在或非 POSIX 平台）。
 */
function getPathMode(targetPath: string): number | null {
  try {
    if (!fs.existsSync(targetPath)) {
      return null;
    }
    const stat = fs.statSync(targetPath);
    // 低 12 位包含 setuid/setgid/sticky 与 rwx 权限位
    return stat.mode & 0o7777;
  } catch {
    return null;
  }
}

/**
 * 判断权限是否过宽。
 * 对目录：期望 0o700，若 group/other 有任何权限则视为过宽。
 * 对文件：期望 0o600，若 group/other 有任何权限则视为过宽。
 */
function isModeTooOpen(mode: number, isDir: boolean): boolean {
  // group/other 任意 rwx 位
  const groupOtherBits = mode & 0o077;
  if (groupOtherBits !== 0) {
    return true;
  }
  // 目录额外检查 sticky/setgid 不应出现（除非显式期望）
  if (isDir && (mode & 0o7000) !== 0) {
    return true;
  }
  return false;
}

// ===================== 审计收集器 =====================

/**
 * a) YOLO 检测：检查 security=full 与 ask=off 同时存在的危险组合。
 * 这种组合等同于让 agent 在无任何确认的情况下执行任意命令。
 */
function collectYoloFindings(cfg: Record<string, unknown>): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  // 在多个可能的路径上查找 security/ask 配置
  const securityCandidates = [
    getField(cfg, 'tools.exec.security'),
    getField(cfg, 'exec.security'),
    getField(cfg, 'security'),
  ];
  const askCandidates = [
    getField(cfg, 'tools.exec.ask'),
    getField(cfg, 'exec.ask'),
    getField(cfg, 'ask'),
  ];

  const securityValue = securityCandidates.find((v) => isNonEmptyString(v));
  const askValue = askCandidates.find((v) => isNonEmptyString(v));

  const securityIsFull = normalizeLowercase(securityValue) === 'full';
  const askIsOff = normalizeLowercase(askValue) === 'off';

  if (securityIsFull && askIsOff) {
    findings.push({
      checkId: 'runtime.yolo.security_full_ask_off',
      title: '检测到 YOLO 危险组合：security=full 且 ask=off',
      detail:
        '当前配置允许 agent 以完全信任模式执行命令（security=full）同时关闭所有确认提示（ask=off），' +
        '这意味着 agent 可在无任何人工确认的情况下执行任意命令，包括破坏性操作。' +
        '这是最高风险的运行时配置组合。',
      severity: 'critical',
      category: 'exec',
      recommendation:
        '将 security 调整为 "allowlist" 或 "deny"，或将 ask 调整为 "always"/"risky"。' +
        '仅在隔离的、可丢弃的沙箱环境中才考虑使用 YOLO 模式。',
    });
  }

  return findings;
}

/**
 * b) Exec 运行时漂移检测：检查 exec 相关配置是否被修改为危险形态。
 * 包括允许所有命令、无沙箱、sandbox 配置为 noop 等。
 */
function collectExecRuntimeDriftFindings(cfg: Record<string, unknown>): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  // 检查 exec.security === 'full'（单独出现，未与 ask=off 组合时仍需告警）
  const execSecurity = normalizeLowercase(getField(cfg, 'tools.exec.security')) ??
    normalizeLowercase(getField(cfg, 'exec.security'));
  if (execSecurity === 'full') {
    findings.push({
      checkId: 'runtime.exec.security_full_configured',
      title: 'Exec security=full 已配置',
      detail:
        'tools.exec.security 被设置为 "full"，表示完全信任 exec 执行的所有命令。' +
        '即使 ask 未关闭，这也显著扩大了攻击面。',
      severity: 'warn',
      category: 'exec',
      recommendation: '优先使用 "allowlist" 模式并配合 ask 提示，"full" 仅保留给紧约束的破窗 agent。',
    });
  }

  // 检查 exec.allowAll 或类似的全局放行配置
  const allowAll = getField(cfg, 'tools.exec.allowAll') ?? getField(cfg, 'exec.allowAll');
  if (allowAll === true) {
    findings.push({
      checkId: 'runtime.exec.allow_all_enabled',
      title: 'Exec allowAll 已启用',
      detail: 'tools.exec.allowAll=true 将放行所有命令，绕过 allowlist 与审批机制。',
      severity: 'critical',
      category: 'exec',
      recommendation: '关闭 allowAll，改用显式 allowlist 列表。',
    });
  }

  // 检查 sandbox 配置是否为 noop（占位实现，未真正隔离）
  const sandboxMode = normalizeLowercase(getField(cfg, 'tools.exec.sandbox')) ??
    normalizeLowercase(getField(cfg, 'exec.sandbox')) ??
    normalizeLowercase(getField(cfg, 'sandbox.mode'));
  if (sandboxMode === 'noop') {
    findings.push({
      checkId: 'runtime.exec.sandbox_noop',
      title: 'Sandbox 配置为 noop（占位实现）',
      detail:
        'sandbox=noop 表示沙箱为占位实现，不会对 exec 进行真正的隔离。' +
        '在这种模式下，exec 的安全边界完全依赖审批机制，一旦审批被绕过将无纵深防御。',
      severity: 'warn',
      category: 'exec',
      recommendation: '使用真实沙箱（如 docker/macos）或将 sandbox 设置为 "non-main"/"all"。',
    });
  }

  // 检查 exec.host 是否显式禁用沙箱（host=none / host=direct）
  const execHost = normalizeLowercase(getField(cfg, 'tools.exec.host')) ??
    normalizeLowercase(getField(cfg, 'exec.host'));
  if (execHost === 'none' || execHost === 'direct') {
    findings.push({
      checkId: 'runtime.exec.host_no_sandbox',
      title: 'Exec host 未使用沙箱',
      detail: `tools.exec.host="${execHost}" 表示命令直接在宿主机执行，无任何隔离边界。`,
      severity: 'warn',
      category: 'exec',
      recommendation: '将 host 设置为 "sandbox" 并启用真实沙箱运行时。',
    });
  }

  return findings;
}

/**
 * c) 开放通道 + exec 检测：检查 dmPolicy/groupPolicy 为 open 的通道是否可达 exec 工具。
 * 开放通道意味着外部任意用户可触达 agent，若 exec 可用将构成远程命令执行风险。
 */
function collectOpenChannelsWithExecFindings(cfg: Record<string, unknown>): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  // 判定 exec 工具是否可用（默认 deny，仅当显式启用时才视为可用）
  const execSecurity = normalizeLowercase(getField(cfg, 'tools.exec.security')) ??
    normalizeLowercase(getField(cfg, 'exec.security'));
  const execEnabled = execSecurity !== undefined && execSecurity !== 'deny';
  if (!execEnabled) {
    return findings;
  }

  // 递归遍历 channels 配置，收集所有 dmPolicy/groupPolicy === 'open' 的路径
  const openPaths: string[] = [];
  const channels = getField(cfg, 'channels');
  if (channels && typeof channels === 'object' && !Array.isArray(channels)) {
    const seen = new WeakSet<object>();
    const visit = (value: unknown, scope: string): void => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }
      const record = value as Record<string, unknown>;
      if (seen.has(record)) {
        return;
      }
      seen.add(record);
      if (normalizeLowercase(record.groupPolicy) === 'open') {
        openPaths.push(`${scope}.groupPolicy`);
      }
      if (normalizeLowercase(record.dmPolicy) === 'open') {
        openPaths.push(`${scope}.dmPolicy`);
      }
      for (const [key, nested] of Object.entries(record)) {
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
          visit(nested, `${scope}.${key}`);
        }
      }
    };
    for (const [channelId, channelValue] of Object.entries(channels as Record<string, unknown>)) {
      visit(channelValue, `channels.${channelId}`);
    }
  }

  if (openPaths.length > 0) {
    findings.push({
      checkId: 'runtime.channels.open_with_exec',
      title: '开放通道可达 exec 启用的 agent',
      detail:
        `检测到以下开放通道配置（dmPolicy/groupPolicy=open），且 exec 工具可用（security=${execSecurity}）：\n` +
        openPaths.map((p) => `- ${p}`).join('\n') +
        '\n开放通道意味着任意外部用户可触达 agent，配合 exec 将构成远程命令执行风险。',
      severity: 'warn',
      category: 'channels',
      recommendation:
        '将 dmPolicy/groupPolicy 收紧为 "pairing" 或 "allowlist"，或对可达开放通道的 agent 禁用 exec。',
    });
  }

  return findings;
}

/**
 * d) 网关 HTTP 无 auth 检测：检查网关是否在无认证模式下监听非 localhost。
 * 无认证 + 非本地监听 = 任意网络访问者可调用网关接口。
 */
function collectGatewayHttpNoAuthFindings(cfg: Record<string, unknown>): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  const gateway = getField(cfg, 'gateway');
  if (!gateway || typeof gateway !== 'object' || Array.isArray(gateway)) {
    return findings;
  }
  const gatewayCfg = gateway as Record<string, unknown>;

  const bind = gatewayCfg.bind ?? 'loopback';
  const nonLocal = isNonLocalhostBind(bind);
  if (!nonLocal) {
    return findings;
  }

  // 判定是否存在认证凭证
  const auth = gatewayCfg.auth;
  const authRecord =
    auth && typeof auth === 'object' && !Array.isArray(auth)
      ? (auth as Record<string, unknown>)
      : {};
  const authMode = normalizeLowercase(authRecord.mode);
  const hasToken = isNonEmptyString(authRecord.token);
  const hasPassword = isNonEmptyString(authRecord.password);

  // mode=none 或 mode=trusted-proxy 但无共享密钥均视为无 auth
  const noAuth =
    authMode === 'none' ||
    (authMode !== 'token' &&
      authMode !== 'password' &&
      !hasToken &&
      !hasPassword);

  if (noAuth) {
    findings.push({
      checkId: 'runtime.gateway.http_no_auth_nonlocal',
      title: '网关在无认证模式下监听非 localhost',
      detail:
        `gateway.bind="${bind}" 监听非本地地址，但未配置有效认证（mode=${authMode ?? 'unset'}，无 token/password）。` +
        '任意网络访问者均可调用网关接口，构成远程未授权访问风险。',
      severity: 'critical',
      category: 'hardening',
      recommendation:
        '设置 gateway.auth.mode="token" 或 "password" 并配置共享密钥，或将 bind 改回 "loopback"。',
    });
  }

  return findings;
}

/**
 * e) 文件系统权限检查：检查关键文件和目录的权限是否过宽。
 * - rootDir 目录期望 0o700
 * - settingsFile 期望 0o600
 * - encryptionKeyFile 期望 0o600
 */
function collectFilesystemPermissionFindings(): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  // rootDir 目录权限检查
  const rootMode = getPathMode(AppPaths.rootDir);
  if (rootMode !== null && isModeTooOpen(rootMode, true)) {
    findings.push({
      checkId: 'runtime.fs.root_dir.perms_too_open',
      title: '应用根目录权限过宽',
      detail:
        `${AppPaths.rootDir} 当前权限为 ${rootMode.toString(8)}，期望 0o700。` +
        '组用户或其他用户可读/写/进入该目录，可能导致敏感数据泄露或被篡改。',
      severity: 'warn',
      category: 'permissions',
      recommendation: `执行 chmod 700 "${AppPaths.rootDir}" 限制为仅属主可访问。`,
    });
  }

  // settingsFile 权限检查
  const settingsMode = getPathMode(AppPaths.settingsFile);
  if (settingsMode !== null && isModeTooOpen(settingsMode, false)) {
    findings.push({
      checkId: 'runtime.fs.settings_file.perms_too_open',
      title: 'settings.json 权限过宽',
      detail:
        `${AppPaths.settingsFile} 当前权限为 ${settingsMode.toString(8)}，期望 0o600。` +
        '配置文件可能包含 token 与敏感策略，组/其他用户可读将导致泄露。',
      severity: 'warn',
      category: 'permissions',
      recommendation: `执行 chmod 600 "${AppPaths.settingsFile}" 限制为仅属主可读写。`,
    });
  }

  // encryptionKeyFile 权限检查
  const keyMode = getPathMode(AppPaths.encryptionKeyFile);
  if (keyMode !== null && isModeTooOpen(keyMode, false)) {
    findings.push({
      checkId: 'runtime.fs.encryption_key.perms_too_open',
      title: '加密密钥文件权限过宽',
      detail:
        `${AppPaths.encryptionKeyFile} 当前权限为 ${keyMode.toString(8)}，期望 0o600。` +
        '加密密钥泄露将导致所有加密存储的数据可被解密，属严重风险。',
      severity: 'warn',
      category: 'permissions',
      recommendation: `执行 chmod 600 "${AppPaths.encryptionKeyFile}" 限制为仅属主可读写。`,
    });
  }

  return findings;
}

/**
 * f) 沙箱危险配置检测：检查沙箱是否被显式禁用或配置为危险模式。
 * sandbox=disabled/none 等同于关闭沙箱隔离边界。
 */
function collectSandboxDangerousConfigFindings(cfg: Record<string, unknown>): RuntimeAuditFinding[] {
  const findings: RuntimeAuditFinding[] = [];

  const sandboxMode = normalizeLowercase(getField(cfg, 'sandbox.mode')) ??
    normalizeLowercase(getField(cfg, 'tools.exec.sandbox')) ??
    normalizeLowercase(getField(cfg, 'agents.defaults.sandbox.mode'));

  if (sandboxMode === 'disabled' || sandboxMode === 'none' || sandboxMode === 'off') {
    findings.push({
      checkId: 'runtime.sandbox.disabled',
      title: `沙箱已被禁用（mode=${sandboxMode}）`,
      detail:
        `sandbox.mode="${sandboxMode}" 表示沙箱隔离被完全关闭。` +
        '在沙箱禁用模式下，exec 命令直接在宿主机执行，无文件系统/网络/进程隔离边界。',
      severity: 'warn',
      category: 'exec',
      recommendation:
        '启用沙箱（mode="non-main" 或 "all"）并配置真实沙箱运行时（docker/macos）。' +
        '仅在受控的、可丢弃的环境中才考虑禁用沙箱。',
    });
  }

  return findings;
}

// ===================== 抑制处理 =====================

/**
 * 应用审计抑制规则。
 * - 按 checkId 精确匹配
 * - 按 titlePattern 正则匹配
 * - 按 detailPattern 正则匹配
 * 任一规则匹配则该 finding 被移入 suppressed 列表。
 */
export function applySecurityAuditSuppressions(
  findings: RuntimeAuditFinding[],
  suppressions: RuntimeAuditSuppression[] | undefined,
): { suppressed: RuntimeAuditFinding[]; remaining: RuntimeAuditFinding[] } {
  if (!Array.isArray(suppressions) || suppressions.length === 0) {
    return { suppressed: [], remaining: findings };
  }

  const suppressed: RuntimeAuditFinding[] = [];
  const remaining: RuntimeAuditFinding[] = [];

  for (const finding of findings) {
    let isSuppressed = false;
    for (const rule of suppressions) {
      // checkId 精确匹配
      if (rule.checkId && finding.checkId === rule.checkId) {
        isSuppressed = true;
        break;
      }
      // titlePattern 正则匹配
      if (rule.titlePattern) {
        try {
          const regex = new RegExp(rule.titlePattern);
          if (regex.test(finding.title)) {
            isSuppressed = true;
            break;
          }
        } catch {
          // 无效正则忽略，避免单条错误规则中断整个抑制流程
        }
      }
      // detailPattern 正则匹配
      if (rule.detailPattern) {
        try {
          const regex = new RegExp(rule.detailPattern);
          if (regex.test(finding.detail)) {
            isSuppressed = true;
            break;
          }
        } catch {
          // 无效正则忽略
        }
      }
    }
    if (isSuppressed) {
      suppressed.push(finding);
    } else {
      remaining.push(finding);
    }
  }

  return { suppressed, remaining };
}

// ===================== 主审计函数 =====================

/**
 * 执行运行时安全审计。
 *
 * 编排所有审计收集器，汇总 findings，应用抑制规则，并记录审计结果日志。
 *
 * @param options 审计选项，可传入 suppressions 列表抑制已知且已接受的风险
 * @returns 审计结果，包含保留的 findings、被抑制数量与审计时间
 */
export async function runRuntimeSecurityAudit(
  options?: RuntimeAuditOptions,
): Promise<RuntimeAuditResult> {
  const auditedAt = new Date().toISOString();
  const cfg = readSettingsConfig();

  const allFindings: RuntimeAuditFinding[] = [];

  // a) YOLO 检测
  allFindings.push(...collectYoloFindings(cfg));
  // b) Exec 运行时漂移检测
  allFindings.push(...collectExecRuntimeDriftFindings(cfg));
  // c) 开放通道 + exec 检测
  allFindings.push(...collectOpenChannelsWithExecFindings(cfg));
  // d) 网关 HTTP 无 auth 检测
  allFindings.push(...collectGatewayHttpNoAuthFindings(cfg));
  // e) 文件系统权限检查
  allFindings.push(...collectFilesystemPermissionFindings());
  // f) 沙箱危险配置检测
  allFindings.push(...collectSandboxDangerousConfigFindings(cfg));

  // 应用抑制规则
  const { suppressed, remaining } = applySecurityAuditSuppressions(
    allFindings,
    options?.suppressions,
  );

  // 汇总日志
  const criticalCount = remaining.filter((f) => f.severity === 'critical').length;
  const warnCount = remaining.filter((f) => f.severity === 'warn').length;
  const infoCount = remaining.filter((f) => f.severity === 'info').length;
  logger.info(
    `[RuntimeSecurityAudit] 审计完成: critical=${criticalCount}, warn=${warnCount}, info=${infoCount}, suppressed=${suppressed.length}`,
  );
  if (criticalCount > 0) {
    logger.warn(
      `[RuntimeSecurityAudit] 检测到 ${criticalCount} 条 critical 级别风险，请立即处理:`,
      remaining
        .filter((f) => f.severity === 'critical')
        .map((f) => `${f.checkId}: ${f.title}`)
        .join(' | '),
    );
  }

  return {
    findings: remaining,
    suppressedCount: suppressed.length,
    auditedAt,
  };
}
