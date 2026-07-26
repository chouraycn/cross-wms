// Policy wrapper for doctor repairs to services managed by external supervisors.
// 移植自 openclaw/src/commands/doctor-service-repair-policy.ts
//
// 降级说明：
//  - DoctorPrompter 来自 ./doctor-prompter.js
//    → 未移植，使用简化类型定义

type DoctorPrompter = {
  confirmRuntimeRepair: (params: unknown) => Promise<boolean>;
};

type ServiceRepairPolicy = "auto" | "external";

export const SERVICE_REPAIR_POLICY_ENV = "OPENCLAW_SERVICE_REPAIR_POLICY";

export const EXTERNAL_SERVICE_REPAIR_NOTE =
  "Gateway service is managed externally; skipped service install/start repair. Start or repair the gateway through your supervisor.";

export function resolveServiceRepairPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ServiceRepairPolicy {
  const value = env[SERVICE_REPAIR_POLICY_ENV]?.trim().toLowerCase();
  switch (value) {
    case "auto":
    case "external":
      return value;
    default:
      return "auto";
  }
}

export function isServiceRepairExternallyManaged(
  policy: ServiceRepairPolicy = resolveServiceRepairPolicy(),
): boolean {
  return policy === "external";
}

export async function confirmDoctorServiceRepair(
  prompter: DoctorPrompter,
  params: Parameters<DoctorPrompter["confirmRuntimeRepair"]>[0],
  policy: ServiceRepairPolicy = resolveServiceRepairPolicy(),
): Promise<boolean> {
  if (isServiceRepairExternallyManaged(policy)) {
    return false;
  }

  return await prompter.confirmRuntimeRepair(params);
}
