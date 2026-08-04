/**
 * 验证 P1 写侧闭环：recordSkillCall 写入 skill_started → 读侧 buildSkillReader 聚合 call_count 非空。
 * 用 tsx 直接 import 源码链（staff DAO 无路径别名，不依赖 engine/agents 的完整构建）。
 * 仅验证统计聚合闭环，不依赖 LLM 决策调技能。
 */
import * as skillDao from '../server/dao/staff/staffSkillDao.js';
import { recordSkillCall } from '../server/staff/skillEvents.js';

const tenant = 'default';
const sessionId = 'sess_2247bf5fb9d342c4';
const skillId = 'partner_onboarding_dd';

const statsMap = skillDao.getSkillStats(tenant);
const before = statsMap.get(skillId)?.call_count ?? 0;
console.log('[verify] BEFORE', skillId, 'call_count =', before);

// 写侧：模拟一次真实聊天 turn 触发该技能
recordSkillCall(tenant, sessionId, skillId);

const after = skillDao.getSkillStats(tenant).get(skillId)?.call_count ?? 0;
console.log('[verify] AFTER ', skillId, 'call_count =', after);

// 读侧：buildSkillReader 聚合（对齐前端 SkillRead.call_count 来源）
const rows = skillDao.listSkills({ tenantId: tenant });
const row = (rows as Array<Record<string, unknown>>).find((r) => r.skill_id === skillId) ?? (rows as Array<Record<string, unknown>>)[0];
const reader = skillDao.buildSkillReader(tenant);
const skillRead = reader(row as never) as Record<string, unknown>;
console.log('[verify] SKILL_READ.call_count =', skillRead.call_count, '| recent_call_count =', skillRead.recent_call_count, '| name =', skillRead.name);

const pass = after > before && Number(skillRead.call_count) > 0;
console.log(pass ? '[verify] VERIFY_PASS' : '[verify] VERIFY_FAIL');

// 清理：删除本次写入的测试事件，避免污染真实统计
// （通过 traceDao 不可达，直接用底层 db 句柄删除）
import('../server/dao/staff/staffTraceDao.js').then((traceDao: any) => {
  try {
    const db = (traceDao as any).getDb?.() ?? (traceDao as any).db;
    if (db) {
      const info = db.prepare(
        "DELETE FROM sd_agent_events WHERE tenant_id = ? AND session_id = ? AND event_type IN ('skill_started','skill_resumed','skill_exited') AND payload_json LIKE ?",
      ).run(tenant, sessionId, `%${skillId}%`);
      console.log('[verify] cleaned test events, changes =', info.changes);
    }
  } catch (e) {
    console.log('[verify] cleanup skipped (non-fatal):', (e as Error).message);
  }
});
