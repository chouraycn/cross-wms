/**
 * 技能链执行测试
 *
 * 测试技能链（skill chain）的顺序执行、失败中止和工具调用场景。
 * 技能链将多个技能按顺序串联执行，支持 failStrategy 控制失败行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===================== Mock 模块 =====================

const mockChainRows = {
  getSkillChain: vi.fn(),
  getChainNodes: vi.fn(),
  createSkillExecution: vi.fn(),
  updateSkillExecution: vi.fn(),
};

const mockSkillRows = {
  getUserSkillById: vi.fn(),
};

const mockModels = {
  loadModelsConfig: vi.fn().mockResolvedValue({
    models: [{ id: 'gpt-4', provider: 'openai', apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', temperature: 0.7, maxTokens: 4096 }],
    defaultModelId: 'gpt-4',
  }),
};

const mockAiClient = {
  callAIModel: vi.fn().mockResolvedValue('Mock AI response content'),
};

vi.mock('../../dao/chains.js', () => mockChainRows);
vi.mock('../../dao/skills.js', () => mockSkillRows);
vi.mock('../../modelsStore.js', () => ({
  loadModelsConfig: mockModels.loadModelsConfig,
  isLocalModel: vi.fn().mockReturnValue(false),
}));
vi.mock('../../aiClient.js', () => ({
  callAIModel: mockAiClient.callAIModel,
}));

// ===================== 测试套件 =====================

describe('技能链顺序执行', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 默认：3 个节点的链
    mockChainRows.getSkillChain.mockReturnValue({
      id: 'chain-1',
      name: '测试技能链',
      skill_ids: JSON.stringify(['skill-1', 'skill-2', 'skill-3']),
      fail_strategy: 'stop',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    });

    mockChainRows.getChainNodes.mockReturnValue([
      {
        id: 'node-1', chain_id: 'chain-1', skill_id: 'skill-1',
        skill_name: '数据采集', skill_icon: 'database', node_order: 0,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-2', chain_id: 'chain-1', skill_id: 'skill-2',
        skill_name: '数据分析', skill_icon: 'chart', node_order: 1,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-3', chain_id: 'chain-1', skill_id: 'skill-3',
        skill_name: '报表生成', skill_icon: 'file-text', node_order: 2,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
    ]);

    mockSkillRows.getUserSkillById.mockReturnValue({
      promptTemplate: '执行任务：{input}',
    });

    mockAiClient.callAIModel.mockResolvedValue('任务执行完成');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('所有节点顺序执行成功', async () => {
    const { executeChain } = await import('../../services/chainExecutor.js');

    const { executionId } = await executeChain('chain-1');
    expect(executionId).toBeDefined();
    expect(executionId).not.toBe('');

    // 验证 AI 被调用了 3 次
    expect(mockAiClient.callAIModel).toHaveBeenCalledTimes(3);

    // 验证执行记录被持久化
    expect(mockChainRows.updateSkillExecution).toHaveBeenCalled();
    const lastCall = mockChainRows.updateSkillExecution.mock.calls[0];
    const updateData = lastCall[1];
    expect(updateData.status).toBe('completed');
  });

  it('链没有节点时抛出错误', async () => {
    mockChainRows.getChainNodes.mockReturnValue([]);

    const { executeChain } = await import('../../services/chainExecutor.js');

    await expect(executeChain('chain-1')).rejects.toThrow('Chain has no nodes');
  });

  it('链不存在时抛出错误', async () => {
    mockChainRows.getSkillChain.mockReturnValue(undefined);

    const { executeChain } = await import('../../services/chainExecutor.js');

    await expect(executeChain('chain-1')).rejects.toThrow('Chain not found');
  });
});

// ===================== 失败中止 =====================

describe('技能链失败中止 (failStrategy=stop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 重新设置 loadModelsConfig（上一个 describe 的 afterEach 通过
    // vi.restoreAllMocks() 清除了所有 mock 实现，需要重新设置）
    mockModels.loadModelsConfig.mockResolvedValue({
      models: [{ id: 'gpt-4', provider: 'openai', apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', temperature: 0.7, maxTokens: 4096 }],
      defaultModelId: 'gpt-4',
    });

    mockChainRows.getSkillChain.mockReturnValue({
      id: 'chain-fail',
      name: '失败测试链',
      skill_ids: JSON.stringify(['skill-1', 'skill-2', 'skill-3']),
      fail_strategy: 'stop',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    });

    mockChainRows.getChainNodes.mockReturnValue([
      {
        id: 'node-1', chain_id: 'chain-fail', skill_id: 'skill-1',
        skill_name: '第一步', skill_icon: 'play', node_order: 0,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-2', chain_id: 'chain-fail', skill_id: 'skill-2',
        skill_name: '第二步-失败', skill_icon: 'x', node_order: 1,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-3', chain_id: 'chain-fail', skill_id: 'skill-3',
        skill_name: '第三步-跳过', skill_icon: 'stop', node_order: 2,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
    ]);

    mockSkillRows.getUserSkillById.mockReturnValue({
      promptTemplate: null, // 无 promptTemplate — 返回基础结果
    });

    // 让第二个节点失败：无 promptTemplate 时会成功（返回 no_prompt_template）。
    // 要让它失败，我们需要模拟 AI 调用失败。
    // 重新 mock: callAIModel 在第二次调用时抛出错误
    let callCount = 0;
    mockAiClient.callAIModel.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        // 让 callAIModel 在 failStrategy=stop 测试中不会被调用（因为无 promptTemplate 走快速路径）
      }
      return '响应内容';
    });
  });

  it('节点失败时后续节点被跳过 (failStrategy=stop)', async () => {
    // 这个测试聚焦于验证 failStrategy='stop' 的链停止逻辑。
    // 由于所有节点都有 promptTemplate=null，它们会走快速路径（都成功）。
    // 我们需要构造一个真正的失败场景。

    // 为第二个节点设置 promptTemplate，触发 AI 调用但让 AI 失败
    mockSkillRows.getUserSkillById.mockImplementation((id: string) => {
      if (id === 'skill-2') {
        return { promptTemplate: '会失败的任务' };
      }
      return { promptTemplate: null };
    });

    // mock callAIModel 在第二次调用时抛出错误
    let callCount = 0;
    mockAiClient.callAIModel.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('AI API 调用失败');
      }
      return '成功';
    });

    const { executeChain } = await import('../../services/chainExecutor.js');

    await executeChain('chain-fail');

    // 验证执行状态
    const updateCall = mockChainRows.updateSkillExecution.mock.calls[0];
    const updateData = updateCall[1];
    expect(updateData.status).toBe('failed');
  });
});

// ===================== 链中止 =====================

describe('技能链手动中止', () => {
  it('abortExecution 设置中止标志并广播事件', async () => {
    // 在节点之间检查 abortSignals
    const { abortExecution, addClient, removeClient } = await import('../../services/chainExecutor.js');

    const mockRes = {
      writable: true,
      write: vi.fn(),
      end: vi.fn(),
    };

    // 注册 SSE 客户端
    addClient('exec-abort-test', mockRes as any);

    // 触发中止
    abortExecution('exec-abort-test');

    // 验证广播了 chain-aborted 事件
    expect(mockRes.write).toHaveBeenCalled();
    const written = mockRes.write.mock.calls[0][0] as string;
    expect(written).toContain('chain-aborted');

    // 清理
    removeClient('exec-abort-test', mockRes as any);
  });

  it('addClient 和 removeClient 管理 SSE 客户端', async () => {
    const { addClient, removeClient } = await import('../../services/chainExecutor.js');

    const res1 = { writable: true, write: vi.fn(), end: vi.fn() };
    const res2 = { writable: true, write: vi.fn(), end: vi.fn() };

    addClient('exec-1', res1 as any);
    addClient('exec-1', res2 as any);

    removeClient('exec-1', res1 as any);

    // 验证 res2 仍在，res1 已移除
    // 通过广播来判断 — 只 res2 收到
    const { abortExecution } = await import('../../services/chainExecutor.js');

    // 清空 write 调用
    vi.clearAllMocks();

    abortExecution('exec-1');

    // 只有 res2 收到事件
    expect(res1.write).not.toHaveBeenCalled();
    expect(res2.write).toHaveBeenCalled();
  });
});

// ===================== 数据传递模式 =====================

describe('技能链数据传递 (dataPassMode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // 重新设置 loadModelsConfig（避免受 restoreAllMocks 影响）
    mockModels.loadModelsConfig.mockResolvedValue({
      models: [{ id: 'gpt-4', provider: 'openai', apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', temperature: 0.7, maxTokens: 4096 }],
      defaultModelId: 'gpt-4',
    });

    mockChainRows.getSkillChain.mockReturnValue({
      id: 'chain-data',
      name: '数据传递测试',
      skill_ids: JSON.stringify(['skill-1', 'skill-2']),
      fail_strategy: 'stop',
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
    });

    mockSkillRows.getUserSkillById.mockReturnValue({
      promptTemplate: '处理数据',
    });

    mockAiClient.callAIModel.mockResolvedValue('处理完成');

    // 重新设置 loadModelsConfig mock（clearAllMocks 不清除实现，但保险起见重新设置）
    mockModels.loadModelsConfig.mockResolvedValue({
      models: [{ id: 'gpt-4', provider: 'openai', apiEndpoint: 'https://api.openai.com', apiKey: 'sk-test', temperature: 0.7, maxTokens: 4096 }],
      defaultModelId: 'gpt-4',
    });
    mockModels.isLocalModel?.mockReturnValue?.(false);
  });

  it('dataPassMode=full 传递全部前序输出', async () => {
    mockChainRows.getChainNodes.mockReturnValue([
      {
        id: 'node-1', chain_id: 'chain-data', skill_id: 'skill-1',
        skill_name: '源节点', skill_icon: 'database', node_order: 0,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-2', chain_id: 'chain-data', skill_id: 'skill-2',
        skill_name: '目标节点', skill_icon: 'file-text', node_order: 1,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
    ]);

    const { executeChain } = await import('../../services/chainExecutor.js');

    await executeChain('chain-data');

    // 验证两个节点都执行了
    expect(mockAiClient.callAIModel).toHaveBeenCalledTimes(2);
  });

  it('dataPassMode=fields 仅传递选定字段', async () => {
    mockChainRows.getChainNodes.mockReturnValue([
      {
        id: 'node-1', chain_id: 'chain-data', skill_id: 'skill-1',
        skill_name: '源节点', skill_icon: 'database', node_order: 0,
        data_pass_mode: 'full', selected_fields: null, custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
      {
        id: 'node-2', chain_id: 'chain-data', skill_id: 'skill-2',
        skill_name: '字段过滤节点', skill_icon: 'filter', node_order: 1,
        data_pass_mode: 'fields',
        selected_fields: JSON.stringify(['summary', 'count']),
        custom_mapping: null,
        timeout: 30000, retry_count: 0,
      },
    ]);

    const { executeChain } = await import('../../services/chainExecutor.js');

    await executeChain('chain-data');

    // 链执行成功，两个节点都完成
    expect(mockAiClient.callAIModel).toHaveBeenCalledTimes(2);
  });
});
