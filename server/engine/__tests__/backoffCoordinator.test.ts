/**
 * BackoffCoordinator 单元测试
 *
 * 验证两层退避决策：
 *   第一层（同模型 Key 层）：429 / rate_limit 且还有健康 Key → rotate-key
 *   第二层（跨模型降级层）：连续限流达阈值 RATE_LIMIT_MODEL_SWITCH_THRESHOLD(2)
 *                          或无可轮换 Key → switch-model（冷却本模型 + 选备选）
 *   非限流错误：仅 RECOVERABLE 类型做跨模型降级，auth/unknown 等 → give-up
 *   异常兜底：coordinate 永不抛错，内部异常降级为 give-up
 *
 * 测试策略：
 *   - keyRotator 三层 API（getKeyStatus / selectKey / reportKeyResult）用 vi.mock 打桩，
 *     以避免触碰文件系统与轮询状态副作用。
 *   - ModelFailoverManager 直接传入一个可控的假实现（构造器注入），精确断言调用与返回值。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BackoffCoordinator } from '../backoffCoordinator.js';
import type { ModelFailoverManager } from '../modelFailover.js';

// ===== keyRotator 打桩 =====
const { getKeyStatusMock, selectKeyMock, reportKeyResultMock } = vi.hoisted(() => ({
  getKeyStatusMock: vi.fn(),
  selectKeyMock: vi.fn(),
  reportKeyResultMock: vi.fn(),
}));

vi.mock('../../keyRotator.js', () => ({
  getKeyStatus: getKeyStatusMock,
  selectKey: selectKeyMock,
  reportKeyResult: reportKeyResultMock,
}));

// ===== 测试夹具 =====

/** 构造一个可控的 ModelFailoverManager 假实现 */
function makeFailoverManager(opts: { nextModelId?: string; nextModelName?: string } = {}) {
  const manager = {
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
    setModels: vi.fn(),
    markModelForCooldown: vi.fn(),
    getNextModel: vi.fn((_cur: string, _cat?: string, _caps?: unknown) =>
      opts.nextModelId === undefined
        ? null
        : { id: opts.nextModelId, name: opts.nextModelName ?? opts.nextModelId },
    ),
  };
  return manager as unknown as ModelFailoverManager & {
    recordFailure: ReturnType<typeof vi.fn>;
    recordSuccess: ReturnType<typeof vi.fn>;
    setModels: ReturnType<typeof vi.fn>;
    markModelForCooldown: ReturnType<typeof vi.fn>;
    getNextModel: ReturnType<typeof vi.fn>;
  };
}

/** 多 Key 模型配置（供 keyRotator 轮换用） */
const multiKeyModelConfig = {
  id: 'm1',
  apiKeys: [
    { key: 'k0', enabled: true },
    { key: 'k1', enabled: true },
  ],
} as any;

/** 两把 Key 的状态（index 0 失败，index 1 可作为轮换目标） */
const twoKeysStatus = [
  { index: 0, failCount: 0, lastUsedAt: 0, lastFailedAt: undefined, isPrimary: true },
  { index: 1, failCount: 0, lastUsedAt: 0, lastFailedAt: undefined, isPrimary: false },
];

// ===== 测试套件 =====

describe('BackoffCoordinator — 两层退避升级', () => {
  let coordinator: BackoffCoordinator;
  let failover: ReturnType<typeof makeFailoverManager>;

  beforeEach(() => {
    failover = makeFailoverManager({ nextModelId: 'm2', nextModelName: 'Model2' });
    coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(twoKeysStatus);
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });
    reportKeyResultMock.mockReturnValue(undefined);
  });

  it('限流 #1 且存在可轮换 Key → rotate-key（同模型 Key 层）', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    });

    expect(d.action).toBe('rotate-key');
    expect(d.layer).toBe('key');
    expect(d.keyIndex).toBe(1);
    expect(d.apiKey).toBe('k1');
    expect(d.backoffMs).toBe(1000);
    expect(d.rateLimitStreak).toBe(1);
    expect(d.reason).toContain('限流 #1');

    // 失败 Key 应被上报冷却
    expect(reportKeyResultMock).toHaveBeenCalledWith('m1', 0, false);
    // 失败模型应被记录到 failover 管理器
    expect(failover.recordFailure).toHaveBeenCalled();
    // 同模型层应调用 selectKey 轮换
    expect(selectKeyMock).toHaveBeenCalled();
    // 未达跨模型阈值，不应触发跨模型冷却/选模
    expect(failover.markModelForCooldown).not.toHaveBeenCalled();
    expect(failover.getNextModel).not.toHaveBeenCalled();
  });

  it('连续限流 #2 → 升级为跨模型降级 switch-model', () => {
    coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    }); // #1: rotate-key
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    }); // #2: switch-model

    expect(d.action).toBe('switch-model');
    expect(d.layer).toBe('model');
    expect(d.nextModelId).toBe('m2');
    expect(d.nextModelName).toBe('Model2');
    expect(d.rateLimitStreak).toBe(2);
    // 升级日志走 logger.warn（"连续限流 2 次，升级为跨模型降级"），决策 reason 为降级动作本身
    expect(d.reason).toContain('跨模型降级（rate_limit）');
    // 升级时应将本模型冷却并选取备选模型
    expect(failover.markModelForCooldown).toHaveBeenCalledWith('m1', 120_000);
    expect(failover.getNextModel).toHaveBeenCalledWith('m1', 'rate_limit', undefined);
  });
});

