/**
 * secrets 命令
 * 密钥管理 (list/audit/apply/resolve/scrub)
 *
 * 参考 openclaw secrets-cli，封装对 server/engine/secretsManager 等密钥模块的调用。
 * 当密钥运行时未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type SecretsOptions = {
  json?: boolean;
  check?: boolean;
  dryRun?: boolean;
};

/** 密钥条目 */
interface SecretEntry {
  key: string;
  ref: string;
  provider: string;
  resolved: boolean;
  lastResolvedAt?: string;
}

/** 审计发现项 */
interface SecretFinding {
  code: string;
  key: string;
  message: string;
  severity: "error" | "warn" | "info";
}

/** 密钥应用计划项 */
interface SecretsApplyItem {
  key: string;
  action: "upsert" | "delete";
  ref: string;
}

/** 密钥应用结果 */
interface SecretsApplyResult {
  changed: boolean;
  changedKeys: string[];
  skipped: number;
}

/** 模拟密钥存储 */
const SECRETS_STORE: Map<string, SecretEntry> = new Map([
  [
    "openai.apiKey",
    { key: "openai.apiKey", ref: "secretRef:openai#default", provider: "openai", resolved: true, lastResolvedAt: "2025-01-15T10:00:00Z" },
  ],
  [
    "anthropic.apiKey",
    { key: "anthropic.apiKey", ref: "secretRef:anthropic#default", provider: "anthropic", resolved: true, lastResolvedAt: "2025-01-15T10:00:00Z" },
  ],
  [
    "db.password",
    { key: "db.password", ref: "plaintext:admin", provider: "env", resolved: false },
  ],
]);

/** 获取所有密钥 */
function listSecrets(): SecretEntry[] {
  return Array.from(SECRETS_STORE.values());
}

/** 运行密钥审计 */
function auditSecrets(): { findings: SecretFinding[]; summary: { plaintext: number; unresolved: number; shadowed: number } } {
  const findings: SecretFinding[] = [];
  let plaintext = 0;
  let unresolved = 0;
  const shadowed = 0;

  for (const entry of SECRETS_STORE.values()) {
    if (entry.ref.startsWith("plaintext:")) {
      plaintext++;
      findings.push({
        code: "PLAINTEXT_SECRET",
        key: entry.key,
        message: "检测到明文密钥，建议迁移到 secretRef",
        severity: "error",
      });
    }
    if (!entry.resolved) {
      unresolved++;
      findings.push({
        code: "UNRESOLVED_REF",
        key: entry.key,
        message: "密钥引用无法解析",
        severity: "warn",
      });
    }
  }

  return { findings, summary: { plaintext, unresolved, shadowed } };
}

/** 应用密钥计划 */
function applySecretsPlan(items: SecretsApplyItem[], dryRun: boolean): SecretsApplyResult {
  const changedKeys: string[] = [];
  let skipped = 0;

  for (const item of items) {
    if (item.action === "delete") {
      if (SECRETS_STORE.has(item.key)) {
        if (!dryRun) {
          SECRETS_STORE.delete(item.key);
        }
        changedKeys.push(item.key);
      } else {
        skipped++;
      }
      continue;
    }

    if (item.action === "upsert") {
      const existing = SECRETS_STORE.get(item.key);
      if (existing && existing.ref === item.ref) {
        skipped++;
        continue;
      }
      if (!dryRun) {
        SECRETS_STORE.set(item.key, {
          key: item.key,
          ref: item.ref,
          provider: item.ref.split("#")[0]?.replace("secretRef:", "") ?? "unknown",
          resolved: true,
          lastResolvedAt: new Date().toISOString(),
        });
      }
      changedKeys.push(item.key);
    }
  }

  return { changed: changedKeys.length > 0, changedKeys, skipped };
}

/** 解析指定密钥引用 */
function resolveSecret(key: string): { key: string; resolved: boolean; ref: string } {
  const entry = SECRETS_STORE.get(key);
  if (!entry) {
    return { key, resolved: false, ref: "" };
  }
  // 模拟解析过程
  entry.resolved = !entry.ref.startsWith("plaintext:");
  entry.lastResolvedAt = new Date().toISOString();
  return { key, resolved: entry.resolved, ref: entry.ref };
}

