/**
 * Delivery - 投递系统
 *
 * 对齐 openclaw/src/cron/delivery.ts：
 * - 严格投递 sendCronAnnouncePayloadStrict：目标解析失败或投递失败都抛错
 * - best-effort 失败通知 sendFailureNotificationAnnounce：30 秒超时，失败不掩盖原始 cron 失败
 * - durable 投递：bestEffort=false 时，部分通道失败视为 cron 运行失败
 * - 失败目标解析 resolveFailureDestination：优先 job 配置，回退到 announce 目标
 *
 * 为避免与特定消息通道实现耦合，本模块通过 CronDeliveryAdapter 接口注入投递能力，
 * 调用方负责实现 resolveTarget / send。
 */

import { logger } from "../../logger.js";

/** cron 公告目标元数据 */
export interface CronAnnounceTarget {
  channel?: string;
  to?: string;
  accountId?: string;
  sessionKey?: string;
  /** 是否继承会话线程，默认继承 */
  inheritSessionThread?: boolean;
}

/** 解析后的投递目标 */
export interface CronDeliveryTarget {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
}

/** 投递结果 */
export type CronDeliveryResult =
  | { status: "ok" }
  | { status: "failed" | "partial_failed"; error: Error };

/** 失败通知目标配置（可来自 job.delivery.failureDestination） */
export interface CronFailureDestinationInput {
  channel?: string | null;
  to?: string | null;
  accountId?: string | null;
  mode?: string | null;
}

/**
 * 投递适配器：由调用方实现，将 cron 公告发送到具体通道。
 * 投递是 durable 语义：bestEffort=false 时部分通道失败应上报为 failed/partial_failed。
 */
export interface CronDeliveryAdapter {
  /** 解析投递目标，失败时抛出 Error */
  resolveTarget(target: CronAnnounceTarget): Promise<CronDeliveryTarget>;
  /** 发送消息，返回投递结果 */
  send(params: {
    target: CronDeliveryTarget;
    message: string;
    bestEffort: boolean;
    abortSignal: AbortSignal;
  }): Promise<CronDeliveryResult>;
}

/** 失败通知的超时时间（30 秒） */
const FAILURE_NOTIFICATION_TIMEOUT_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 解析失败通知目标
 *
 * 优先级：
 *   1. job.delivery.failureDestination（显式配置）
 *   2. job.delivery 本身（channel / to / accountId）
 *   3. 回退到 announce 目标
 *
 * @param jobDelivery 任务配置的 delivery 子对象
 * @param announceTarget 公告目标（回退来源）
 * @returns 失败通知目标，无可解析目标时返回 null
 */
export function resolveFailureDestination(
  jobDelivery: unknown,
  announceTarget: CronAnnounceTarget,
): CronAnnounceTarget | null {
  if (isRecord(jobDelivery) && isRecord(jobDelivery.failureDestination)) {
    const fd = jobDelivery.failureDestination as CronFailureDestinationInput;
    const target: CronAnnounceTarget = {};
    if (typeof fd.channel === "string" && fd.channel.trim()) {
      target.channel = fd.channel.trim();
    }
    if (typeof fd.to === "string" && fd.to.trim()) {
      target.to = fd.to.trim();
    }
    if (typeof fd.accountId === "string" && fd.accountId.trim()) {
      target.accountId = fd.accountId.trim();
    }
    // 至少有一个有效字段才视为有效失败目标
    if (target.channel || target.to || target.accountId) {
      return target;
    }
  }

  // 回退到 announce 目标
  const fallback: CronAnnounceTarget = {};
  if (isRecord(jobDelivery)) {
    if (typeof jobDelivery.channel === "string" && jobDelivery.channel.trim()) {
      fallback.channel = jobDelivery.channel.trim();
    }
    if (typeof jobDelivery.to === "string" && jobDelivery.to.trim()) {
      fallback.to = jobDelivery.to.trim();
    }
    if (typeof jobDelivery.accountId === "string" && jobDelivery.accountId.trim()) {
      fallback.accountId = jobDelivery.accountId.trim();
    }
  }
  if (fallback.channel || fallback.to || fallback.accountId) {
    return fallback;
  }

  if (announceTarget.channel || announceTarget.to || announceTarget.accountId) {
    return { ...announceTarget };
  }
  return null;
}

/**
 * 严格投递 cron 公告
 *
 * - 目标解析失败：抛出解析错误
 * - 投递失败 / 部分失败：抛出投递错误（durable 语义，bestEffort=false）
 *
 * @throws 目标解析或投递失败时抛出 Error
 */
export async function sendCronAnnouncePayloadStrict(params: {
  adapter: CronDeliveryAdapter;
  target: CronAnnounceTarget;
  message: string;
  abortSignal: AbortSignal;
}): Promise<void> {
  // 先解析目标，解析失败时上报配置的路由错误而非仅 job id
  const resolvedTarget = await params.adapter.resolveTarget(params.target);

  // 主公告为 durable 投递：部分通道失败必须上抛为 cron 运行失败
  const result = await params.adapter.send({
    target: resolvedTarget,
    message: params.message,
    bestEffort: false,
    abortSignal: params.abortSignal,
  });

  if (result.status === "failed" || result.status === "partial_failed") {
    throw result.error;
  }
}

/**
 * best-effort 发送 cron 失败通知
 *
 * - 目标解析失败：记录警告并返回，不抛错（避免掩盖原始 cron 失败）
 * - 30 秒超时：超时中止，避免拖长已失败的 cron 运行
 * - 投递失败：记录警告并返回，不抛错
 */
export async function sendFailureNotificationAnnounce(params: {
  adapter: CronDeliveryAdapter;
  target: CronAnnounceTarget;
  message: string;
}): Promise<void> {
  let resolvedTarget: CronDeliveryTarget;
  try {
    resolvedTarget = await params.adapter.resolveTarget(params.target);
  } catch (err) {
    // 失败告警不得掩盖原始 cron 运行失败
    logger.warn(
      { err },
      `[cron-delivery] failed to resolve failure destination target`,
    );
    return;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    // 失败通知是次要的：超时中止可防止通道阻塞拖长已失败的 cron 运行
    abortController.abort();
  }, FAILURE_NOTIFICATION_TIMEOUT_MS);

  try {
    const result = await params.adapter.send({
      target: resolvedTarget,
      message: params.message,
      bestEffort: true,
      abortSignal: abortController.signal,
    });
    if (result.status === "failed" || result.status === "partial_failed") {
      logger.warn(
        { err: result.error, channel: resolvedTarget.channel, to: resolvedTarget.to },
        `[cron-delivery] failure destination announce failed`,
      );
    }
  } catch (err) {
    logger.warn(
      { err, channel: resolvedTarget.channel, to: resolvedTarget.to },
      `[cron-delivery] failure destination announce failed`,
    );
  } finally {
    clearTimeout(timeout);
  }
}
