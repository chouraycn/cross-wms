// 移植自 openclaw/src/channels/plugins/pairing.ts

export function listPairingChannels(..._args: unknown[]): unknown {
  return [];
}

export function getPairingAdapter(..._args: unknown[]): unknown {
  return undefined;
}

export function requirePairingAdapter(..._args: unknown[]): unknown {
  return undefined;
}

export async function notifyPairingApproved(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
