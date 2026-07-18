// 为更新交接报告构建重启哨兵 payload。
// 移植自 openclaw/src/infra/update-restart-sentinel-payload.ts
import {
  buildRestartSuccessContinuation,
  formatDoctorNonInteractiveHint,
  type RestartSentinelPayload,
} from "./restart-sentinel.js";
import type { UpdateRunResult } from "./update-runner.js";

// 更新重启哨兵 payload 在进程重启间携带更新结果详情，
// 以便下一个网关可以报告完成或失败。
/** 路由更新重启 continuation 消息所需的元数据。 */
export type UpdateRestartSentinelMeta = {
  sessionKey?: string;
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
  };
  threadId?: string;
  handoffId?: string;
  note?: string | null;
  continuationMessage?: string | null;
};

/** 构建更新运行后写入的重启哨兵 payload。 */
export function buildUpdateRestartSentinelPayload(params: {
  result: UpdateRunResult;
  meta: UpdateRestartSentinelMeta;
  nowMs?: number;
}): RestartSentinelPayload {
  const { result, meta } = params;
  const continuation =
    result.status === "ok"
      ? buildRestartSuccessContinuation({
          sessionKey: meta.sessionKey,
          continuationMessage: meta.continuationMessage,
        })
      : null;
  return {
    kind: "update",
    status: result.status,
    ts: params.nowMs ?? Date.now(),
    ...(meta.sessionKey ? { sessionKey: meta.sessionKey } : {}),
    ...(meta.deliveryContext ? { deliveryContext: meta.deliveryContext } : {}),
    ...(meta.threadId ? { threadId: meta.threadId } : {}),
    message: meta.note ?? null,
    ...(continuation ? { continuation } : {}),
    doctorHint: formatDoctorNonInteractiveHint(),
    stats: {
      mode: result.mode,
      ...(result.root ? { root: result.root } : {}),
      ...(meta.handoffId ? { handoffId: meta.handoffId } : {}),
      before: result.before ?? null,
      after: result.after ?? null,
      steps: result.steps.map((step) => ({
        name: step.name,
        command: step.command,
        cwd: step.cwd,
        durationMs: step.durationMs,
        log: {
          stdoutTail: step.stdoutTail ?? null,
          stderrTail: step.stderrTail ?? null,
          exitCode: step.exitCode ?? null,
        },
      })),
      reason: result.reason ?? null,
      durationMs: result.durationMs,
    },
  };
}
