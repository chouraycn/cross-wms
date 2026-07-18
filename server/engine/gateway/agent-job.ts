// 移植自 openclaw/src/gateway/server-methods/agent-job.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function waitForAgentJob(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForAgentJob");
}

export const testing_agent_job: unknown = undefined;

export const __testing: unknown = undefined;
