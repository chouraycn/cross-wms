/**
 * policy 命令
 * 策略管理 (list/show/apply/validate)
 *
 * 参考 openclaw exec-policy-cli，管理执行策略与规则。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type PolicyOptions = {
  json?: boolean;
  dryRun?: boolean;
};

type PolicyScope = "agent" | "gateway" | "plugin" | "sandbox";

interface PolicyEntry {
  id: string;
  name: string;
  scope: PolicyScope;
  rules: PolicyRule[];
  active: boolean;
  version: string;
  createdAt: string;
}

interface PolicyRule {
  action: string;
  effect: "allow" | "deny";
  condition?: string;
}

const POLICY_STORE: Map<string, PolicyEntry> = new Map([
  [
    "pol-001",
    {
      id: "pol-001",
      name: "default-agent-policy",
      scope: "agent",
      rules: [
        { action: "chat.send", effect: "allow" },
        { action: "file.delete", effect: "deny", condition: "path.startsWith('/system/')" },
        { action: "shell.exec", effect: "deny" },
      ],
      active: true,
      version: "1.0.0",
      createdAt: "2025-01-01T00:00:00Z",
    },
  ],
  [
    "pol-002",
    {
      id: "pol-002",
      name: "gateway-cors-policy",
      scope: "gateway",
      rules: [
        { action: "cors.origin", effect: "allow", condition: "origin in ['localhost', 'app.example.com']" },
      ],
      active: true,
      version: "1.0.0",
      createdAt: "2025-01-02T00:00:00Z",
    },
  ],
  [
    "pol-003",
    {
      id: "pol-003",
      name: "sandbox-restrict-policy",
      scope: "sandbox",
      rules: [
        { action: "network.access", effect: "deny", condition: "port < 1024" },
        { action: "fs.write", effect: "allow", condition: "path.startsWith('/tmp/')" },
      ],
      active: false,
      version: "0.9.0",
      createdAt: "2025-01-05T00:00:00Z",
    },
  ],
]);

function listPolicies(scope?: string): PolicyEntry[] {
  const all = Array.from(POLICY_STORE.values());
  if (scope) {
    return all.filter((p) => p.scope === scope);
  }
  return all;
}

function getPolicy(id: string): PolicyEntry | undefined {
  return POLICY_STORE.get(id);
}

function validatePolicy(rules: PolicyRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const rule of rules) {
    if (!rule.action) {
      errors.push("规则缺少 action 字段");
    }
    if (rule.effect !== "allow" && rule.effect !== "deny") {
      errors.push(`无效的 effect: ${rule.effect}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

function applyPolicy(id: string, dryRun: boolean): { applied: boolean; policyId: string } {
  const policy = POLICY_STORE.get(id);
  if (!policy) {
    return { applied: false, policyId: id };
  }
  if (!dryRun) {
    policy.active = true;
  }
  return { applied: true, policyId: id };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatPolicyList(policies: PolicyEntry[]): string {
  const lines: string[] = ["", "  策略列表:"];
  for (const p of policies) {
    const icon = p.active ? "✓" : "✗";
    lines.push(`    ${icon} ${p.id} ${p.name} [${p.scope}] v${p.version} (${p.rules.length} 条规则)`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerPolicyCommand(program: Command): void {
  const policyCmd = program
    .command("policy")
    .description("策略管理 (list/show/apply/validate)");

  policyCmd
    .command("list")
    .description("列出策略")
    .option("--scope <scope>", "按范围过滤 (agent/gateway/plugin/sandbox)")
    .option("--json", "JSON 输出格式")
    .action((options: PolicyOptions & { scope?: string }) => {
      const policies = listPolicies(options.scope);
      if (options.json) {
        logger.info(formatJsonOutput(policies));
      } else {
        logger.info(formatPolicyList(policies));
      }
    });

  policyCmd
    .command("show <id>")
    .description("查看策略详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: PolicyOptions) => {
      const policy = getPolicy(id);
      if (!policy) {
        logger.error(`未找到策略: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(policy));
      } else {
        logger.info("");
        logger.info(`  策略: ${policy.id}`);
        logger.info(`    名称: ${policy.name}`);
        logger.info(`    范围: ${policy.scope}`);
        logger.info(`    状态: ${policy.active ? "激活" : "未激活"}`);
        logger.info(`    版本: ${policy.version}`);
        logger.info(`    规则:`);
        for (const rule of policy.rules) {
          const icon = rule.effect === "allow" ? "✓" : "✗";
          logger.info(`      ${icon} ${rule.action} -> ${rule.effect}${rule.condition ? ` (条件: ${rule.condition})` : ""}`);
        }
        logger.info("");
      }
    });

  policyCmd
    .command("apply <id>")
    .description("应用策略")
    .option("--dry-run", "仅预检")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: PolicyOptions) => {
      const result = applyPolicy(id, Boolean(options.dryRun));
      if (!result.applied) {
        logger.error(`未找到策略: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(options.dryRun ? `预检通过: 策略 ${id} 可应用` : `已应用策略: ${id}`);
      }
    });

  policyCmd
    .command("validate <id>")
    .description("验证策略规则")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: PolicyOptions) => {
      const policy = getPolicy(id);
      if (!policy) {
        logger.error(`未找到策略: ${id}`);
        return;
      }
      const result = validatePolicy(policy.rules);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.valid ? `✓ 策略 ${id} 验证通过` : `✗ 策略 ${id} 验证失败`);
        for (const err of result.errors) {
          logger.info(`  ✗ ${err}`);
        }
      }
    });

  // 默认 list
  policyCmd
    .option("--json", "JSON 输出格式")
    .action((options: PolicyOptions) => {
      const policies = listPolicies();
      if (options.json) {
        logger.info(formatJsonOutput(policies));
      } else {
        logger.info(formatPolicyList(policies));
      }
    });
}
