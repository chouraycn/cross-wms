/**
 * StaffDeck 执行平面集成测试（数字员工 MCP 整合 + 通用技能物化）
 *
 * 覆盖两条集成链路（对应「数字员工 MCP 与软件整合」「markdown 物化为注册技能接真执行」）：
 *
 * 1) 隔离 MCP 整合（request #1）
 *    - 无 enabled server → buildStaffMcpManager 返回 null（不污染全局单例）。
 *    - 有 enabled server → 通过 McpClientManager.create() 建立隔离实例，
 *      getMcpTools() 产出 `mcp__<sanitizedName>__<tool>` 工具，hasServerPrefix 命中，
 *      且 executeMcpTool 走本 manager 的隔离 client（证明分发优先级正确）。
 *
 * 2) 通用技能 markdown 物化（request #2）
 *    - sd_general_skills 中 `published` 且含 markdown 的技能被物化为 SkillDefinition
 *      （id 加租户命名空间 staff-<tenant>-<slug>，group='wms'，source='user'）。
 *    - executor 接真执行：返回 instruction 型 prompt 文本（模型后续按已有工具干活）。
 *    - draft 技能被排除；未知 id 返回「未找到」。
 *
 * 隔离：通过 ./utils/staff-e2e-env.js 将 SQLite 重定向到临时目录；
 * 每个 describe 块使用唯一 tenant，避免跨文件 UNIQUE(tenant_id,name) 冲突。
 * 真实 LLM / 真实 MCP 传输均被 mock，保证确定性、可在 CI 离线跑通。
 */

// 必须首先导入，确保 server/db-core 加载前 CDF_DATA_DIR 已指向临时目录
import './utils/staff-e2e-env.js';

import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import fs from 'fs';
import { McpClientManager } from '../../server/engine/mcpClientManager.js';
import { sanitizeServerName, makeMcpToolName } from '../../server/engine/mcpTypes.js';
import { buildStaffMcpManager } from '../../server/staff/staffMcpClientManager.js';
import { materializeGeneralSkills } from '../../server/staff/staffGeneralSkillMaterializer.js';
import { buildExecutionRuntimeData } from '../../server/routes/staff/executionRuntime.js';
import * as mcpServerDao from '../../server/engine/mcpConfigStore.js';
import * as generalSkillDao from '../../server/dao/staff/staffGeneralSkillDao.js';
import { STAFF_E2E_TMP_DIR } from './utils/staff-e2e-env.js';
import express from 'express';
import request from 'supertest';
import generalSkillsRouter from '../../server/routes/staff/generalSkills.js';

