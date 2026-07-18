import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthChecker, HealthCheckerRegistry } from '../health-checker.js';

describe('HealthChecker', () => {
  it('无心跳无探针时返回 unknown', async () => {
    const checker = new HealthChecker('h1');
    const { status } = await checker.check();
    expect(status).toBe('unknown');
  });

  it('心跳报告后状态为 healthy', async () => {
    const checker = new HealthChecker('h1', { windowMs: 100 });
    checker.beat(0);
    const { status } = await checker.check(50);
    expect(status).toBe('healthy');
  });

  it('心跳超时后状态为 unhealthy', async () => {
    const checker = new HealthChecker('h1', { windowMs: 100 });
    checker.beat(0);
    const { status } = await checker.check(200);
    expect(status).toBe('unhealthy');
  });

  it('checkHeartbeat 在无心跳时返回 unknown', () => {
    const checker = new HealthChecker('h1', { windowMs: 100 });
    const state = checker.checkHeartbeat();
    expect(state.status).toBe('unknown');
  });

  it('探针返回 false 标记为 unhealthy', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => false });
    const { status, results } = await checker.check(0);
    expect(status).toBe('unhealthy');
    expect(results[0].status).toBe('unhealthy');
    expect(results[0].message).toBe('probe returned false');
  });

  it('探针抛异常标记为 unhealthy', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => { throw new Error('boom'); } });
    const { results } = await checker.check(0);
    expect(results[0].status).toBe('unhealthy');
    expect(results[0].message).toContain('boom');
  });

  it('severity=degraded 时探针失败降级而非不健康', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({
      name: 'p1',
      probe: () => false,
      severity: 'degraded',
    });
    const { status } = await checker.check(0);
    expect(status).toBe('degraded');
  });

  it('探针超时标记为 unhealthy', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({
      name: 'p1',
      probe: () => new Promise<boolean>(() => { /* never resolves */ }),
      timeoutMs: 50,
    });
    const { results } = await checker.check(0);
    expect(results[0].status).toBe('unhealthy');
    expect(results[0].message).toContain('timed out');
  });

  it('isReady 仅在 healthy 时返回 true', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => true });
    expect(await checker.isReady(0)).toBe(true);
    checker.addProbe({ name: 'p2', probe: () => false });
    expect(await checker.isReady(0)).toBe(false);
  });

  it('addProbe/removeProbe 管理探针', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => true });
    expect(checker.removeProbe('p1')).toBe(true);
    expect(checker.removeProbe('p1')).toBe(false);
    expect((await checker.check(0)).results).toHaveLength(0);
  });

  it('unhealthy 优先于 degraded', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => false, severity: 'degraded' });
    checker.addProbe({ name: 'p2', probe: () => false, severity: 'unhealthy' });
    const { status } = await checker.check(0);
    expect(status).toBe('unhealthy');
  });

  it('getLastResults 返回上次结果', async () => {
    const checker = new HealthChecker('h1');
    checker.addProbe({ name: 'p1', probe: () => true });
    await checker.check(0);
    const last = checker.getLastResults();
    expect(last).toHaveLength(1);
    expect(last[0].name).toBe('p1');
  });
});

describe('HealthCheckerRegistry', () => {
  it('register/get/remove', () => {
    const reg = new HealthCheckerRegistry();
    const checker = new HealthChecker('h1');
    reg.register(checker);
    expect(reg.get('h1')).toBe(checker);
    expect(reg.remove('h1')).toBe(true);
    expect(reg.get('h1')).toBeUndefined();
  });

  it('clear 清空所有', () => {
    const reg = new HealthCheckerRegistry();
    reg.register(new HealthChecker('h1'));
    reg.register(new HealthChecker('h2'));
    reg.clear();
    expect(reg.get('h1')).toBeUndefined();
  });
});
