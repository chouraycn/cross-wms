/**
 * CLI 模块导出
 */

export * from "./descriptors.js";
export * from "./context.js";
export * from "./argv.js";
export * from "./lazyRegister.js";
export * from "./program.js";
export { registerStatusCommand } from "./commands/status.js";
export { registerDoctorCommand } from "./commands/doctor.js";
export { registerConfigCommand } from "./commands/config.js";
export { registerAgentsCommand } from "./commands/agents.js";
export { registerChannelsCommand } from "./commands/channels.js";

// 重新导出避免歧义
export { getCommandPath } from "./descriptors.js";
