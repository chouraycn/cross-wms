import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../../logger.js";

export type SkillPermissionAction = "read" | "execute" | "install" | "uninstall" | "configure";

export type SkillPermission = {
  skillName: string;
  action: SkillPermissionAction;
  role: string;
  allowed: boolean;
};

export type SkillPermissionRule = {
  skillName?: string;
  action?: SkillPermissionAction;
  role?: string;
  allowed: boolean;
  priority: number;
};

export type PermissionCheckResult = {
  allowed: boolean;
  reason: string;
  rule?: SkillPermissionRule;
};

const permissionRules: SkillPermissionRule[] = [];

export function registerPermissionRule(rule: SkillPermissionRule): void {
  const existingIndex = permissionRules.findIndex(
    (r) =>
      r.skillName === rule.skillName &&
      r.action === rule.action &&
      r.role === rule.role,
  );

  if (existingIndex >= 0) {
    permissionRules[existingIndex] = rule;
    logger.debug(`[SkillPermission] Updated existing rule: ${rule.skillName}::${rule.action}::${rule.role}`);
  } else {
    permissionRules.push(rule);
    logger.debug(`[SkillPermission] Registered new rule: ${rule.skillName}::${rule.action}::${rule.role}`);
  }
}

export function checkSkillPermission(
  skillName: string,
  action: SkillPermissionAction,
  role: string,
): PermissionCheckResult {
  const sortedRules = [...permissionRules].sort((a, b) => b.priority - a.priority);

  for (const rule of sortedRules) {
    const skillMatch = !rule.skillName || rule.skillName === skillName;
    const actionMatch = !rule.action || rule.action === action;
    const roleMatch = !rule.role || rule.role === role;

    if (skillMatch && actionMatch && roleMatch) {
      const reason = rule.allowed
        ? `Permission granted by rule (priority: ${rule.priority})`
        : `Permission denied by rule (priority: ${rule.priority})`;

      logger.debug(`[SkillPermission] Check ${skillName}::${action}::${role}: ${rule.allowed ? "allowed" : "denied"}`);

      return {
        allowed: rule.allowed,
        reason,
        rule,
      };
    }
  }

  logger.debug(`[SkillPermission] Check ${skillName}::${action}::${role}: denied (no matching rule)`);

  return {
    allowed: false,
    reason: "No matching permission rule found",
  };
}

export function getSkillPermissions(skillName: string): SkillPermissionRule[] {
  return permissionRules.filter((r) => !r.skillName || r.skillName === skillName);
}

export function setSkillPermission(
  skillName: string,
  action: SkillPermissionAction,
  role: string,
  allowed: boolean,
): void {
  const rule: SkillPermissionRule = {
    skillName,
    action,
    role,
    allowed,
    priority: 100,
  };

  registerPermissionRule(rule);
  logger.info(`[SkillPermission] Set permission: ${skillName}::${action}::${role} = ${allowed}`);
}

export type PermissionConfig = {
  rules: SkillPermissionRule[];
};

export function loadPermissionsFromConfig(config: PermissionConfig): void {
  permissionRules.length = 0;

  if (config.rules) {
    for (const rule of config.rules) {
      registerPermissionRule(rule);
    }
  }

  logger.info(`[SkillPermission] Loaded ${config.rules?.length || 0} permission rules from config`);
}

export async function savePermissionsToFile(filePath: string): Promise<void> {
  const config: PermissionConfig = {
    rules: permissionRules,
  };

  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }

  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
  logger.info(`[SkillPermission] Saved ${permissionRules.length} permission rules to ${filePath}`);
}

export function clearPermissionRules(): void {
  permissionRules.length = 0;
  logger.debug("[SkillPermission] Cleared all permission rules");
}

export function getPermissionRules(): SkillPermissionRule[] {
  return [...permissionRules];
}

const defaultRules: SkillPermissionRule[] = [
  { skillName: undefined, action: undefined, role: "admin", allowed: true, priority: 200 },
  { skillName: undefined, action: "read", role: undefined, allowed: true, priority: 150 },
  { skillName: undefined, action: "execute", role: "user", allowed: true, priority: 100 },
  { skillName: undefined, action: "install", role: "user", allowed: true, priority: 90 },
  { skillName: undefined, action: "uninstall", role: "user", allowed: true, priority: 90 },
  { skillName: undefined, action: "configure", role: "user", allowed: true, priority: 90 },
];

export function initDefaultPermissions(): void {
  for (const rule of defaultRules) {
    registerPermissionRule(rule);
  }
  logger.info("[SkillPermission] Initialized default permission rules");
}