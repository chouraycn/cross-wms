// 检测 gateway 响应形状中的 approval-not-found 错误。
import { normalizeOptionalString } from "./string-coerce.js";

const INVALID_REQUEST = "INVALID_REQUEST";
const APPROVAL_NOT_FOUND = "APPROVAL_NOT_FOUND";

function readErrorCode(value: unknown): string | null {
  return typeof value === "string" ? (normalizeOptionalString(value) ?? null) : null;
}

function readApprovalNotFoundDetailsReason(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const reason = (value as { reason?: unknown }).reason;
  return typeof reason === "string" ? (normalizeOptionalString(reason) ?? null) : null;
}

/**
 * 在 gateway 错误形状中检测 approval-not-found 失败。
 * 覆盖足够宽泛以兼容结构化错误码出现之前的旧版纯消息错误。
 */
export function isApprovalNotFoundError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const gatewayCode = readErrorCode((err as { gatewayCode?: unknown }).gatewayCode);
  if (gatewayCode === APPROVAL_NOT_FOUND) {
    return true;
  }
  const detailsReason = readApprovalNotFoundDetailsReason((err as { details?: unknown }).details);
  if (gatewayCode === INVALID_REQUEST && detailsReason === APPROVAL_NOT_FOUND) {
    return true;
  }
  return /unknown or expired approval id/i.test(err.message);
}
