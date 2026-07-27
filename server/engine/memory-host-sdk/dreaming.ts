// Memory host dreaming helpers — minimal constant stubs for doctor/cron migration.
// 移植自 openclaw/src/memory-host-sdk/dreaming.ts (仅常量部分)
//
// 降级说明：
//  - openclaw 完整 dreaming 模块依赖 agent-scope、config、record-coerce 等，
//    此处仅导出 doctor/cron 迁移所需的 3 个常量，避免引入大量未移植依赖。
//  - 后续如需完整 dreaming 能力，可按 openclaw 原始实现逐步补全。

/** Canonical cron job name for the managed memory dreaming promotion job. */
export const MANAGED_MEMORY_DREAMING_CRON_NAME = "Memory Dreaming Promotion";

/** Description tag that marks a cron job as managed by memory-core short-term promotion. */
export const MANAGED_MEMORY_DREAMING_CRON_TAG = "[managed-by=memory-core.short-term-promotion]";

/** System event text used by managed memory dreaming cron jobs. */
export const MEMORY_DREAMING_SYSTEM_EVENT_TEXT =
  "__openclaw_memory_core_short_term_promotion_dream__";
