// 移植自 openclaw/src/channels/plugins/pairing.ts

export function listPairingChannels(..._args: any[]): any {
  return [];
}

export function getPairingAdapter(..._args: any[]): any {
  return undefined;
}

export function requirePairingAdapter(..._args: any[]): any {
  return undefined;
}

export async function notifyPairingApproved(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
