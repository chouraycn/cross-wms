/**
 * Nostr 渠道内置模块。
 *
 * 参考 builtin-matrix.ts / builtin-discord.ts 的结构，实现 Nostr 渠道插件。
 * 支持 NIP-04 加密直接消息、relay 连接管理、kind:4 事件构造。
 *
 * 由于 nostr-tools 未在主项目依赖中，本模块使用 Node.js 内置 crypto 模块
 * 实现 NIP-04 加密（ECDH secp256k1 + AES-256-CBC）和 BIP-340 Schnorr 签名，
 * 使用全局 WebSocket（Node 20+）连接 relay。
 */

import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createECDH,
} from "node:crypto";
import type {
  ChannelId,
  ChannelMeta,
  ChannelCapabilities,
  ChannelConfigAdapter,
  AppConfig,
} from "./types.js";
import type { MessageSendContext, ChannelMessageSendResult } from "./message/types.js";
import { createBuiltinChannelPlugin } from "./builtin.js";
import type { ChannelPlugin } from "./plugin.js";

export const NOSTR_CHANNEL_ID = "nostr" as ChannelId;

const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol"];
const PUBLISH_TIMEOUT_MS = 15_000;

// ============================================================================
// secp256k1 / BIP-340 Schnorr 签名（使用 BigInt 实现，无外部依赖）
// ============================================================================

const FIELD_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const GROUP_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

type Point = { x: bigint; y: bigint } | null;

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function modInverse(a: bigint, m: bigint): bigint {
  let result = 1n;
  let base = mod(a, m);
  let exp = m - 2n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return result;
}

function pointAdd(P: Point, Q: Point): Point {
  if (P === null) return Q;
  if (Q === null) return P;
  if (P.x === Q.x && P.y !== Q.y) return null;
  if (P.x === Q.x && P.y === Q.y) {
    const lambda = mod(3n * P.x * P.x * modInverse(2n * P.y, FIELD_P), FIELD_P);
    const x = mod(lambda * lambda - 2n * P.x, FIELD_P);
    const y = mod(lambda * (P.x - x) - P.y, FIELD_P);
    return { x, y };
  }
  const lambda = mod((Q.y - P.y) * modInverse(Q.x - P.x, FIELD_P), FIELD_P);
  const x = mod(lambda * lambda - P.x - Q.x, FIELD_P);
  const y = mod(lambda * (P.x - x) - P.y, FIELD_P);
  return { x, y };
}

function scalarMul(k: bigint, P: Point): Point {
  let result: Point = null;
  let addend: Point = P;
  let kVal = k % GROUP_N;
  while (kVal > 0n) {
    if (kVal & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    kVal >>= 1n;
  }
  return result;
}

function hasEvenY(P: Point): boolean {
  return P !== null && P.y % 2n === 0n;
}

function taggedHash(tag: string, data: Buffer): Buffer {
  const tagHash = createHash("sha256").update(tag).digest();
  return createHash("sha256").update(Buffer.concat([tagHash, tagHash, data])).digest();
}

function bigIntTo32Bytes(n: bigint): Buffer {
  let hex = n.toString(16);
  if (hex.length > 64) hex = hex.slice(-64);
  return Buffer.from(hex.padStart(64, "0"), "hex");
}

/** BIP-340 Schnorr 签名。返回 64 字节签名 (R.x || s)。 */
function schnorrSign(msgHash: Buffer, privateKey: Buffer): Buffer {
  let d = BigInt("0x" + privateKey.toString("hex"));
  d = mod(d, GROUP_N);
  let P = scalarMul(d, { x: GX, y: GY });
  if (!hasEvenY(P)) d = GROUP_N - d;

  const auxRand = randomBytes(32);
  const tHash = taggedHash("BIP0340/aux", auxRand);
  let t = d ^ BigInt("0x" + tHash.toString("hex"));
  t = mod(t, GROUP_N);

  let R = scalarMul(t, { x: GX, y: GY });
  if (!hasEvenY(R)) t = GROUP_N - t;

  const RxBytes = bigIntTo32Bytes(R!.x);
  const PxBytes = bigIntTo32Bytes(P!.x);
  const eHash = taggedHash("BIP0340/challenge", Buffer.concat([RxBytes, PxBytes, msgHash]));
  const e = mod(BigInt("0x" + eHash.toString("hex")), GROUP_N);

  const s = mod(t + e * d, GROUP_N);
  return Buffer.concat([RxBytes, bigIntTo32Bytes(s)]);
}

// ============================================================================
// Nostr 密钥与 NIP-04 加密
// ============================================================================

/** 从 hex 私钥派生 Nostr 公钥（x 坐标，32 字节 hex）。 */
function getPublicKeyFromPrivate(privateKeyHex: string): string {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, "hex"));
  const compressed = ecdh.getPublicKey();
  return compressed.subarray(1, 33).toString("hex");
}