/** 生成跨文件唯一的租户名，避免 UNIQUE(tenant_id,name) 冲突 */
function uniqueTenant(): string {
  return `e2e-exec-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

afterAll(() => {
  try {
    fs.rmSync(STAFF_E2E_TMP_DIR, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('数字员工隔离 MCP 整合（request #1）', () => {
  const tenant = uniqueTenant();

  it('无 enabled server 时返回 null（不污染全局单例）', async () => {
    // 该 tenant 下没有插入任何 sd_mcp_servers 行
    const mgr = await buildStaffMcpManager(tenant);
    expect(mgr).toBeNull();
  });

  it('enabled server 被连接并物化为员工专属工具（带隔离前缀），executeMcpTool 走隔离 client', async () => {
    // 1. 种入一个 enabled 的 MCP server 配置
    const row = mcpServerDao.createMcpServer({
      tenant_id: tenant,
      name: 'acme-fs',
      transport: 'streamable_http',
      url: 'http://localhost:9999/mcp',
      enabled: true,
    });
    expect(row.enabled).toBe(1);

    // 2. mock connectServer：避免真实网络连接，直接物化一个 connected 的 fake server 进本 manager
    //    （vitest/tsx 运行时不强制 private，可在 spy 内写入 nameToIdMap / clients）
    const spy = vi
      .spyOn(McpClientManager.prototype, 'connectServer')
      .mockImplementation(async function (this: any, config: any) {
        const prefix = sanitizeServerName(config.name);
        this.nameToIdMap.set(prefix, config.id);
        this.clients.set(config.id, {
          config,
          client: {
            callTool: async () => ({ content: [{ type: 'text', text: 'pong' }] }),
            close: async () => undefined,
          },
          transport: {},
          connectionState: 'connected',
          tools: [{ name: 'ping', description: 'ping tool', inputSchema: { type: 'object', properties: {} } }],
          lastConnectedAt: Date.now(),
        });
        return {
          config,
          connectionState: 'connected',
          tools: [{ name: 'ping', description: 'ping tool', inputSchema: { type: 'object', properties: {} } }],
          lastConnectedAt: Date.now(),
        };
      });

    // 3. 建立隔离 manager
    const mgr = await buildStaffMcpManager(tenant);
    expect(mgr).not.toBeNull();
    expect(spy).toHaveBeenCalled();

    // 4. 工具名带有员工隔离前缀
    const tools = mgr!.getMcpTools();
    expect(tools.length).toBe(1);
    const expectedName = makeMcpToolName('acme-fs', 'ping');
    expect(tools[0].function.name).toBe(expectedName);
    expect(expectedName.startsWith('mcp__')).toBe(true);

    // 5. 前缀归属判定：该前缀属于本 manager（分发时优先走隔离 manager）
    expect(mgr!.hasServerPrefix(sanitizeServerName('acme-fs'))).toBe(true);
    expect(mgr!.hasServerPrefix('some_other_server')).toBe(false);

    // 6. executeMcpTool 走本 manager 的隔离 client（证明「整合进软件执行链路」）
    const execResult = await mgr!.executeMcpTool(expectedName, {});
    expect(execResult).toContain('pong');

    // 7. 会话结束清理隔离连接（close 为 fake，不会抛）
    await mgr!.disconnectAll();
    expect(mgr!.getMcpTools().length).toBe(0);
  });
});

describe('通用技能 markdown 物化（request #2 · 接真执行）', () => {
  const tenant = uniqueTenant();

  it('published 且含 markdown 的通用技能 → 物化为指令型 SkillDefinition', () => {
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'refund-policy',
      name: '退款政策',
      status: 'published',
      skill_markdown: '# 退款政策\n当用户询问退款时，按以下步骤处理：1. 核验订单 2. 计算可退金额',
      runtime_config: { parameters: { type: 'object', properties: { orderId: { type: 'string' } }, required: ['orderId'] } },
    });

    const { definitions, executor } = materializeGeneralSkills(tenant);
    expect(definitions.length).toBe(1);

    const def = definitions[0];
    expect(def.id).toBe(`staff-${tenant}-refund-policy`);
    expect(def.name).toBe('退款政策');
    expect(def.group).toBe('wms');
    expect(def.source).toBe('user');
    expect(def.native).toBe(false);
    expect(Array.isArray(def.instructionBlocks) && def.instructionBlocks.length > 0).toBe(true);
    // 带参数 schema，模型可以 skill_<id> 形式主动调用
    expect(def.parameters).toHaveProperty('properties');

    // 接真执行：返回 prompt 指令文本（模型后续按已有工具干活）
    return executor(def.id, { orderId: 'ORD-1' }).then((res) => {
      expect(res.success).toBe(true);
      const data = res.data as { type: string; instructions: string[]; params: Record<string, unknown> };
      expect(data.type).toBe('prompt');
      expect(Array.isArray(data.instructions) && data.instructions.length > 0).toBe(true);
      expect(data.params).toEqual({ orderId: 'ORD-1' });
    });
  });

  it('draft 通用技能被排除（仅 published 物化）', () => {
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'draft-skill',
      name: '草稿技能',
      status: 'draft',
      skill_markdown: '草稿内容，不应被物化',
    });

    const { definitions } = materializeGeneralSkills(tenant);
    expect(definitions.find((d) => d.id === `staff-${tenant}-draft-skill`)).toBeUndefined();
    // 仍只有 refund-policy 一条
    expect(definitions.length).toBe(1);
  });

  it('空 markdown 的 published 技能被排除', () => {
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'empty-md',
      name: '空指令',
      status: 'published',
      skill_markdown: '   ',
    });
    const { definitions } = materializeGeneralSkills(tenant);
    expect(definitions.find((d) => d.id === `staff-${tenant}-empty-md`)).toBeUndefined();
  });

  it('未知技能 id → 执行器返回未找到', async () => {
    const { executor } = materializeGeneralSkills(tenant);
    const res = await executor(`staff-${tenant}-nope`, {});
    expect(res.success).toBe(false);
    expect(typeof res.error).toBe('string');
  });
});

describe('执行链路状态端点 /execution-runtime（前端状态提示单一事实来源）', () => {
  const tenant = uniqueTenant();

  it('published+markdown 通用技能 → 标记 connected；draft/空 markdown 不标记', () => {
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'refund-policy',
      name: '退款政策',
      status: 'published',
      skill_markdown: '# 退款政策\n当用户询问退款时按步骤处理。',
    });
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'draft-skill',
      name: '草稿技能',
      status: 'draft',
      skill_markdown: '草稿内容',
    });
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'empty-md',
      name: '空指令',
      status: 'published',
      skill_markdown: '   ',
    });

    const { generalSkills } = buildExecutionRuntimeData(tenant);
    expect(generalSkills['refund-policy']).toBe(true);
    expect(generalSkills['draft-skill']).toBeUndefined();
    expect(generalSkills['empty-md']).toBeUndefined();
  });

  it('enabled MCP server → connected=true；disabled → connected=false', () => {
    const enabledRow = mcpServerDao.createMcpServer({
      tenant_id: tenant,
      name: 'acme-fs',
      transport: 'streamable_http',
      url: 'http://localhost:9999/mcp',
      enabled: true,
    });
    const disabledRow = mcpServerDao.createMcpServer({
      tenant_id: tenant,
      name: 'beta-fs',
      transport: 'sse',
      url: 'http://localhost:9998/mcp',
      enabled: false,
    });

    const { mcpServers } = buildExecutionRuntimeData(tenant);
    const enabled = mcpServers.find((s) => s.id === enabledRow.id);
    const disabled = mcpServers.find((s) => s.id === disabledRow.id);
    expect(enabled).toBeDefined();
    expect(enabled!.enabled).toBe(true);
    expect(enabled!.connected).toBe(true);
    expect(disabled).toBeDefined();
    expect(disabled!.enabled).toBe(false);
    expect(disabled!.connected).toBe(false);
  });

  it('状态与员工执行装配保持一致：connected 集合 == 物化/接入集合', () => {
    // 同一租户下，connected 的通用技能 slug 应与 materializeGeneralSkills 物化的 slug 完全一致
    const { generalSkills } = buildExecutionRuntimeData(tenant);
    const { definitions } = materializeGeneralSkills(tenant);
    const materializedSlugs = new Set(definitions.map((d) => d.id.replace(`staff-${tenant}-`, '')));
    const runtimeSlugs = new Set(Object.keys(generalSkills).filter((k) => generalSkills[k]));
    expect([...runtimeSlugs].sort()).toEqual([...materializedSlugs].sort());
  });
});

describe('通用技能运行端点 POST /general-skills/:slug/run（真实物化执行）', () => {
  const app = express();
  app.use(express.json());
  app.use('/general-skills', generalSkillsRouter);

  it('published + markdown 技能 → 真实执行，返回 instruction prompt', async () => {
    const tenant = uniqueTenant();
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'refund-run',
      name: '退款运行',
      status: 'published',
      skill_markdown: '# 退款运行\n1. 核验订单 2. 计算可退金额',
    });

    const res = await request(app)
      .post('/general-skills/refund-run/run')
      .send({ tenant_id: tenant, query: '查询退款状态' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(true);
    const instructions = res.body.data.output?.instructions ?? [];
    expect(Array.isArray(instructions)).toBe(true);
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.join('\n')).toContain('核验订单');
  });

  it('draft / 未发布技能 → 返回 success:false 且提示未发布', async () => {
    const tenant = uniqueTenant();
    generalSkillDao.createGeneralSkill({
      tenant_id: tenant,
      slug: 'draft-run',
      name: '草稿运行',
      status: 'draft',
      skill_markdown: '草稿指令',
    });

    const res = await request(app)
      .post('/general-skills/draft-run/run')
      .send({ tenant_id: tenant, query: 'x' });

    expect(res.status).toBe(200);
    expect(res.body.data.implemented).toBe(true);
    expect(res.body.data.success).toBe(false);
    expect(res.body.data.error).toMatch(/未发布|无可执行指令/);
  });
});
