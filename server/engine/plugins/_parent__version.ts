export interface RuntimeVersionEnv {
  version?: string;
  commit?: string;
}

export function resolveCompatibilityHostVersion(): string {
  return process.env.CROSS_WMS_VERSION ?? '0.0.0';
}
