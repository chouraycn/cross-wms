type RuntimeLifecycleSnapshot = {
  running?: boolean | null;
  connected?: boolean | null;
  restartPending?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastDisconnect?:
    | string
    | {
        at: number;
        status?: number;
        error?: string;
        loggedOut?: boolean;
      }
    | null;
  lastEventAt?: number | null;
  lastTransportActivityAt?: number | null;
  healthState?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
};

type StatusSnapshotExtra = Record<string, any>;

type ComputedAccountStatusBase = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
};

type ComputedAccountStatusSnapshot<TExtra extends StatusSnapshotExtra = StatusSnapshotExtra> =
  ComputedAccountStatusBase & { extra?: TExtra };

type ChannelStatusIssue = {
  channel: string;
  accountId: string;
  kind: "config" | "runtime";
  message: string;
};

export type {
  RuntimeLifecycleSnapshot,
  StatusSnapshotExtra,
  ComputedAccountStatusBase,
  ComputedAccountStatusSnapshot,
  ChannelStatusIssue,
};

export function createDefaultChannelRuntimeState<T extends Record<string, any>>(
  accountId: string,
  extra?: T,
): {
  accountId: string;
  running: false;
  lastStartAt: null;
  lastStopAt: null;
  lastError: null;
} & T {
  return {
    accountId,
    running: false,
    lastStartAt: null,
    lastStopAt: null,
    lastError: null,
    ...(extra ?? ({} as T)),
  };
}

export function buildBaseChannelStatusSummary<TExtra extends StatusSnapshotExtra>(
  snapshot: {
    configured?: boolean | null;
    running?: boolean | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
  },
  extra?: TExtra,
) {
  return {
    configured: snapshot.configured ?? false,
    ...(extra ?? ({} as TExtra)),
    running: snapshot.running ?? false,
    lastStartAt: snapshot.lastStartAt ?? null,
    lastStopAt: snapshot.lastStopAt ?? null,
    lastError: snapshot.lastError ?? null,
  };
}

export function buildProbeChannelStatusSummary<TExtra extends Record<string, any>>(
  snapshot: {
    configured?: boolean | null;
    running?: boolean | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
    probe?: any;
    lastProbeAt?: number | null;
  },
  extra?: TExtra,
) {
  return {
    ...buildBaseChannelStatusSummary(snapshot, extra),
    probe: snapshot.probe,
    lastProbeAt: snapshot.lastProbeAt ?? null,
  };
}

export function buildWebhookChannelStatusSummary<TExtra extends StatusSnapshotExtra>(
  snapshot: {
    configured?: boolean | null;
    mode?: string | null;
    running?: boolean | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
  },
  extra?: TExtra,
) {
  return buildBaseChannelStatusSummary(snapshot, {
    mode: snapshot.mode ?? "webhook",
    ...(extra ?? ({} as TExtra)),
  });
}

export function buildBaseAccountStatusSnapshot<TExtra extends StatusSnapshotExtra>(
  params: {
    account: {
      accountId: string;
      name?: string;
      enabled?: boolean;
      configured?: boolean;
    };
    runtime?: RuntimeLifecycleSnapshot | null;
    probe?: any;
  },
  extra?: TExtra,
) {
  const { account, runtime, probe } = params;
  return {
    accountId: account.accountId,
    name: account.name,
    enabled: account.enabled,
    configured: account.configured,
    ...buildRuntimeAccountStatusSnapshot({ runtime, probe }),
    lastInboundAt: runtime?.lastInboundAt ?? null,
    lastOutboundAt: runtime?.lastOutboundAt ?? null,
    ...(extra ?? ({} as TExtra)),
  };
}

export function buildComputedAccountStatusSnapshot<TExtra extends StatusSnapshotExtra>(
  params: {
    accountId: string;
    name?: string;
    enabled?: boolean;
    configured?: boolean;
    runtime?: RuntimeLifecycleSnapshot | null;
    probe?: any;
  },
  extra?: TExtra,
) {
  const { accountId, name, enabled, configured, runtime, probe } = params;
  return buildBaseAccountStatusSnapshot(
    {
      account: {
        accountId,
        name,
        enabled,
        configured,
      },
      runtime,
      probe,
    },
    extra,
  );
}