describe('BackoffCoordinator — 错误分类与降级策略', () => {
  let coordinator: BackoffCoordinator;
  let failover: ReturnType<typeof makeFailoverManager>;

  beforeEach(() => {
    failover = makeFailoverManager({ nextModelId: 'm2', nextModelName: 'Model2' });
    coordinator = new BackoffCoordinator(failover);
    // 默认无可用 Key，使 rate_limit 路径直接走跨模型层
    getKeyStatusMock.mockReturnValue(null);
    selectKeyMock.mockReturnValue(null);
    reportKeyResultMock.mockReturnValue(undefined);
  });

  it('401 auth → give-up（不可恢复）', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 401 },
    });
    expect(d.action).toBe('give-up');
    expect(d.layer).toBe('model');
    expect(d.reason).toContain('不可恢复错误类型: auth');
    expect(failover.getNextModel).not.toHaveBeenCalled();
  });

  it('unknown 错误 → give-up', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: {},
    });
    expect(d.action).toBe('give-up');
    expect(d.reason).toContain('不可恢复错误类型: unknown');
  });

  it('timeout 消息 → switch-model（可恢复）', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { message: 'request timeout' },
    });
    expect(d.action).toBe('switch-model');
    expect(d.reason).toContain('timeout');
    expect(failover.getNextModel).toHaveBeenCalledWith('m1', 'timeout', undefined);
  });

  it('network 消息 → switch-model，并透传 requiredCapabilities', () => {
    const caps = ['code', 'reasoning'];
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { message: 'network connection refused' },
      requiredCapabilities: caps as any,
    });
    expect(d.action).toBe('switch-model');
    expect(d.reason).toContain('network');
    expect(failover.getNextModel).toHaveBeenCalledWith('m1', 'network', caps);
  });

  it('model_not_supported 消息 → switch-model（可恢复）', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { message: 'model not supported' },
    });
    expect(d.action).toBe('switch-model');
    expect(d.reason).toContain('model_not_supported');
  });

  it('rate_limit 且无轮换 Key → 直接跨模型降级', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: -1,
      error: { status: 429 },
    });
    expect(d.action).toBe('switch-model');
    expect(failover.markModelForCooldown).toHaveBeenCalledWith('m1', 120_000);
  });
});

describe('BackoffCoordinator — recordSuccess 与无备选模型', () => {
  let coordinator: BackoffCoordinator;
  let failover: ReturnType<typeof makeFailoverManager>;

  beforeEach(() => {
    failover = makeFailoverManager({ nextModelId: 'm2' });
    coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(twoKeysStatus);
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });
    reportKeyResultMock.mockReturnValue(undefined);
  });

  it('成功调用重置限流计数，后续限流重新从 rotate-key 开始', () => {
    coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    }); // #1 rotate
    coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    }); // #2 switch（计数清零前）

    coordinator.recordSuccess('m1', 0);

    expect(reportKeyResultMock).toHaveBeenCalledWith('m1', 0, true);
    expect(failover.recordSuccess).toHaveBeenCalledWith('m1');

    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    });
    expect(d.action).toBe('rotate-key');
    expect(d.rateLimitStreak).toBe(1);
  });

  it('跨模型降级时无可用备选模型 → give-up', () => {
    failover = makeFailoverManager({ nextModelId: undefined }); // getNextModel 返回 null
    coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(null);

    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: -1,
      error: { status: 429 },
    });
    expect(d.action).toBe('give-up');
    expect(d.reason).toContain('无可用备选模型');
  });
});

describe('BackoffCoordinator — 异常兜底与配置同步', () => {
  it('getKeyStatus 抛错时 coordinate 不抛异常，降级为 give-up', () => {
    const failover = makeFailoverManager({ nextModelId: 'm2' });
    const coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockImplementation(() => {
      throw new Error('boom');
    });
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });

    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    });
    expect(d.action).toBe('give-up');
    expect(d.reason).toContain('内部异常');
  });

  it('传入 modelsConfig 时同步给 failoverManager.setModels', () => {
    const failover = makeFailoverManager({ nextModelId: 'm2' });
    const coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(null);

    coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: -1,
      error: { status: 401 }, // auth → give-up，但 setModels 应在分类前调用
      modelsConfig: { models: [multiKeyModelConfig] } as any,
    });

    expect(failover.setModels).toHaveBeenCalledWith([multiKeyModelConfig]);
  });
});

