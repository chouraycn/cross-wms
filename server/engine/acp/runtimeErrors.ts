/**
 * ACP Runtime Errors
 * 运行时错误类型定义
 *
 * 参考 openclaw/src/acp/runtime/errors.ts 设计（简化版）
 */

export class AcpRuntimeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcpRuntimeError";
  }
}

export class AcpSessionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcpSessionError";
  }
}

export class AcpBackendError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AcpBackendError";
  }
}