export function buildRuntimeAccountStatusSnapshot<TExtra extends StatusSnapshotExtra>(
  params: {
    runtime?: RuntimeLifecycleSnapshot | null;
    probe?: any;
  },
  extra?: TExtra,
) {
  const { runtime, probe } = params;
  return {
    running: runtime?.running ?? false,
    lastStartAt: runtime?.lastStartAt ?? null,
    lastStopAt: runtime?.lastStopAt ?? null,
    lastError: runtime?.lastError ?? null,
    probe,
    ...(typeof runtime?.connected === "boolean" ? { connected: runtime.connected } : {}),
    ...(typeof runtime?.restartPending === "boolean"
      ? { restartPending: runtime.restartPending }
      : {}),
    ...(typeof runtime?.reconnectAttempts === "number"
      ? { reconnectAttempts: runtime.reconnectAttempts }
      : {}),
    ...(typeof runtime?.lastConnectedAt === "number"
      ? { lastConnectedAt: runtime.lastConnectedAt }
      : {}),
    ...(runtime?.lastDisconnect ? { lastDisconnect: runtime.lastDisconnect } : {}),
    ...(typeof runtime?.lastEventAt === "number" ? { lastEventAt: runtime.lastEventAt } : {}),
    ...(typeof runtime?.lastTransportActivityAt === "number"
      ? { lastTransportActivityAt: runtime.lastTransportActivityAt }
      : {}),
    ...(typeof runtime?.healthState === "string" ? { healthState: runtime.healthState } : {}),
    ...(extra ?? ({} as TExtra)),
  };
}

export function buildTokenChannelStatusSummary(
  snapshot: {
    configured?: boolean | null;
    tokenSource?: string | null;
    running?: boolean | null;
    mode?: string | null;
    lastStartAt?: number | null;
    lastStopAt?: number | null;
    lastError?: string | null;
    probe?: any;
    lastProbeAt?: number | null;
  },
  opts?: { includeMode?: boolean },
) {
  const base = {
    ...buildBaseChannelStatusSummary(snapshot),
    tokenSource: snapshot.tokenSource ?? "none",
    probe: snapshot.probe,
    lastProbeAt: snapshot.lastProbeAt ?? null,
  };
  if (opts?.includeMode === false) {
    return base;
  }
  return {
    ...base,
    mode: snapshot.mode ?? null,
  };
}

type ConfigIssueAccount = {
  accountId?: string | null;
  configured?: boolean | null;
} & Record<string, any>;

function normalizeOptionalString(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function createDependentCredentialStatusIssueCollector(options: {
  channel: string;
  dependencySourceKey: string;
  missingPrimaryMessage: string;
  missingDependentMessage: string;
  isDependencyConfigured?: ((value: any) => boolean) | undefined;
}) {
  const isDependencyConfigured =
    options.isDependencyConfigured ??
    ((value: any) => {
      const normalized = typeof value === "string" ? normalizeOptionalString(value) : undefined;
      return Boolean(normalized && normalized !== "none");
    });

  return (accounts: ConfigIssueAccount[]): ChannelStatusIssue[] =>
    accounts.flatMap((account) => {
      if (account.configured !== false) {
        return [];
      }
      return [
        {
          channel: options.channel,
          accountId: account.accountId ?? "",
          kind: "config" as const,
          message: isDependencyConfigured(account[options.dependencySourceKey])
            ? options.missingDependentMessage
            : options.missingPrimaryMessage,
        },
      ];
    });
}

export function collectStatusIssuesFromLastError(
  channel: string,
  accounts: Array<{ accountId: string; lastError?: any }>,
): ChannelStatusIssue[] {
  return accounts.flatMap((account) => {
    const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
    if (!lastError) {
      return [];
    }
    return [
      {
        channel,
        accountId: account.accountId,
        kind: "runtime" as const,
        message: `Channel error: ${lastError}`,
      },
    ];
  });
}