describe('BackoffCoordinator — 补充边缘用例', () => {
  let coordinator: BackoffCoordinator;
  let failover: ReturnType<typeof makeFailoverManager>;

  beforeEach(() => {
    failover = makeFailoverManager({ nextModelId: 'm2', nextModelName: 'Model2' });
    coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(twoKeysStatus);
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });
    reportKeyResultMock.mockReturnValue(undefined);
  });

  it('503 server 错误 → switch-model（可恢复类型）', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: -1,
      error: { status: 503 },
    });
    expect(d.action).toBe('switch-model');
    expect(d.reason).toContain('server');
    expect(failover.getNextModel).toHaveBeenCalledWith('m1', 'server', undefined);
  });

  it('可轮换但 selectKey 返回相同索引 → 退化为跨模型降级（streak 仍为 #1）', () => {
    selectKeyMock.mockReturnValue({ key: 'k0', index: 0 }); // 与失败 Key 相同
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 429 },
    });
    expect(d.action).toBe('switch-model');
    expect(d.rateLimitStreak).toBe(1); // 未达阈值，但因无法真正轮换而升级
    expect(failover.markModelForCooldown).toHaveBeenCalledWith('m1', 120_000);
  });

  it('两个模型各自独立计数，互不污染', () => {
    // m1 连续两次限流 → 第二次升级跨模型
    coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    const m1Second = coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(m1Second.action).toBe('switch-model');

    // m2 第一次限流仍应为 rotate-key（独立计数）
    const m2First = coordinator.coordinate({
      modelId: 'm2', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(m2First.action).toBe('rotate-key');
    expect(m2First.rateLimitStreak).toBe(1);
  });

  it('跨模型降级时备选与当前同 ID → give-up', () => {
    failover = makeFailoverManager({ nextModelId: 'm1' }); // 返回自身
    coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(null);

    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: -1,
      error: { status: 429 },
    });
    expect(d.action).toBe('give-up');
    expect(d.reason).toContain('无可用备选模型');
  });

  it('auth 错误携带 modelsConfig 时仍先同步 setModels 再 give-up', () => {
    const d = coordinator.coordinate({
      modelId: 'm1',
      modelConfig: multiKeyModelConfig,
      keyIndex: 0,
      error: { status: 401 },
      modelsConfig: { models: [multiKeyModelConfig] } as any,
    });
    expect(failover.setModels).toHaveBeenCalledWith([multiKeyModelConfig]);
    expect(d.action).toBe('give-up');
    expect(d.reason).toContain('不可恢复错误类型: auth');
  });

  it('每次 coordinate 均向 failover 上报失败并携带错误分类', () => {
    coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(failover.recordFailure).toHaveBeenCalledWith('m1', expect.anything(), 'rate_limit');
  });
});

describe('BackoffCoordinator — 限流 streak TTL 过期重置', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('限流 #1 → rotate(streak=1)，超过 TTL(5min) 后再限流 → streak 重置为 1（不升级）', () => {
    const failover = makeFailoverManager({ nextModelId: 'm2' });
    const coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(twoKeysStatus);
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });

    const first = coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(first.action).toBe('rotate-key');
    expect(first.rateLimitStreak).toBe(1);

    // 推进超过 RATE_LIMIT_STREAK_TTL_MS（5min）后，历史限流计数应过期重置
    vi.advanceTimersByTime(6 * 60 * 1000);

    const second = coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    // 关键断言：TTL 过期后第二次限流被当作"新的第一次"，streak 重置为 1，仍 rotate 而非升级
    expect(second.rateLimitStreak).toBe(1);
    expect(second.action).toBe('rotate-key');
    // 未升级跨模型，故不应触发本模型冷却
    expect(failover.markModelForCooldown).not.toHaveBeenCalled();
  });

  it('TTL 内连续命中达阈值 → 升级 switch-model', () => {
    const failover = makeFailoverManager({ nextModelId: 'm2' });
    const coordinator = new BackoffCoordinator(failover);
    getKeyStatusMock.mockReturnValue(twoKeysStatus);
    selectKeyMock.mockReturnValue({ key: 'k1', index: 1 });

    const first = coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(first.rateLimitStreak).toBe(1);

    // TTL 内（< 5min）再次限流 → streak=2 → 升级跨模型
    vi.advanceTimersByTime(60 * 1000);
    const second = coordinator.coordinate({
      modelId: 'm1', modelConfig: multiKeyModelConfig, keyIndex: 0, error: { status: 429 },
    });
    expect(second.rateLimitStreak).toBe(2);
    expect(second.action).toBe('switch-model');
  });
});
