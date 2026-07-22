export type SafeBinProfile = {
  minPositional?: number;
  maxPositional?: number;
  allowedValueFlags?: ReadonlySet<string>;
  deniedFlags?: ReadonlySet<string>;
};

export const DEFAULT_SAFE_BINS = ["cut", "uniq", "head", "tail", "tr", "wc"] as const;
export const SAFE_BIN_PROFILES: Record<string, SafeBinProfile> = {};
export function validateSafeBinArgv(_argv: string[], _profile: SafeBinProfile): boolean { return true; }