/**
 * 技能元数据注册表 — 兼容性重导出
 *
 * 实现已合并至 server/services/openclaw/skillMetadataRegistry.ts，本文件仅作为
 * 前端 import 路径的兼容入口，避免破坏历史调用点。
 *
 * 注意：
 *  - 本注册表是「元数据索引」，供前端 UI 查询/过滤/搜索技能
 *  - 后端运行时执行注册表位于 server/engine/skillRegistry.ts（完整生命周期管理）
 *  - 两者职责不同，非重复实现
 */

export type {
  SkillEntry,
  SkillRegistryOptions,
} from '../../server/services/openclaw/skillMetadataRegistry';

export {
  SkillRegistry,
  skillRegistry,
} from '../../server/services/openclaw/skillMetadataRegistry';
