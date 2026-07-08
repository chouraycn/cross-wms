import { randomUUID, createHash } from "node:crypto";

export const OPENCLAW_ACPX_LEASE_ID_ENV = "OPENCLAW_ACPX_LEASE_ID";
export const OPENCLAW_GATEWAY_INSTANCE_ID_ENV = "OPENCLAW_GATEWAY_INSTANCE_ID";
export const OPENCLAW_ACPX_LEASE_ID_ARG = "--openclaw-acpx-lease-id";
export const OPENCLAW_GATEWAY_INSTANCE_ID_ARG = "--openclaw-gateway-instance-id";

export type AcpxProcessLeaseState = "open" | "closing" | "closed" | "lost";

export type AcpxProcessLease = {
  leaseId: string;
  gatewayInstanceId: string;
  sessionKey: string;
  wrapperRoot: string;
  wrapperPath: string;
  rootPid: number;
  processGroupId?: number;
  commandHash: string;
  startedAt: number;
  state: AcpxProcessLeaseState;
};

export type AcpxProcessLeaseStore = {
  load(leaseId: string): Promise<AcpxProcessLease | undefined>;
  listOpen(gatewayInstanceId?: string): Promise<AcpxProcessLease[]>;
  save(lease: AcpxProcessLease): Promise<void>;
  markState(leaseId: string, state: AcpxProcessLeaseState): Promise<void>;
};

export type AcpxProcessLeaseFile = {
  version: 1;
  leases: AcpxProcessLease[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAcpxProcessLease(value: unknown): AcpxProcessLease | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const record = value;
  if (
    typeof record.leaseId !== "string" ||
    typeof record.gatewayInstanceId !== "string" ||
    typeof record.sessionKey !== "string" ||
    typeof record.wrapperRoot !== "string" ||
    typeof record.wrapperPath !== "string" ||
    typeof record.rootPid !== "number" ||
    typeof record.commandHash !== "string" ||
    typeof record.startedAt !== "number" ||
    !["open", "closing", "closed", "lost"].includes(String(record.state))
  ) {
    return undefined;
  }
  return {
    leaseId: record.leaseId,
    gatewayInstanceId: record.gatewayInstanceId,
    sessionKey: record.sessionKey,
    wrapperRoot: record.wrapperRoot,
    wrapperPath: record.wrapperPath,
    rootPid: record.rootPid,
    ...(typeof record.processGroupId === "number" ? { processGroupId: record.processGroupId } : {}),
    commandHash: record.commandHash,
    startedAt: record.startedAt,
    state: record.state as AcpxProcessLeaseState,
  };
}

export function normalizeAcpxProcessLeaseFile(value: unknown): AcpxProcessLeaseFile {
  const root = isRecord(value) ? value : {};
  const leases = Array.isArray(root.leases)
    ? root.leases
        .map(normalizeAcpxProcessLease)
        .filter((lease): lease is AcpxProcessLease => Boolean(lease))
    : [];
  return { version: 1, leases };
}

export function createAcpxProcessLeaseStore(): AcpxProcessLeaseStore {
  const leases = new Map<string, AcpxProcessLease>();
  let updateQueue: Promise<void> = Promise.resolve();

  async function update(mutator: () => Promise<void>): Promise<void> {
    const run = updateQueue.then(async () => {
      await mutator();
    });
    updateQueue = run.catch(() => {});
    await run;
  }

  return {
    async load(leaseId) {
      await updateQueue;
      return leases.get(leaseId);
    },
    async listOpen(gatewayInstanceId) {
      await updateQueue;
      return [...leases.values()].filter(
        (lease) =>
          (lease.state === "open" || lease.state === "closing") &&
          (!gatewayInstanceId || lease.gatewayInstanceId === gatewayInstanceId),
      );
    },
    async save(lease) {
      await update(async () => {
        leases.set(lease.leaseId, lease);
      });
    },
    async markState(leaseId, state) {
      await update(async () => {
        if (state === "closed" || state === "lost") {
          leases.delete(leaseId);
          return;
        }
        const lease = leases.get(leaseId);
        if (lease) {
          leases.set(leaseId, { ...lease, state });
        }
      });
    },
  };
}

export function createAcpxProcessLeaseId(): string {
  return randomUUID();
}

export function hashAcpxProcessCommand(command: string): string {
  return createHash("sha256").update(command).digest("hex");
}

function quoteEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`;
}

function appendAcpxLeaseArgs(params: {
  command: string;
  leaseId: string;
  gatewayInstanceId: string;
}): string {
  return [
    params.command,
    OPENCLAW_ACPX_LEASE_ID_ARG,
    quoteEnvValue(params.leaseId),
    OPENCLAW_GATEWAY_INSTANCE_ID_ARG,
    quoteEnvValue(params.gatewayInstanceId),
  ].join(" ");
}

export function withAcpxLeaseEnvironment(params: {
  command: string;
  leaseId: string;
  gatewayInstanceId: string;
  platform?: NodeJS.Platform;
}): string {
  if ((params.platform ?? process.platform) === "win32") {
    return appendAcpxLeaseArgs(params);
  }
  return [
    "env",
    `${OPENCLAW_ACPX_LEASE_ID_ENV}=${quoteEnvValue(params.leaseId)}`,
    `${OPENCLAW_GATEWAY_INSTANCE_ID_ENV}=${quoteEnvValue(params.gatewayInstanceId)}`,
    appendAcpxLeaseArgs(params),
  ].join(" ");
}