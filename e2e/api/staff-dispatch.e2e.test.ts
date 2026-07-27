/**
 * StaffDeck 执行链路分发路由端到端验证（dispatch routing）
 *
 * 证明「数字员工整合进软件执行链路」在运行时真的闭环：
 *  1) 物化通用技能：模型点名 `skill_staff-<tenant>-<slug>` → handleSkillToolCall 解析
 *     → 全局 skillRegistry 未命中 → 回退 per-call extraSkillExecutor（materialize 的 executor）
 *     → runDeclarative 返回 instruction 型 prompt（模型接真执行）。
 *     同时钉死此前发现的 ID round-trip bug：slug 含横线时若用下划线 id 会找不到技能。
 *  2) 员工隔离 MCP：resolveMcpManager 在「员工 manager 拥有前缀」时选隔离实例，
 *     否则回退全局单例 —— 强租户隔离、不污染全局。
 *
 * 真实 LLM / 真实 MCP 传输均 mock，确定性离线跑。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import { handleSkillToolCall } from '../../server/engine/skillToolBridge.js';
import { resolveMcpManager } from '../../server/engine/actionPhaseExecutor.js';
import { materializeGeneralSkills } from '../../server/staff/staffGeneralSkillMaterializer.js';
import * as generalSkillDao from '../../server/dao/staff/staffGeneralSkillDao.js';
import { STAFF_E2E_TMP_DIR } from './utils/staff-e2e-env.js';

// 模拟全局 skillRegistry 未注册任何物化技能，强制走 extraSkillExecutor 回退分支
vi.mock('../../server/engine/skillRegistry.js', () => ({
  skillRegistry: { getSkill: () => undefined },
}));

/** 生成跨文件唯一的租户名，避免 UNIQUE(tenant_id,name) 冲突 */
function uniqueTenant(): string {
  return `e2e-dispatch-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

afterAll(() => {
  try {
    fs.rmSync(STAFF_E2E_TMP_DIR, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe('物化通用技能 → 执行链路分发（接真执行）', () => {
  const tenant = uniqueTenant();

  it('模型点名 skill_staff-<tenant>-<slug> → 路由到 extraSkillExecutor 并接真执行', async () => {
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'refund-policy',
      name: '退款政策',
      status: 'published',
      skill_markdown: '# 退款政策\n当用户询问退款时按步骤处理。',
      runtime_config: {
        parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] },
      },
    });

    const { definitions, executor } = materializeGeneralSkills(tenant);
    expect(definitions.length).toBe(1);
    const def = definitions[0];

    // reactExecutor.skillDefinitionToToolDef 把 def.id 的 '-'→'_' 作为暴露给模型的工具名
    const toolName = `skill_${def.id.replace(/-/g, '_')}`;
    expect(toolName).toBe(`skill_staff-${tenant}-refund-policy`.replace(/-/g, '_'));

    // 模拟模型发起一次 tool_call
    const resp = await handleSkillToolCall(
      { id: 'call-1', type: 'function', function: { name: toolName, arguments: JSON.stringify({ orderId: 'ORD-9' }) } },
      undefined,
      'session-dispatch',
      executor,
    );

    expect(resp.success).toBe(true);
    // 接真执行：runDeclarative 返回 instruction 型 prompt，模型后续按已有工具干活
    expect(resp.content).toContain('prompt');

    // 反向：点名不存在的物化技能 → 未找到（证明走回退分支而非静默成功）
    const missResp = await handleSkillToolCall(
      { id: 'call-2', type: 'function', function: { name: `skill_staff-${tenant}-ghost`.replace(/-/g, '_'), arguments: '{}' } },
      undefined,
      'session-dispatch',
      executor,
    );
    expect(missResp.success).toBe(false);
    expect(typeof missResp.error).toBe('string');
  });
});

describe('员工隔离 MCP 分发（resolveMcpManager 路由）', () => {
  // 全局回退（单例）与员工隔离 manager 的 duck-typed 替身
  const globalMgr = { executeMcpTool: vi.fn(), hasServerPrefix: () => false } as any;
  const staffMgr = { executeMcpTool: vi.fn(), hasServerPrefix: (p: string) => p === 'acme-fs' } as any;

  it('员工 manager 拥有前缀 → 选隔离实例', () => {
    const mgr = resolveMcpManager('mcp__acme-fs__ping', staffMgr, globalMgr);
    expect(mgr).toBe(staffMgr);
  });

  it('全局 server（非员工前缀）→ 回退全局单例', () => {
    const mgr = resolveMcpManager('mcp__global-srv__tool', staffMgr, globalMgr);
    expect(mgr).toBe(globalMgr);
  });

  it('未注入员工 manager → 回退全局', () => {
    const mgr = resolveMcpManager('mcp__acme-fs__ping', undefined, globalMgr);
    expect(mgr).toBe(globalMgr);
  });

  it('非 MCP 工具名 → 直接回退（不经过 MCP 分发）', () => {
    const mgr = resolveMcpManager('builtin_search', staffMgr, globalMgr);
    expect(mgr).toBe(globalMgr);
  });
});
