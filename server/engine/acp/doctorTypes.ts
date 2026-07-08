export type DoctorFindingId = string;

export type DoctorFinding = {
  readonly id: DoctorFindingId;
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly target?: string;
  readonly fixHint?: string;
  readonly source?: string;
  readonly scope?: DoctorScope;
};

export type DoctorScope =
  | "core"
  | "tools"
  | "channels"
  | "exec-approvals"
  | "sandbox"
  | "gateway"
  | "model-network"
  | "data-auth"
  | "policy";

export type DoctorCheckResult = {
  readonly scope: DoctorScope;
  readonly findings: readonly DoctorFinding[];
};

export type DoctorReport = {
  readonly ok: boolean;
  readonly scopesChecked: number;
  readonly totalFindings: number;
  readonly findings: readonly DoctorFinding[];
};

export type DoctorCheck = {
  readonly scope: DoctorScope;
  readonly check: (config: unknown) => Promise<DoctorFinding[]>;
};

export type DoctorRegistry = {
  register(check: DoctorCheck): void;
  getChecks(scope?: DoctorScope): readonly DoctorCheck[];
  runAll(config: unknown): Promise<DoctorReport>;
  runScopes(scopes: readonly DoctorScope[], config: unknown): Promise<DoctorReport>;
};

export const DOCTOR_CHECK_ID_PREFIXES = {
  core: "doctor/core/",
  tools: "doctor/tools/",
  channels: "doctor/channels/",
  execApprovals: "doctor/exec-approvals/",
  sandbox: "doctor/sandbox/",
  gateway: "doctor/gateway/",
  modelNetwork: "doctor/model-network/",
  dataAuth: "doctor/data-auth/",
  policy: "doctor/policy/",
};