/**
 * Direct-DM 预解密守卫策略 — 在解密工作开始前应用的形状/大小/时间戳/速率限制
 *
 * 参考 openclaw/src/channels/direct-dm-guard-policy.ts
 */
import { resolveIntegerOption } from "../infra/numeric-options.js";

/** Direct-DM 预解密守卫运行时限制 */
export type DirectDmPreCryptoGuardPolicy = {
  /** 解密前接受的加密事件种类（例如 Nostr kind 4） */
  allowedKinds: readonly number[];
  /** 允许发送者时间戳向未来偏移的最大秒数 */
  maxFutureSkewSec: number;
  /** 解密前接受的最大加密负载字节数 */
  maxCiphertextBytes: number;
  /** 解密成功后接受的最大明文字节数 */
  maxPlaintextBytes: number;
  /** 加密 DM 入口的每发送者与全局限流 */
  rateLimit: {
    /** 固定限流窗口大小 */
    windowMs: number;
    /** 单窗口内每发送者最大消息数 */
    maxPerSenderPerWindow: number;
    /** 单窗口内全部发送者最大消息数 */
    maxGlobalPerWindow: number;
    /** 内存中跟踪的发送者 key 上限 */
    maxTrackedSenderKeys: number;
  };
};

/** 需要更严格预解密限制的频道插件提供的部分覆盖项 */
export type DirectDmPreCryptoGuardPolicyOverrides = Partial<
  Omit<DirectDmPreCryptoGuardPolicy, "rateLimit">
> & {
  rateLimit?: Partial<DirectDmPreCryptoGuardPolicy["rateLimit"]>;
};

/** 构建 DM 风格预解密守卫共享策略对象 */
export function createDirectDmPreCryptoGuardPolicy(
  overrides: DirectDmPreCryptoGuardPolicyOverrides = {},
): DirectDmPreCryptoGuardPolicy {
  // 默认值在解密前保持保守：低成本的形状/大小/速率检查发生在频道插件分配 CPU 或明文缓冲之前
  const defaultMaxFutureSkewSec = 120;
  const defaultMaxCiphertextBytes = 16 * 1024;
  const defaultMaxPlaintextBytes = 8 * 1024;
  const defaultWindowMs = 60_000;
  const defaultMaxPerSenderPerWindow = 20;
  const defaultMaxGlobalPerWindow = 200;
  const defaultMaxTrackedSenderKeys = 4096;
  return {
    allowedKinds: overrides.allowedKinds ?? [4],
    maxFutureSkewSec: resolveIntegerOption(overrides.maxFutureSkewSec, defaultMaxFutureSkewSec, {
      min: 0,
    }),
    maxCiphertextBytes: resolveIntegerOption(
      overrides.maxCiphertextBytes,
      defaultMaxCiphertextBytes,
      { min: 1 },
    ),
    maxPlaintextBytes: resolveIntegerOption(overrides.maxPlaintextBytes, defaultMaxPlaintextBytes, {
      min: 1,
    }),
    rateLimit: {
      windowMs: resolveIntegerOption(overrides.rateLimit?.windowMs, defaultWindowMs, { min: 1 }),
      maxPerSenderPerWindow: resolveIntegerOption(
        overrides.rateLimit?.maxPerSenderPerWindow,
        defaultMaxPerSenderPerWindow,
        { min: 1 },
      ),
      maxGlobalPerWindow: resolveIntegerOption(
        overrides.rateLimit?.maxGlobalPerWindow,
        defaultMaxGlobalPerWindow,
        { min: 1 },
      ),
      maxTrackedSenderKeys: resolveIntegerOption(
        overrides.rateLimit?.maxTrackedSenderKeys,
        defaultMaxTrackedSenderKeys,
        { min: 1 },
      ),
    },
  };
}
