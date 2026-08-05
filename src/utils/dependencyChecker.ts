/**
 * 技能环境依赖检测器 — 兼容性重导出
 *
 * 实现已合并至 server/services/openclaw/dependencyChecker.ts，本文件仅作为
 * 前端 import 路径的兼容入口，避免破坏历史调用点。
 *
 * 注意：
 *  - 前端通过 `import type` 仅消费类型，编译后被擦除
 *  - 后端运行时请直接 import 自 'server/services/openclaw/dependencyChecker'
 */

export type {
  CheckItem,
  BinSearchResult,
  DependencyCheckResult,
} from '../../server/services/openclaw/dependencyChecker';

export {
  checkSkillDependencies,
  checkAllSkillsDependencies,
  generateInstallCommands,
  dependencyChecker,
} from '../../server/services/openclaw/dependencyChecker';
