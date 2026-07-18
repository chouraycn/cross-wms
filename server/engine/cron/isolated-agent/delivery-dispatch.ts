/**
 * 隔离 agent 的交付分发
 *
 * 参考 openclaw/src/cron/isolated-agent/delivery-dispatch.ts 的精简实现。
 * 负责将隔离 cron 运行的输出分发到投递目标。
 */
import type { CronJob } from "../types.js";
import type { IsolatedAgentDeliveryOptions } from "./types.js";
import type { DeliveryTarget } from "./delivery-target.js";
import { logger } from "../../../logger.js";

/** 交付负载 */
export type DeliveryPayload = {
  text?: string;
  mediaUrl?: string;
};

/** 交付分发参数 */
export type DeliveryDispatchParams = {
  job: CronJob;
  runId: string;
  target: DeliveryTarget;
  payloads: DeliveryPayload[];
  deliveryOptions: IsolatedAgentDeliveryOptions;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
};

/** 交付分发结果 */
export type DeliveryDispatchResult = {
  delivered: boolean;
  deliveryAttempted: boolean;
  status: "delivered" | "not-delivered" | "skipped" | "not-requested";
  error?: string;
  summary?: string;
  outputText?: string;
};

/** 默认交付重试延迟（毫秒） */
const DEFAULT_DELIVERY_RETRY_DELAYS_MS: readonly number[] = [5_000, 10_000, 20_000];

/** 解析交付重试延迟（测试环境可加速） */
export function resolveDeliveryRetryDelaysMs(): readonly number[] {
  if (process.env.NODE_ENV === "test") {
    return [0, 0, 0];
  }
  return DEFAULT_DELIVERY_RETRY_DELAYS_MS;
}

/**
 * 分发隔离 agent 的交付负载到目标通道。
 *
 * 精简版实现：根据目标解析结果和投递选项，将负载发送到目标通道。
 * 当投递未请求、目标无效或负载为空时，返回对应的跳过/未请求状态。
 */
export async function dispatchDelivery(
  params: DeliveryDispatchParams,
): Promise<DeliveryDispatchResult> {
  const { job, runId, target, payloads, deliveryOptions, abortSignal } = params;

  // 投递未请求时直接返回
  if (!deliveryOptions.mode || deliveryOptions.mode === "none") {
    return {
      delivered: false,
      deliveryAttempted: false,
      status: "not-requested",
    };
  }

  // 目标解析失败时返回错误
  if (!target.ok) {
    return {
      delivered: false,
      deliveryAttempted: false,
      status: "not-delivered",
      error: target.error.message,
    };
  }

  // 中止信号触发时返回错误
  if (abortSignal?.aborted) {
    return {
      delivered: false,
      deliveryAttempted: false,
      status: "not-delivered",
      error: "delivery aborted",
    };
  }

  // 无负载内容时跳过投递
  const hasContent = payloads.some(
    (p) => Boolean(p.text?.trim()) || Boolean(p.mediaUrl?.trim()),
  );
  if (!hasContent) {
    logger.debug(
      { jobId: job.id, runId },
      "[cron-isolated-agent] delivery skipped: no content",
    );
    return {
      delivered: false,
      deliveryAttempted: true,
      status: "skipped",
      summary: "empty payload",
    };
  }

  logger.info(
    { jobId: job.id, runId, channel: target.channel, to: target.to },
    "[cron-isolated-agent] dispatching delivery",
  );

  // 精简版：仅记录投递意图并汇总输出文本，实际发送由上层投递适配器完成
  const outputText = payloads
    .map((p) => p.text)
    .filter((t): t is string => Boolean(t?.trim()))
    .join("\n");

  const result: DeliveryDispatchResult = {
    delivered: true,
    deliveryAttempted: true,
    status: "delivered",
  };
  if (outputText) {
    result.summary = outputText.slice(0, 200);
    result.outputText = outputText;
  }
  return result;
}
