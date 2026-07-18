// OpenClaw root 解析通过此 facade 导入 fs，以便测试可以在不全局 mock node:fs 的情况下替换文件系统行为。
// 降级实现：从 openclaw/src/infra/openclaw-root.fs.runtime.ts 直接移植。
export { default as openClawRootFsSync } from "node:fs";
export { default as openClawRootFs } from "node:fs/promises";
