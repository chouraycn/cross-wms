// Gateway cron 通知投递。
// 为 cron 完成/失败事件发送 announce 与 webhook 通知。
// 移植自 openclaw/src/gateway/server-cron-notifications.ts。
// 依赖调整：
//  - @openclaw/normalization-core/string-coerce → ../infra/string-coerce.js
//  - ../cli/deps.types.js 的 CliDeps → 本地宽松类型（cross-wms 未移植完整 CliDeps）
//  - ../config/types.cron.js 的 CronFailureDestinationConfig → 本地宽松类型
//  - ../config/types.openclaw.js 的 OpenClawConfig → ./_openclaw-stubs.js（降级占位）
//  - ../cron/delivery.js 的 resolveFailureDestination、sendCronAnnouncePayloadStrict、
//    sendFailureNotificationAnnounce 已存在；resolveCronDeliveryPlan → 本地降级 stub
//  - ../cron/service.js 的 CronEvent → 本地宽松类型（cross-wms 无 cron/service.ts）
//  - ../cron/session-target.js 的 resolveCronDeliverySessionKey → 本地降级 stub
//    （cross-wms cron/session-target.ts 导出 resolveSessionTarget，签名不同）
//  - ../cron/types.js 的 CronJob 已存在；CronMessageChannel → 本地宽松类型
//  - ../cron/webhook-url.js 的 normalizeHttpWebhookUrl 已存在
//  - ../infra/errors.js 的 formatErrorMessage 已存在
//  - ../infra/net/fetch-guard.js 的 fetchWithSsrFGuard → 降级为原生 fetch（SSRF 守卫未移植）
//  - ../infra/net/ssrf.js 的 SsrFBlockedError → 降级为本地空类
import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import type { OpenClawConfig } from "./_openclaw-stubs.js";
import {
  resolveFailureDestination,
  sendCronAnnouncePayloadStrict,
  sendFailureNotificationAnnounce,
} from "../cron/delivery.js";
import type { CronJob } from "../cron/types.js";
import { normalizeHttpWebhookUrl } from "../cron/webhook-url.js";
import { formatErrorMessage } from "../infra/errors.js";

const CRON_WEBHOOK_TIMEOUT_MS = 10_000;

// ============================================================================
// 本地宽松类型 — 替代未移植的 openclaw 类型
// ============================================================================

/** CliDeps 宽松占位（cross-wms cli/deps.types.ts 为 unknown stub）。 */
type CliDeps = unknown;

/** cron 失败投递目标配置（降级占位）。 */
type CronFailureDestinationConfig = {
  mode?: string;
  to?: string;
  channel?: string;
  accountId?: string;
};

/** cron 事件（降级占位，替代 openclaw cron/service.js 的 CronEvent）。 */
type CronEvent = {
  jobId: string;
  status?: string;
  error?: string;
  summary?: unknown;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
};

/** cron 消息通道（降级占位，替代 openclaw cron/types.js 的 CronMessageChannel）。 */
type CronMessageChannel = string;

type CronLogger = {
  warn: (obj: unknown, msg?: string) => void;
};

type CronAgentResolver = (requested?: string | null) => {
  agentId: string;
  cfg: OpenClawConfig;
};

type CronWebhookTarget = {
  url: string;
  source: "delivery" | "completionDestination";
};

function redactWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<invalid-webhook-url>";
  }
}

function redactOptionalWebhookUrl(url: unknown): string | undefined {
  const normalized = normalizeOptionalString(url);
  return normalized ? redactWebhookUrl(normalized) : undefined;
}

// 本地降级 stub — 替代 openclaw cron/delivery.js 的 resolveCronDeliveryPlan。
// 返回 mode=none 使主投递计划被跳过（降级：不投递 announce）。
function resolveCronDeliveryPlan(job: CronJob | undefined): {
  mode: "none" | "announce" | "webhook";
  requested?: string;
  channel?: CronMessageChannel;
  to?: string;
  accountId?: string;
} {
  void job;
  return { mode: "none" };
}

// 本地降级 stub — 替代 openclaw cron/session-target.js 的 resolveCronDeliverySessionKey。
// cross-wms cron/session-target.ts 导出 resolveSessionTarget（签名不同），此处返回 undefined。
function resolveCronDeliverySessionKey(job: CronJob): string | undefined {
  void job;
  return undefined;
}

