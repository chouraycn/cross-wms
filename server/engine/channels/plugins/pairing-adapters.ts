import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";

export type PairingStatus = "unpaired" | "pending" | "paired" | "rejected" | "expired";

export interface ChannelPairing {
  id: string;
  channelId: ChannelId;
  accountId?: AccountId;
  externalUserId: string;
  internalUserId?: string;
  status: PairingStatus;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface PairingRequest {
  channelId: ChannelId;
  accountId?: AccountId;
  externalUserId: string;
  code?: string;
  metadata?: Record<string, unknown>;
}

export interface PairingAdapter {
  initiatePairing?(request: PairingRequest): Promise<ChannelPairing>;
  confirmPairing?(pairingId: string, code: string): Promise<boolean>;
  getPairing?(pairingId: string): Promise<ChannelPairing | null>;
  removePairing?(pairingId: string): Promise<boolean>;
  findPairing?(channelId: ChannelId, externalUserId: string): Promise<ChannelPairing | null>;
}

const pairingAdapters = new Map<ChannelId, PairingAdapter>();
const pairings = new Map<string, ChannelPairing>();

export function registerPairingAdapter(channelId: ChannelId, adapter: PairingAdapter): void {
  pairingAdapters.set(channelId, adapter);
  logger.debug(`[Plugins:PairingAdapters] Registered pairing adapter for ${channelId}`);
}

export function unregisterPairingAdapter(channelId: ChannelId): void {
  pairingAdapters.delete(channelId);
}

export function getPairingAdapter(channelId: ChannelId): PairingAdapter | undefined {
  return pairingAdapters.get(channelId);
}

export async function initiatePairing(request: PairingRequest): Promise<ChannelPairing> {
  const adapter = pairingAdapters.get(request.channelId);

  if (adapter?.initiatePairing) {
    return adapter.initiatePairing(request);
  }

  const existing = await findPairing(request.channelId, request.externalUserId);
  if (existing && existing.status === "pending") {
    return existing;
  }

  const now = Date.now();
  const pairing: ChannelPairing = {
    id: `pairing-${now}-${Math.random().toString(36).slice(2, 8)}`,
    channelId: request.channelId,
    accountId: request.accountId,
    externalUserId: request.externalUserId,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    metadata: request.metadata,
  };

  pairings.set(pairing.id, pairing);
  logger.debug(`[Plugins:PairingAdapters] Initiated pairing ${pairing.id}`);
  return pairing;
}

export async function confirmPairing(pairingId: string, code: string): Promise<boolean> {
  const pairing = pairings.get(pairingId);
  if (!pairing) return false;

  const adapter = pairingAdapters.get(pairing.channelId);

  if (adapter?.confirmPairing) {
    return adapter.confirmPairing(pairingId, code);
  }

  if (pairing.status !== "pending") return false;
  if (pairing.expiresAt && Date.now() > pairing.expiresAt) {
    pairing.status = "expired";
    pairing.updatedAt = Date.now();
    return false;
  }

  pairing.status = "paired";
  pairing.updatedAt = Date.now();
  pairings.set(pairingId, pairing);

  logger.debug(`[Plugins:PairingAdapters] Confirmed pairing ${pairingId}`);
  return true;
}

export async function findPairing(
  channelId: ChannelId,
  externalUserId: string
): Promise<ChannelPairing | null> {
  const adapter = pairingAdapters.get(channelId);

  if (adapter?.findPairing) {
    return adapter.findPairing(channelId, externalUserId);
  }

  for (const pairing of pairings.values()) {
    if (pairing.channelId === channelId && pairing.externalUserId === externalUserId) {
      return pairing;
    }
  }

  return null;
}

export function getPairing(pairingId: string): ChannelPairing | undefined {
  return pairings.get(pairingId);
}

export async function removePairing(pairingId: string): Promise<boolean> {
  const pairing = pairings.get(pairingId);
  if (!pairing) return false;

  const adapter = pairingAdapters.get(pairing.channelId);

  if (adapter?.removePairing) {
    return adapter.removePairing(pairingId);
  }

  pairings.delete(pairingId);
  return true;
}

export function isPaired(channelId: ChannelId, externalUserId: string): boolean {
  for (const pairing of pairings.values()) {
    if (
      pairing.channelId === channelId &&
      pairing.externalUserId === externalUserId &&
      pairing.status === "paired"
    ) {
      return true;
    }
  }
  return false;
}

export function listPairings(channelId?: ChannelId): ChannelPairing[] {
  let all = Array.from(pairings.values());
  if (channelId) {
    all = all.filter((p) => p.channelId === channelId);
  }
  return all;
}

export function clearPairings(): void {
  pairings.clear();
}

export function hasPairingSupport(channelId: ChannelId): boolean {
  return pairingAdapters.has(channelId);
}
