import { getLogger } from './logger.js';

export type SkillLogContext = {
  skillName: string;
  action: string;
  durationMs?: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
};

type SkillLogger = {
  skillName: string;
  logAction: (context: Omit<SkillLogContext, 'skillName'>) => void;
  logExecution: (action: string, durationMs: number, success: boolean, error?: string) => void;
  logInstallation: (version: string, source: string, success: boolean, error?: string) => void;
  logSecurity: (verdict: string, details?: Record<string, unknown>) => void;
  logDiscovery: (filter: string, visible: boolean) => void;
};

export function createSkillLogger(skillName: string): SkillLogger {
  const logger = getLogger();

  return {
    skillName,

    logAction(context) {
      const { action, durationMs, success, error, metadata } = context;
      const level = success ? 'info' : 'error';
      const baseMsg = `[Skill] ${skillName} action=${action} success=${success}`;
      const durationPart = durationMs !== undefined ? ` duration=${durationMs}ms` : '';
      const errorPart = error ? ` error=${error}` : '';
      const metadataPart = metadata ? ` metadata=${JSON.stringify(metadata)}` : '';

      logger[level](`${baseMsg}${durationPart}${errorPart}${metadataPart}`);
    },

    logExecution(action, durationMs, success, error) {
      this.logAction({ action, durationMs, success, error });
    },

    logInstallation(version, source, success, error) {
      const level = success ? 'info' : 'error';
      const baseMsg = `[Skill] ${skillName} installed version=${version} source=${source} success=${success}`;
      const errorPart = error ? ` error=${error}` : '';

      logger[level](`${baseMsg}${errorPart}`);
    },

    logSecurity(verdict, details) {
      const level = verdict === 'rejected' ? 'warn' : 'info';
      const baseMsg = `[Skill] ${skillName} security_verdict=${verdict}`;
      const detailsPart = details ? ` details=${JSON.stringify(details)}` : '';

      logger[level](`${baseMsg}${detailsPart}`);
    },

    logDiscovery(filter, visible) {
      logger.debug(`[Skill] ${skillName} discovery filter="${filter}" visible=${visible}`);
    },
  };
}

export function logSkillAction(context: SkillLogContext): void {
  const { skillName, action, durationMs, success, error, metadata } = context;
  const logger = getLogger();
  const level = success ? 'info' : 'error';
  const baseMsg = `[Skill] ${skillName} action=${action} success=${success}`;
  const durationPart = durationMs !== undefined ? ` duration=${durationMs}ms` : '';
  const errorPart = error ? ` error=${error}` : '';
  const metadataPart = metadata ? ` metadata=${JSON.stringify(metadata)}` : '';

  logger[level](`${baseMsg}${durationPart}${errorPart}${metadataPart}`);
}

export function logSkillExecution(
  skillName: string,
  action: string,
  durationMs: number,
  success: boolean,
  error?: string,
): void {
  logSkillAction({ skillName, action, durationMs, success, error });
}

export function logSkillInstallation(
  skillName: string,
  version: string,
  source: string,
  success: boolean,
  error?: string,
): void {
  const logger = getLogger();
  const level = success ? 'info' : 'error';
  const baseMsg = `[Skill] ${skillName} installed version=${version} source=${source} success=${success}`;
  const errorPart = error ? ` error=${error}` : '';

  logger[level](`${baseMsg}${errorPart}`);
}

export function logSkillSecurity(
  skillName: string,
  verdict: string,
  details?: Record<string, unknown>,
): void {
  const logger = getLogger();
  const level = verdict === 'rejected' ? 'warn' : 'info';
  const baseMsg = `[Skill] ${skillName} security_verdict=${verdict}`;
  const detailsPart = details ? ` details=${JSON.stringify(details)}` : '';

  logger[level](`${baseMsg}${detailsPart}`);
}

export function logSkillDiscovery(
  skillName: string,
  filter: string,
  visible: boolean,
): void {
  getLogger().debug(`[Skill] ${skillName} discovery filter="${filter}" visible=${visible}`);
}