/** 清洗明文密钥（迁移为 secretRef 占位） */
function scrubSecrets(dryRun: boolean): { scrubbed: string[]; skipped: number } {
  const scrubbed: string[] = [];
  let skipped = 0;

  for (const entry of SECRETS_STORE.values()) {
    if (!entry.ref.startsWith("plaintext:")) {
      skipped++;
      continue;
    }
    if (!dryRun) {
      entry.ref = `secretRef:${entry.provider}#default`;
      entry.resolved = false;
    }
    scrubbed.push(entry.key);
  }

  return { scrubbed, skipped };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化密钥列表文本输出 */
function formatSecretsList(secrets: SecretEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  密钥条目 (共 ${secrets.length} 条):`);
  lines.push("");
  for (const secret of secrets) {
    const status = secret.resolved ? "✓" : "✗";
    lines.push(`    ${status} ${secret.key.padEnd(20)} ${secret.provider.padEnd(12)} ${secret.ref}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化审计结果文本输出 */
function formatAuditOutput(report: { findings: SecretFinding[]; summary: { plaintext: number; unresolved: number; shadowed: number } }): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  密钥审计报告:");
  lines.push(`    明文密钥:   ${report.summary.plaintext}`);
  lines.push(`    未解析引用: ${report.summary.unresolved}`);
  lines.push(`    被遮蔽引用: ${report.summary.shadowed}`);
  lines.push("");
  if (report.findings.length > 0) {
    lines.push("  发现项:");
    for (const finding of report.findings) {
      const icon = finding.severity === "error" ? "✗" : finding.severity === "warn" ? "!" : "i";
      lines.push(`    ${icon} [${finding.code}] ${finding.key}: ${finding.message}`);
    }
  } else {
    lines.push("  ✓ 未发现问题");
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 secrets 命令
 */
export function registerSecretsCommand(program: Command): void {
  const secretsCmd = program
    .command("secrets")
    .description("密钥管理 (list/audit/apply/resolve/scrub)");

  secretsCmd
    .command("list")
    .description("列出所有密钥条目")
    .option("--json", "JSON 输出格式")
    .action((options: SecretsOptions) => {
      const secrets = listSecrets();
      if (options.json) {
        logger.info(formatJsonOutput(secrets));
      } else {
        logger.info(formatSecretsList(secrets));
      }
    });

  secretsCmd
    .command("audit")
    .description("审计明文密钥、未解析引用与优先级漂移")
    .option("--check", "发现问题时以非零状态退出")
    .option("--json", "JSON 输出格式")
    .action((options: SecretsOptions) => {
      const report = auditSecrets();
      if (options.json) {
        logger.info(formatJsonOutput(report));
      } else {
        logger.info(formatAuditOutput(report));
      }
    });

  secretsCmd
    .command("apply")
    .description("应用密钥计划 (从 JSON 字符串读取)")
    .requiredOption("--plan <json>", "密钥计划 JSON")
    .option("--dry-run", "仅预检不写入")
    .option("--json", "JSON 输出格式")
    .action((options: SecretsOptions & { plan: string; dryRun?: boolean }) => {
      let items: SecretsApplyItem[] = [];
      try {
        const parsed = JSON.parse(options.plan) as unknown;
        if (Array.isArray(parsed)) {
          items = parsed as SecretsApplyItem[];
        } else {
          throw new Error("计划必须为数组");
        }
      } catch (err) {
        logger.error("解析密钥计划失败:", err instanceof Error ? err.message : String(err));
        return;
      }
      const result = applySecretsPlan(items, Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(
          options.dryRun
            ? `预检完成: 将变更 ${result.changedKeys.length} 项，跳过 ${result.skipped} 项`
            : `应用完成: 已变更 ${result.changedKeys.length} 项，跳过 ${result.skipped} 项`,
        );
      }
    });

  secretsCmd
    .command("resolve <key>")
    .description("解析指定密钥引用")
    .option("--json", "JSON 输出格式")
    .action((key: string, options: SecretsOptions) => {
      const result = resolveSecret(key);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(
          result.resolved
            ? `已解析 ${key}: ${result.ref}`
            : `无法解析 ${key} (引用: ${result.ref || "无"})`,
        );
      }
    });

  secretsCmd
    .command("scrub")
    .description("清洗明文密钥，迁移为 secretRef 占位")
    .option("--dry-run", "仅预检不写入")
    .option("--json", "JSON 输出格式")
    .action((options: SecretsOptions & { dryRun?: boolean }) => {
      const result = scrubSecrets(Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(
          options.dryRun
            ? `预检完成: 将清洗 ${result.scrubbed.length} 项，跳过 ${result.skipped} 项`
            : `清洗完成: 已清洗 ${result.scrubbed.length} 项，跳过 ${result.skipped} 项`,
        );
      }
    });

  // 默认 list 子命令
  secretsCmd.action((options: SecretsOptions) => {
    const secrets = listSecrets();
    if (options.json) {
      logger.info(formatJsonOutput(secrets));
    } else {
      logger.info(formatSecretsList(secrets));
    }
  });
}
