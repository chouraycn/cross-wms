export interface RuntimeVersionEnv {
  version?: string;
  commit?: string;
  CROSS_WMS_VERSION?: string;
  OPENCLAW_COMPATIBILITY_HOST_VERSION?: string;
}

export function resolveCompatibilityHostVersion(
  env: RuntimeVersionEnv = process.env as RuntimeVersionEnv,
): string {
  return (
    env.OPENCLAW_COMPATIBILITY_HOST_VERSION ??
    env.CROSS_WMS_VERSION ??
    '0.0.0'
  );
}