/** 计算 ECDH 共享密钥（32 字节）。 */
function computeSharedSecret(myPrivKeyHex: string, theirPubKeyHex: string): Buffer {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(myPrivKeyHex, "hex"));
  const theirCompressed = Buffer.concat([
    Buffer.from([0x02]),
    Buffer.from(theirPubKeyHex, "hex"),
  ]);
  return ecdh.computeSecret(theirCompressed);
}

/** NIP-04 加密：返回 base64(iv + ciphertext)。 */
function nip04Encrypt(myPrivKeyHex: string, theirPubKeyHex: string, plaintext: string): string {
  const sharedSecret = computeSharedSecret(myPrivKeyHex, theirPubKeyHex);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", sharedSecret, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString("base64");
}

/** NIP-04 解密：从 base64(iv + ciphertext) 还原明文。 */
function nip04Decrypt(myPrivKeyHex: string, theirPubKeyHex: string, content: string): string {
  const sharedSecret = computeSharedSecret(myPrivKeyHex, theirPubKeyHex);
  const buf = Buffer.from(content, "base64");
  const iv = buf.subarray(0, 16);
  const ciphertext = buf.subarray(16);
  const decipher = createDecipheriv("aes-256-cbc", sharedSecret, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ============================================================================
// Nostr 事件构造与签名
// ============================================================================

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** 计算事件 ID（SHA-256 of canonical serialized event）。 */
function computeEventId(event: {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  return createHash("sha256").update(serialized).digest("hex");
}

/** 构造并签名 kind:4 加密 DM 事件。 */
function buildDmEvent(
  senderPrivKeyHex: string,
  recipientPubKeyHex: string,
  text: string,
): NostrEvent {
  const pubkey = getPublicKeyFromPrivate(senderPrivKeyHex);
  const content = nip04Encrypt(senderPrivKeyHex, recipientPubKeyHex, text);
  const tags: string[][] = [["p", recipientPubKeyHex]];
  const created_at = Math.floor(Date.now() / 1000);

  const id = computeEventId({ pubkey, created_at, kind: 4, tags, content });
  const sig = schnorrSign(Buffer.from(id, "hex"), Buffer.from(senderPrivKeyHex, "hex")).toString(
    "hex",
  );

  return { id, pubkey, created_at, kind: 4, tags, content, sig };
}

// ============================================================================
// Relay 连接管理
// ============================================================================

interface NostrAccountConfig {
  privateKey: string;
  relays?: string[];
  publicKey?: string;
}

/** 通过 WebSocket 向 relay 发布事件，等待 OK 响应。 */
function publishToRelay(relayUrl: string, event: NostrEvent, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
        }
        resolve(false);
      }
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify(["EVENT", event]));
    };

    ws.onmessage = (msg: MessageEvent) => {
      try {
        const data = JSON.parse(msg.data as string) as unknown[];
        if (Array.isArray(data) && data[0] === "OK" && data[1] === event.id) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try {
              ws.close();
            } catch {
            }
            resolve(data[2] === true);
          }
        }
      } catch {
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
  });
}

/** 向多个 relay 发布事件，只要有一个成功即返回。 */
async function publishToRelays(
  event: NostrEvent,
  relays: string[],
  timeoutMs: number = PUBLISH_TIMEOUT_MS,
): Promise<{ success: boolean; eventId: string; error?: string }> {
  const results = await Promise.allSettled(
    relays.map((r) => publishToRelay(r, event, timeoutMs)),
  );
  const ok = results.some((r) => r.status === "fulfilled" && r.value === true);
  if (ok) {
    return { success: true, eventId: event.id };
  }
  return {
    success: false,
    eventId: event.id,
    error: "Failed to publish to any relay",
  };
}

/** 订阅 relay 上的 kind:4 DM 事件。返回取消订阅函数。 */
function subscribeToDms(
  relayUrl: string,
  pubkey: string,
  onEvent: (event: NostrEvent) => void,
  since: number = 0,
): () => void {
  let ws: WebSocket;
  const subId = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let closed = false;

  try {
    ws = new WebSocket(relayUrl);
  } catch {
    return () => {
    };
  }

  ws.onopen = () => {
    if (closed) return;
    ws.send(JSON.stringify(["REQ", subId, { kinds: [4], "#p": [pubkey], since }]));
  };

  ws.onmessage = (msg: MessageEvent) => {
    try {
      const data = JSON.parse(msg.data as string) as unknown[];
      if (Array.isArray(data) && data[0] === "EVENT" && data[1] === subId) {
        onEvent(data[2] as NostrEvent);
      }
    } catch {
    }
  };

  return () => {
    closed = true;
    try {
      ws.send(JSON.stringify(["CLOSE", subId]));
      ws.close();
    } catch {
    }
  };
}

// ============================================================================
// 渠道插件
// ============================================================================

