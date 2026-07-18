// 移植自 openclaw/src/infra/heartbeat-runner.test-harness.ts
// 为心跳 runner 测试安装 channel plugin fixtures。
//
// 降级策略：源文件依赖 vitest 的 beforeEach、../../test/helpers/ 中的
// channel plugin fixtures、../plugins/runtime.js 与 ../test-utils/channel-plugins.js。
// cross-wms 未移植这些测试基础设施。此处提供降级 stub，函数调用为空操作。
// 注意：这不是测试文件，而是测试辅助模块（供 openclaw 测试套件使用）。

/** 安装心跳 runner channel registry。降级实现：空操作。 */
export function installHeartbeatRunnerTestRuntime(_params?: {
  includeSlack?: boolean;
}): void {
  // 降级 stub：cross-wms 未移植 channel plugin fixtures 与 setActivePluginRegistry。
}
