/**
 * Doctor 命令类型定义
 * 定义检查项、结果、类别、严重程度等核心类型
 */

export enum DoctorSeverity {
  PASS = "pass",
  WARN = "warn",
  FAIL = "fail",
  INFO = "info",
}

export enum DoctorCategory {
  CONFIG = "config",
  WORKSPACE = "workspace",
  SECURITY = "security",
  PLUGINS = "plugins",
  SESSIONS = "sessions",
  SYSTEM = "system",
  GATEWAY = "gateway",
}

export type DoctorCheckId =
  | "doctor-config"
  | "doctor-disk-space"
  | "doctor-memory-search"
  | "doctor-plugin-registry"
  | "doctor-plugin-manifests"
  | "doctor-workspace"
  | "doctor-session-state"
  | "doctor-session-locks"
  | "doctor-security"
  | "doctor-sandbox"
  | "doctor-skills"
  | "doctor-gateway-health"
  | "doctor-lint"
  | "doctor-legacy-config"
  | "doctor-update";

export type DoctorFinding = {
  readonly id: string;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly target?: string;
  readonly fixHint?: string;
  readonly fixable?: boolean;
};

export type DoctorCheckResult = {
  readonly checkId: DoctorCheckId;
  readonly category: DoctorCategory;
  readonly severity: DoctorSeverity;
  readonly title: string;
  readonly description: string;
  readonly findings: readonly DoctorFinding[];
  readonly details?: Record<string, unknown>;
};

export type DoctorCheck = {
  readonly id: DoctorCheckId;
  readonly category: DoctorCategory;
  readonly title: string;
  readonly description: string;
  readonly run: (context: DoctorContext) => Promise<DoctorCheckResult>;
  readonly fix?: (context: DoctorContext) => Promise<boolean>;
};

export type DoctorContext = {
  readonly workspaceDir: string;
  readonly configDir: string;
  readonly dataDir: string;
  readonly verbose?: boolean;
  readonly fix?: boolean;
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly checksRun: number;
  readonly totalFindings: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly infoCount: number;
  readonly results: readonly DoctorCheckResult[];
  readonly findings: readonly DoctorFinding[];
  readonly categories: readonly DoctorCategory[];
  readonly startedAt: string;
  readonly finishedAt: string;
};

export type DoctorRunnerOptions = {
  readonly categories?: readonly DoctorCategory[];
  readonly onlyChecks?: readonly DoctorCheckId[];
  readonly skipChecks?: readonly DoctorCheckId[];
  readonly parallel?: boolean;
  readonly fix?: boolean;
  readonly verbose?: boolean;
};

export type DoctorFormatOptions = {
  readonly json?: boolean;
  readonly verbose?: boolean;
  readonly color?: boolean;
  readonly category?: DoctorCategory;
};
