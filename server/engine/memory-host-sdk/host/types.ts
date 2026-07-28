// @ts-nocheck
// Public memory host type barrel.

export type MemoryHostStatus = {
  enabled: boolean;
  provider: string;
  endpoint?: string;
  connected: boolean;
  lastCheck?: number;
};

export type MemoryHostQueryResult = {
  ids: string[];
  scores: number[];
  metadata?: Record<string, unknown>;
};
