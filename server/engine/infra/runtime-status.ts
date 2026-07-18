// 规范化运行时状态值用于 CLI 和 gateway 报告。
// 降级实现：从 openclaw/src/infra/runtime-status.ts 直接移植，使用本地 string-coerce。
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";

type RuntimeStatusFormatInput = {
  status?: string;
  pid?: number;
  state?: string;
  details?: string[];
};

/** 格式化运行时健康/状态文本，支持可选的 pid、state 和额外诊断详情。 */
export function formatRuntimeStatusWithDetails({
  status,
  pid,
  state,
  details = [],
}: RuntimeStatusFormatInput): string {
  const runtimeStatus = status?.trim() || "unknown";
  const fullDetails: string[] = [];
  if (pid) {
    fullDetails.push(`pid ${pid}`);
  }
  const normalizedState = state?.trim();
  if (
    normalizedState &&
    // state 经常与来自不同进程管理器的 status 镜像相同；
    // 抑制仅大小写不同的重复项以保持 restart/status 输出可读。
    normalizeLowercaseStringOrEmpty(normalizedState) !==
      normalizeLowercaseStringOrEmpty(runtimeStatus)
  ) {
    fullDetails.push(`state ${normalizedState}`);
  }
  for (const detail of details) {
    const normalizedDetail = detail.trim();
    if (normalizedDetail) {
      fullDetails.push(normalizedDetail);
    }
  }
  return fullDetails.length > 0 ? `${runtimeStatus} (${fullDetails.join(", ")})` : runtimeStatus;
}
