// === PENDING MIGRATION STUB ===
// Source: openclaw/src/process/exec.ts (待迁移)
// Status: 类型安全 no-op 实现 — 返回失败结果 (exitCode 1)
// 注：openclaw 同源实现需要子进程包装、超时控制、信号管理

export const runCommandWithTimeout = async (
  _cmd: string,
  _args: string[],
  _opts?: unknown,
): Promise<{ stdout: string; stderr: string; exitCode: number }> => ({
  stdout: "",
  stderr: "",
  exitCode: 1,
});
