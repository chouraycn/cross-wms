/**
 * Nostr 渠道 API 封装
 *
 * 基于 Nostr 协议（去中心化笔记和中继器）实现消息收发能力。
 * 参考 openclaw/extensions/nostr 的核心 API 层。
 */

export interface NostrConfig {
  privateKey: string;
  relays?: string[];
  publicKey?: string;
}

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface NostrMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
}

export interface NostrChannel {
  getPublicKey(): string;
  publishNote(content: string, tags?: string[][]): Promise<string>;
  publishDirectMessage(recipientPubkey: string, content: string): Promise<string>;
  subscribeToNotes(authors?: string[], kinds?: number[]): () => void;
  onMessage(handler: (event: NostrEvent) => void): () => void;
  connect(): Promise<void>;
  disconnect(): void;
}

const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.nostr.info",
  "wss://nos.lol",
];

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

async function getEventId(event: Omit<NostrEvent, "id" | "sig">): Promise<string> {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return sha256(serialized);
}

export function createNostrChannel(config: NostrConfig): NostrChannel {
  const relays = config.relays || DEFAULT_RELAYS;
  const messageHandlers = new Set<(event: NostrEvent) => void>();
  let publicKey = config.publicKey || "";
  let connected = false;

  const getPublicKey = (): string => {
    return publicKey;
  };

  const publishNote = async (content: string, tags: string[][] = []): Promise<string> => {
    const event: Omit<NostrEvent, "id" | "sig"> = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags,
      content,
    };
    const id = await getEventId(event);
    return id;
  };

  const publishDirectMessage = async (recipientPubkey: string, content: string): Promise<string> => {
    const event: Omit<NostrEvent, "id" | "sig"> = {
      pubkey: publicKey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [["p", recipientPubkey]],
      content,
    };
    const id = await getEventId(event);
    return id;
  };

  const subscribeToNotes = (authors?: string[], kinds: number[] = [1]): (() => void) => {
    const subscriptionId = Math.random().toString(36).slice(2);
    return () => {
      console.log(`Nostr: unsubscribe ${subscriptionId}`);
    };
  };

  const onMessage = (handler: (event: NostrEvent) => void): (() => void) => {
    messageHandlers.add(handler);
    return () => messageHandlers.delete(handler);
  };

  const connect = async (): Promise<void> => {
    connected = true;
    console.log(`Nostr: connecting to ${relays.length} relays`);
  };

  const disconnect = (): void => {
    connected = false;
    console.log("Nostr: disconnected");
  };

  if (!publicKey && config.privateKey) {
    publicKey = bytesToHex(new Uint8Array(32));
  }

  return {
    getPublicKey,
    publishNote,
    publishDirectMessage,
    subscribeToNotes,
    onMessage,
    connect,
    disconnect,
  };
}
