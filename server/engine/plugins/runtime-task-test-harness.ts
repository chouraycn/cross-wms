// 移植自 openclaw/src/plugins/runtime-task-test-harness.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getRuntimeTaskMocks(...args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeTaskMocks");
}
export function installRuntimeTaskDeliveryMock(...args: unknown[]): unknown {
  throw new Error("not implemented: installRuntimeTaskDeliveryMock");
}
export function resetRuntimeTaskTestState(...args: unknown[]): unknown {
  throw new Error("not implemented: resetRuntimeTaskTestState");
}