/** 解析直接 webhook 投递与完成目标 webhook。 */
function resolveCronWebhookTargets(params: {
  delivery?: {
    mode?: string;
    to?: string;
    completionDestination?: { mode?: string; to?: string };
  };
}): CronWebhookTarget[] {
  const targets: CronWebhookTarget[] = [];
  const mode = normalizeOptionalLowercaseString(params.delivery?.mode);
  if (mode === "webhook") {
    const url = normalizeHttpWebhookUrl(params.delivery?.to);
    if (url) {
      targets.push({ url, source: "delivery" });
    }
  }

  const completionMode = normalizeOptionalLowercaseString(
    params.delivery?.completionDestination?.mode,
  );
  if (mode === "announce" && completionMode === "webhook") {
    const url = normalizeHttpWebhookUrl(params.delivery?.completionDestination?.to);
    if (url && targets.every((target) => target.url !== url)) {
      targets.push({ url, source: "completionDestination" });
    }
  }

  return targets;
}

function buildCronWebhookHeaders(webhookToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (webhookToken) {
    headers.Authorization = `Bearer ${webhookToken}`;
  }
  return headers;
}

// 本地降级实现：使用原生 fetch 替代 openclaw fetchWithSsrFGuard。
// SSRF 守卫未移植，此处直接发起 fetch 并在 catch 中区分网络错误。
async function postCronWebhook(params: {
  webhookUrl: string;
  webhookToken?: string;
  payload: unknown;
  logContext: Record<string, unknown>;
  blockedLog: string;
  failedLog: string;
  logger: CronLogger;
}): Promise<void> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, CRON_WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(params.webhookUrl, {
      method: "POST",
      headers: buildCronWebhookHeaders(params.webhookToken),
      body: JSON.stringify(params.payload),
      signal: abortController.signal,
    });
    // 释放响应体（openclaw 原始实现调用 result.release()）。
    if (response.body) {
      try {
        await response.body.cancel();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    // SSRF 守卫未移植，统一作为失败记录。
    params.logger.warn(
      {
        ...params.logContext,
        err: formatErrorMessage(err),
        webhookUrl: redactWebhookUrl(params.webhookUrl),
      },
      params.failedLog,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** 为在正常完成投递前失败的 cron job 发送即时失败告警。 */
export async function sendGatewayCronFailureAlert(params: {
  deps: CliDeps;
  logger: CronLogger;
  resolveCronAgent: CronAgentResolver;
  webhookToken?: unknown;
  job: CronJob;
  text: string;
  channel: CronMessageChannel;
  to?: string;
  mode?: "announce" | "webhook";
  accountId?: string;
}): Promise<void> {
  const { agentId, cfg: runtimeConfig } = params.resolveCronAgent(params.job.agentId);
  const webhookToken = normalizeOptionalString(params.webhookToken);

  if (params.mode === "webhook" && !params.to) {
    params.logger.warn(
      { jobId: params.job.id },
      "cron: failure alert webhook mode requires URL, skipping",
    );
    return;
  }

  if (params.mode === "webhook" && params.to) {
    const webhookUrl = normalizeHttpWebhookUrl(params.to);
    if (webhookUrl) {
      await postCronWebhook({
        webhookUrl,
        webhookToken,
        payload: {
          jobId: params.job.id,
          jobName: params.job.name,
          message: params.text,
        },
        logContext: { jobId: params.job.id },
        blockedLog: "cron: failure alert webhook blocked by SSRF guard",
        failedLog: "cron: failure alert webhook failed",
        logger: params.logger,
      });
    } else {
      params.logger.warn(
        {
          jobId: params.job.id,
          webhookUrl: redactWebhookUrl(params.to),
        },
        "cron: failure alert webhook URL is invalid, skipping",
      );
    }
    return;
  }

  const abortController = new AbortController();
  await sendCronAnnouncePayloadStrict({
    deps: params.deps,
    cfg: runtimeConfig,
    agentId,
    jobId: params.job.id,
    target: {
      channel: params.channel,
      to: params.to,
      accountId: params.accountId,
      sessionKey: resolveCronDeliverySessionKey(params.job),
    },
    message: params.text,
    abortSignal: abortController.signal,
  });
}

/** 在 cron 运行结束后分发完成与失败目标通知。 */
export function dispatchGatewayCronFinishedNotifications(params: {
  evt: CronEvent;
  job?: CronJob;
  deps: CliDeps;
  logger: CronLogger;
  resolveCronAgent: CronAgentResolver;
  webhookToken?: unknown;
  globalFailureDestination?: CronFailureDestinationConfig;
}): void {
  const webhookToken = normalizeOptionalString(params.webhookToken);
  const webhookTargets = resolveCronWebhookTargets({
    delivery:
      params.job?.delivery && typeof params.job.delivery.mode === "string"
        ? {
            mode: params.job.delivery.mode,
            to: params.job.delivery.to,
            completionDestination: params.job.delivery.completionDestination,
          }
        : undefined,
  });

  if (
    params.job?.delivery?.completionDestination?.mode === "webhook" &&
    !normalizeHttpWebhookUrl(params.job.delivery.completionDestination.to)
  ) {
    params.logger.warn(
      {
        jobId: params.evt.jobId,
        deliveryTo: redactOptionalWebhookUrl(params.job.delivery.completionDestination.to),
      },
      "cron: skipped completion webhook delivery, delivery.completionDestination.to must be a valid http(s) URL",
    );
  }

  if (
    !webhookTargets.some((target) => target.source === "delivery") &&
    params.job?.delivery?.mode === "webhook"
  ) {
    params.logger.warn(
      {
        jobId: params.evt.jobId,
        deliveryTo: redactOptionalWebhookUrl(params.job.delivery.to),
      },
      "cron: skipped webhook delivery, delivery.to must be a valid http(s) URL",
    );
  }

  if (params.evt.summary) {
    for (const webhookTarget of webhookTargets) {
      // 完成通知扇出是 best-effort；cron 服务已记录运行结果，不应等待慢 webhook。
      void (async () => {
        await postCronWebhook({
          webhookUrl: webhookTarget.url,
          webhookToken,
          payload: params.evt,
          logContext: { jobId: params.evt.jobId, source: webhookTarget.source },
          blockedLog: "cron: webhook delivery blocked by SSRF guard",
          failedLog: "cron: webhook delivery failed",
          logger: params.logger,
        });
      })();
    }
  }

  dispatchCronFailureDestinationNotifications({
    evt: params.evt,
    job: params.job,
    deps: params.deps,
    logger: params.logger,
    resolveCronAgent: params.resolveCronAgent,
    webhookToken,
    globalFailureDestination: params.globalFailureDestination,
  });
}

function dispatchCronFailureDestinationNotifications(params: {
  evt: CronEvent;
  job?: CronJob;
  deps: CliDeps;
  logger: CronLogger;
  resolveCronAgent: CronAgentResolver;
  webhookToken?: string;
  globalFailureDestination?: CronFailureDestinationConfig;
}): void {
  if (params.evt.status !== "error" || !params.job || params.job.delivery?.bestEffort === true) {
    return;
  }

  const failureMessage = `Cron job "${params.job.name}" failed: ${params.evt.error ?? "unknown error"}`;
  const failureDest = resolveFailureDestination(params.job, params.globalFailureDestination);
  const deliverySessionKey = resolveCronDeliverySessionKey(params.job);

  if (failureDest) {
    const failurePayload = {
      jobId: params.job.id,
      jobName: params.job.name,
      message: failureMessage,
      status: params.evt.status,
      error: params.evt.error,
      runAtMs: params.evt.runAtMs,
      durationMs: params.evt.durationMs,
      nextRunAtMs: params.evt.nextRunAtMs,
    };

    if (failureDest.mode === "webhook" && failureDest.to) {
      const webhookUrl = normalizeHttpWebhookUrl(failureDest.to);
      if (webhookUrl) {
        // 失败目标镜像完成 webhook：在后台通知并记录失败，不重写 cron 事件结果。
        void (async () => {
          await postCronWebhook({
            webhookUrl,
            webhookToken: params.webhookToken,
            payload: failurePayload,
            logContext: { jobId: params.evt.jobId },
            blockedLog: "cron: failure destination webhook blocked by SSRF guard",
            failedLog: "cron: failure destination webhook failed",
            logger: params.logger,
          });
        })();
      } else {
        params.logger.warn(
          {
            jobId: params.evt.jobId,
            webhookUrl: redactWebhookUrl(failureDest.to),
          },
          "cron: failure destination webhook URL is invalid, skipping",
        );
      }
      return;
    }

    if (failureDest.mode === "announce") {
      const { agentId, cfg: runtimeConfig } = params.resolveCronAgent(params.job.agentId);
      void sendFailureNotificationAnnounce(
        params.deps,
        runtimeConfig,
        agentId,
        params.job.id,
        {
          channel: failureDest.channel,
          to: failureDest.to,
          accountId: failureDest.accountId,
          sessionKey: deliverySessionKey,
          // 已配置的失败路由已是显式的；仅保留 cron 运行会话用于上下文，
          // 不重新附加主话题。
          inheritSessionThread: false,
        },
        `⚠️ ${failureMessage}`,
      );
    }
    return;
  }

  const primaryPlan = resolveCronDeliveryPlan(params.job);
  if (primaryPlan.mode !== "announce" || !primaryPlan.requested) {
    return;
  }

  const { agentId, cfg: runtimeConfig } = params.resolveCronAgent(params.job.agentId);
  void sendFailureNotificationAnnounce(
    params.deps,
    runtimeConfig,
    agentId,
    params.job.id,
    {
      channel: primaryPlan.channel,
      to: primaryPlan.to,
      accountId: primaryPlan.accountId,
      sessionKey: deliverySessionKey,
    },
    `⚠️ ${failureMessage}`,
  );
}
