// CLI command registration barrel: re-exports from sub-modules.
// 移植自 openclaw/src/cli/program/register.ts

export { registerCrestodianCommand } from './register.crestodian.js';
export { registerSetupCommand } from './register.setup.js';
export { registerOnboardCommand } from './register.onboard.js';
export { registerConfigureCommand } from './register.configure.js';
export { registerMaintenanceCommands } from './register.maintenance.js';
export { registerBackupCommand } from './register.backup.js';
export { registerMigrateCommand } from './register.migrate.js';
export { registerMessageCommands } from './register.message.js';
export { registerAgentTurnCommand } from './register.agent-turn.js';
export { registerAgentsCommands } from './register.agent.js';
export { registerStatusHealthSessionsCommands } from './register.status-health-sessions.js';