export interface NostrWebhookResult {
  success: boolean;
  type?: string;
  message?: {
    channelId: string;
    userId: string;
    messageId: string;
    text: string;
    timestamp: number;
    chatType: "direct" | "group";
  };
  error?: string;
}

export function createNostrChannelPlugin(): ChannelPlugin {
  const nostrChannelMeta: ChannelMeta = {
    id: NOSTR_CHANNEL_ID,
    label: "Nostr",
    selectionLabel: "Nostr",
    blurb: "Nostr 去中心化消息通道（NIP-04 加密 DM）",
    docsPath: "/channels/nostr",
    aliases: ["nostr"],
    markdownCapable: false,
  };

  const nostrChannelCapabilities: ChannelCapabilities = {
    chatTypes: ["direct"],
    media: false,
    reactions: false,
    threads: false,
    polls: false,
    mentions: false,
    voice: false,
    video: false,
    typing: false,
  };

  const nostrChannelConfig: ChannelConfigAdapter<NostrAccountConfig> = {
    listAccountIds: (config: AppConfig): ChannelId[] => {
      const nostrConfig = config.nostr as Record<string, unknown>;
      if (nostrConfig && nostrConfig.privateKey) {
        return [NOSTR_CHANNEL_ID];
      }
      return [];
    },
    resolveAccount: (config: AppConfig, accountId: ChannelId): NostrAccountConfig | null => {
      if (accountId !== NOSTR_CHANNEL_ID) return null;
      const nostrConfig = config.nostr as Record<string, unknown>;
      if (nostrConfig && nostrConfig.privateKey) {
        const privateKey = String(nostrConfig.privateKey);
        return {
          privateKey,
          relays: (nostrConfig.relays as string[]) ?? DEFAULT_RELAYS,
          publicKey: (() => {
            try {
              return getPublicKeyFromPrivate(privateKey);
            } catch {
              return undefined;
            }
          })(),
        };
      }
      return null;
    },
    isEnabled: (account: NostrAccountConfig): boolean => {
      return !!account.privateKey;
    },
    isConfigured: (account: NostrAccountConfig): boolean => {
      return !!account.privateKey;
    },
  };

  const nostrChannelMessageAdapter: ChannelPlugin["message"] = {
    send: {
      send: async (ctx: MessageSendContext): Promise<ChannelMessageSendResult> => {
        const account = nostrChannelConfig.resolveAccount(
          { nostr: {} } as unknown as AppConfig,
          ctx.channel,
        );
        if (!account) {
          return { success: false, error: "Nostr account not configured" };
        }

        try {
          const rendered = await ctx.render();
          const text = rendered.parts
            .map((p: { content: unknown }) => String(p.content))
            .join("\n");

          const recipientPubkey = ctx.to;
          if (!recipientPubkey) {
            return { success: false, error: "Nostr recipient pubkey not provided" };
          }

          const event = buildDmEvent(account.privateKey, recipientPubkey, text);
          const relays = account.relays ?? DEFAULT_RELAYS;

          const result = await publishToRelays(event, relays);
          if (result.success) {
            return { success: true, messageId: event.id };
          }
          return { success: false, error: result.error ?? "Nostr publish failed" };
        } catch (error) {
          return {
            success: false,
            error: `Nostr send error: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      },
    },
  };

  return createBuiltinChannelPlugin({
    id: NOSTR_CHANNEL_ID,
    meta: nostrChannelMeta,
    capabilities: nostrChannelCapabilities,
    config: nostrChannelConfig,
    message: nostrChannelMessageAdapter,
  });
}

// ============================================================================
// 公开工具函数
// ============================================================================

/** 解析 Nostr 接收到的 kind:4 事件，解密 DM 内容。 */
export function parseNostrDmEvent(
  event: NostrEvent,
  recipientPrivKeyHex: string,
): NostrWebhookResult {
  if (event.kind !== 4) {
    return { success: false, error: `Unsupported event kind: ${event.kind}` };
  }

  let recipientPubkey = "";
  for (const tag of event.tags) {
    if (tag[0] === "p") {
      recipientPubkey = tag[1];
      break;
    }
  }

  try {
    const text = nip04Decrypt(recipientPrivKeyHex, event.pubkey, event.content);
    if (!text) {
      return { success: false, error: "Empty decrypted message" };
    }

    return {
      success: true,
      type: "message",
      message: {
        channelId: recipientPubkey || event.pubkey,
        userId: event.pubkey,
        messageId: event.id,
        text,
        timestamp: event.created_at * 1000,
        chatType: "direct",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Decrypt failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export {
  getPublicKeyFromPrivate,
  nip04Encrypt,
  nip04Decrypt,
  computeEventId,
  buildDmEvent,
  publishToRelays,
  subscribeToDms,
  DEFAULT_RELAYS,
};
export type { NostrEvent, NostrAccountConfig };
