// TTS 自动模式控制器，根据文本与上下文按策略选择 provider。
// 参考 openclaw/src/tts/tts-auto-mode.ts 的设计意图。

import type { TtsProvider, TtsProviderRegistry } from "./provider-registry-core.js";

/** provider 选择策略。 */
export type TtsAutoStrategy = "quality" | "speed" | "cost" | "auto";

/** 所有支持的策略集合。 */
export const TTS_AUTO_STRATEGIES = new Set<TtsAutoStrategy>([
  "quality",
  "speed",
  "cost",
  "auto",
]);

/** 自动选择 provider 时可传入的上下文。 */
export interface TtsAutoModeContext {
  /** 期望的 provider id，若已注册则优先返回。 */
  preferredProvider?: string;
  /** 最大可接受成本（用于 cost 策略过滤）。 */
  maxCost?: number;
  /** 期望的优先级数值，用于排序。 */
  priority?: number;
  /** 文本语言提示，用于未来扩展。 */
  language?: string;
}

const DEFAULT_STRATEGY: TtsAutoStrategy = "auto";

function asValidStrategy(value: unknown): TtsAutoStrategy | undefined {
  return typeof value === "string" && TTS_AUTO_STRATEGIES.has(value as TtsAutoStrategy)
    ? (value as TtsAutoStrategy)
    : undefined;
}

/** 计算 provider 在给定上下文下的成本指示值。 */
function resolveProviderCost(
  provider: TtsProvider,
  context: TtsAutoModeContext | undefined,
): number {
  if (typeof context?.priority === "number") {
    return context.priority;
  }
  return provider.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
}

/**
 * TTS 自动模式控制器。
 * 根据文本特征与上下文，结合当前策略从注册表中选择合适的 provider。
 */
export class TtsAutoModeController {
  private strategy: TtsAutoStrategy = DEFAULT_STRATEGY;
  private readonly registry: TtsProviderRegistry;

  constructor(registry: TtsProviderRegistry) {
    this.registry = registry;
  }

  /** 设置选择策略，非法值将被忽略。 */
  setStrategy(strategy: TtsAutoStrategy): void {
    const valid = asValidStrategy(strategy);
    if (valid) {
      this.strategy = valid;
    }
  }

  /** 获取当前选择策略。 */
  getStrategy(): TtsAutoStrategy {
    return this.strategy;
  }

  /** 根据文本和上下文自动选择 provider。 */
  selectProvider(text: string, context?: TtsAutoModeContext): TtsProvider | undefined {
    const providers = this.registry.list();
    if (providers.length === 0) {
      return this.registry.getDefault();
    }

    // 优先尊重上下文中显式指定的 provider
    const preferred = context?.preferredProvider
      ? this.registry.lookup(context.preferredProvider)
      : undefined;
    if (preferred) {
      return preferred;
    }

    switch (this.strategy) {
      case "quality":
        return this.selectForQuality(providers);
      case "speed":
        return this.selectForSpeed(providers, text);
      case "cost":
        return this.selectForCost(providers, context);
      case "auto":
      default:
        return this.selectAuto(providers, text, context);
    }
  }

  /** quality 策略：优先选择 autoSelectOrder 最小的 provider。 */
  private selectForQuality(providers: TtsProvider[]): TtsProvider | undefined {
    return this.sortByAutoSelectOrder(providers)[0];
  }

  /** speed 策略：短文本使用默认 provider，长文本优先选择排序靠前的 provider。 */
  private selectForSpeed(providers: TtsProvider[], text: string): TtsProvider | undefined {
    if (text.length < 10) {
      return this.registry.getDefault() ?? this.sortByAutoSelectOrder(providers)[0];
    }
    return this.sortByAutoSelectOrder(providers)[0];
  }

  /** cost 策略：在 maxCost 约束下选择成本最低的 provider。 */
  private selectForCost(
    providers: TtsProvider[],
    context: TtsAutoModeContext | undefined,
  ): TtsProvider | undefined {
    const sorted = this.sortByAutoSelectOrder(providers);
    const maxCost = context?.maxCost;
    if (typeof maxCost !== "number") {
      return sorted[0];
    }
    return (
      sorted.find((provider) => resolveProviderCost(provider, context) <= maxCost) ?? sorted[0]
    );
  }

  /** auto 策略：综合文本长度与成本约束选择 provider。 */
  private selectAuto(
    providers: TtsProvider[],
    text: string,
    context: TtsAutoModeContext | undefined,
  ): TtsProvider | undefined {
    const sorted = this.sortByAutoSelectOrder(providers);
    const maxCost = context?.maxCost;
    if (typeof maxCost === "number") {
      const within = sorted.find((provider) => resolveProviderCost(provider, context) <= maxCost);
      if (within) {
        return within;
      }
    }
    // 长文本偏向默认 provider（更稳定），短文本使用排序首位
    return text.length > 200
      ? (this.registry.getDefault() ?? sorted[0])
      : sorted[0];
  }

  /** 按 autoSelectOrder 升序、id 字典序兜底排序。 */
  private sortByAutoSelectOrder(providers: TtsProvider[]): TtsProvider[] {
    return [...providers].sort((left, right) => {
      const leftOrder = left.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.autoSelectOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return left.id.localeCompare(right.id);
    });
  }
}
