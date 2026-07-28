import { vi, describe, it, expect } from 'vitest';
import * as agentDao from '../../server/dao/staff/staffAgentDao.js';
import * as skillDao from '../../server/dao/staff/staffSkillDao.js';
import * as generalSkillDao from '../../server/dao/staff/staffGeneralSkillDao.js';
import { materializeGeneralSkills } from '../../server/staff/staffGeneralSkillMaterializer.js';
import { runStaffChatTurn } from '../../server/staff/staffChatExecutor.js';
import { ExecutionMode } from '../../server/engine/executionStrategy.js';

/**
 * 覆盖数字员工「真实路径集成缝」——这是此前 dispatch/execution 测试只 mock 桥接函数、
 * 从不真跑的盲区：
 *   staffChatExecutor.runStaffChatTurn → executeChat({ staffMcpManager, extraSkills,
 *   extraSkillExecutor, executionMode: REACT, apiMessages:[{role:'system',...}] })
 *
 * 本测试通过 mock executeChat/loadModelsConfig/buildStaffMcpManager，强制走真实分支，
 * 断言装配缝参数确实传入，且 system 消息正确拼装了 persona + 绑定 SOP。
 */

const hoist = vi.hoisted(() => {
  const captured: { args: Record<string, unknown> | null } = { args: null };
  return { captured };
});

vi.mock('../../server/engine/streamExecutor.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    executeChat: vi.fn(async (args: Record<string, unknown>) => {
      hoist.captured.args = args;
      return { content: 'REAL-PATH-MOCK', thinkingContent: 'think' };
    }),
  };
});

vi.mock('../../server/modelsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    loadModelsConfig: async () => ({
      version: 1,
      models: [
        {
          id: 'local-test',
          name: 'Local Test',
          provider: 'local',
          apiKey: '',
          baseUrl: 'http://localhost:11434',
          model: 'local',
          capabilities: {},
          contextWindow: 128000,
          maxTokens: 8192,
          defaultThinkingLevel: 'off',
          temperature: 0.7,
          topP: 1,
        },
      ],
      groups: [],
      providers: [],
    }),
    isLocalModel: (mc: { provider?: string; apiEndpoint?: string }) =>
      !!(mc && (mc.provider === 'local' || (mc.apiEndpoint || '').includes('localhost'))),
  };
});

vi.mock('../../server/staff/staffMcpClientManager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    buildStaffMcpManager: async () => ({
      disconnectAll: async () => undefined,
      hasServerPrefix: () => false,
      clients: new Map(),
    }),
  };
});

describe('物化通用技能 materializeGeneralSkills', () => {
  const tenant = `test-materialize-${Date.now()}`;

  it('published + markdown 非空 → 返回 definitions；draft/空 markdown → 排除', async () => {
    const pub = generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: `refund-policy-${Date.now()}`,
      name: '退款政策',
      skill_markdown: '# 退款流程\n1. 审核\n2. 退款',
      status: 'published',
    });
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: `draft-skill-${Date.now()}`,
      name: '草稿技能',
      skill_markdown: '# 草稿',
      status: 'draft',
    });
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: `empty-md-${Date.now()}`,
      name: '空 markdown',
      skill_markdown: '',
      status: 'published',
    });

    const r = materializeGeneralSkills(tenant);
    expect(Array.isArray(r.definitions)).toBe(true);
    expect(r.definitions.length).toBe(1);
    expect(r.definitions[0].id).toContain(pub.slug);

    // 执行器对存在的 id 返回 prompt 指令（模型据此干活）
    const ok = await r.executor(r.definitions[0].id, {});
    expect(ok.success).toBe(true);

    // 对不存在的 id 返回「未找到」（回退逻辑）
    const miss = await r.executor(`staff-${tenant}-nope`, {});
    expect(miss.success).toBe(false);
  });
});

describe('runStaffChatTurn 真实路径集成缝', () => {
  const tenant = `test-seam-${Date.now()}`;

  it('executeChat 收到 staffMcpManager / extraSkills / extraSkillExecutor / REACT / 含 persona+SOP 的 system 消息', async () => {
    const agent = agentDao.createAgent({
      tenant_id: tenant,
      name: `seam-agent-${Date.now()}`,
      persona_prompt: '我是一个专属测试员工，负责验证装配缝。',
    });

    // 绑定技能 → SOP 进入 system prompt
    const skill = skillDao.createSkill({
      tenant_id: tenant,
      skill_id: `skill-seam-${Date.now()}`,
      name: '退货处理SOP',
      content: {
        description: '退货标准流程',
        nodes: [{ type: 'step', title: '受理', description: '登记退货请求' }],
      },
      status: 'published',
    });
    agentDao.upsertAgentResourceBinding(tenant, agent.id, 'skill', skill.skill_id, {}, 'active');

    // 物化通用技能 → extraSkills 非空
    const genSlug = `seam-genskill-${Date.now()}`;
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: genSlug,
      name: '通用技能A',
      skill_markdown: '# 通用技能A\n步骤...',
      status: 'published',
    });

    const out = await runStaffChatTurn(
      {
        tenantId: tenant,
        sessionId: `sess-seam-${Date.now()}`,
        agentId: agent.id,
        message: '客户要退货怎么办',
        history: [],
        model: 'local-test',
      },
      () => undefined,
    );

    expect(out.mock).toBe(false);
    expect(out.content).toBe('REAL-PATH-MOCK');

    const args = hoist.captured.args;
    expect(args).not.toBeNull();

    // 1) 执行模式为 REACT
    expect(args!.executionMode).toBe(ExecutionMode.REACT);

    // 2) 数字员工隔离 MCP manager 被注入
    expect(args!.staffMcpManager).toBeTruthy();
    expect(typeof (args!.staffMcpManager as { disconnectAll?: unknown }).disconnectAll).toBe('function');

    // 3) 物化通用技能被注入
    expect(Array.isArray(args!.extraSkills)).toBe(true);
    expect((args!.extraSkills as unknown[]).length).toBeGreaterThanOrEqual(1);
    expect(
      (args!.extraSkills as Array<{ id: string }>).some((d) => d.id.includes(genSlug)),
    ).toBe(true);
    expect(typeof args!.extraSkillExecutor).toBe('function');

    // 4) system 消息装配：persona + 绑定 SOP（人设/知识隔离正确）
    const sys = (args!.apiMessages as Array<{ role: string; content: string }>)[0];
    expect(sys.role).toBe('system');
    expect(sys.content).toContain(agent.name);
    expect(sys.content).toContain('我是一个专属测试员工');
    expect(sys.content).toContain('【你遵循的 SOP');
    expect(sys.content).toContain('退货处理SOP');
  });

  it('agent 不存在时抛出明确错误', async () => {
    await expect(
      runStaffChatTurn(
        {
          tenantId: tenant,
          sessionId: 'x',
          agentId: 'non-existent-agent',
          message: 'hi',
          history: [],
        },
        () => undefined,
      ),
    ).rejects.toThrow(/数字员工（agent）不存在/);
  });
});
