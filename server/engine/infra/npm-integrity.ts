// 移植自 openclaw/src/infra/npm-integrity.ts
// 降级：install-source-utils 类型内联

export type NpmSpecResolution = {
  resolvedSpec?: string;
  integrity?: string;
  [key: string]: unknown;
};

export type NpmIntegrityDrift = {
  expectedIntegrity: string;
  actualIntegrity: string;
};

/** Payload passed to npm integrity drift handlers during archive installs. */
export type NpmIntegrityDriftPayload = {
  spec: string;
  expectedIntegrity: string;
  actualIntegrity: string;
  resolution: NpmSpecResolution;
};

function normalizeIntegrity(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

/** Compares expected and resolved npm integrity values. */
export async function resolveNpmIntegrityDrift<TPayload = NpmIntegrityDriftPayload>(params: {
  spec: string;
  expectedIntegrity?: string;
  resolution: NpmSpecResolution;
  createPayload: (params: { spec: string; expectedIntegrity: string; actualIntegrity: string; resolution: NpmSpecResolution }) => TPayload;
  onIntegrityDrift?: (payload: TPayload) => boolean | Promise<boolean>;
  warn?: (payload: TPayload) => void;
}): Promise<{ integrityDrift?: NpmIntegrityDrift; proceed: boolean; payload?: TPayload }> {
  const expectedIntegrity = normalizeIntegrity(params.expectedIntegrity);
  const actualIntegrity = normalizeIntegrity(params.resolution.integrity);
  if (!expectedIntegrity || !actualIntegrity) return { proceed: true };
  if (expectedIntegrity === actualIntegrity) return { proceed: true };

  const integrityDrift: NpmIntegrityDrift = { expectedIntegrity, actualIntegrity };
  const payload = params.createPayload({
    spec: params.spec,
    expectedIntegrity: integrityDrift.expectedIntegrity,
    actualIntegrity: integrityDrift.actualIntegrity,
    resolution: params.resolution,
  });

  let proceed = false;
  if (params.onIntegrityDrift) {
    proceed = await params.onIntegrityDrift(payload);
  } else {
    params.warn?.(payload);
  }
  return { integrityDrift, proceed, payload };
}

/** Resolves integrity drift with default warning and abort messages. */
export async function resolveNpmIntegrityDriftWithDefaultMessage(params: {
  spec: string;
  expectedIntegrity?: string;
  resolution: NpmSpecResolution;
  onIntegrityDrift?: (payload: NpmIntegrityDriftPayload) => boolean | Promise<boolean>;
  warn?: (message: string) => void;
}): Promise<{ integrityDrift?: NpmIntegrityDrift; error?: string }> {
  const driftResult = await resolveNpmIntegrityDrift({
    spec: params.spec,
    expectedIntegrity: params.expectedIntegrity,
    resolution: params.resolution,
    createPayload: (drift) => ({ ...drift, resolution: params.resolution }),
    onIntegrityDrift: params.onIntegrityDrift as unknown as undefined,
    warn: (driftPayload) => {
      params.warn?.(
        `Integrity drift detected for ${driftPayload.resolution.resolvedSpec ?? driftPayload.spec}: expected ${driftPayload.expectedIntegrity}, got ${driftPayload.actualIntegrity}`,
      );
    },
  });

  if (!driftResult.proceed && driftResult.payload) {
    const payload = driftResult.payload as NpmIntegrityDriftPayload;
    return {
      integrityDrift: driftResult.integrityDrift,
      error: `aborted: npm package integrity drift detected for ${payload.resolution.resolvedSpec ?? payload.spec}`,
    };
  }
  return { integrityDrift: driftResult.integrityDrift };
}
