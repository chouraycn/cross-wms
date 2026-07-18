import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LifecycleManager, deriveReasonFromExit } from '../lifecycle.js';

describe('LifecycleManager', () => {
  let lm: LifecycleManager;
  beforeEach(() => {
    lm = new LifecycleManager({ now: () => 0 });
  });

  it('register 创建 pending 记录', () => {
    const r = lm.register('p1', 'test');
    expect(r.state).toBe('pending');
    expect(r.name).toBe('test');
  });

  it('get 返回注册的记录', () => {
    lm.register('p1', 'test');
    expect(lm.get('p1')?.name).toBe('test');
    expect(lm.get('nonexistent')).toBeUndefined();
  });

  it('canTransition 反映状态转移表', () => {
    expect(lm.canTransition('pending', 'starting')).toBe(true);
    expect(lm.canTransition('pending', 'running')).toBe(false);
    expect(lm.canTransition('running', 'exited')).toBe(true);
    expect(lm.canTransition('exited', 'running')).toBe(false);
  });

  it('setState 合法转移成功', () => {
    lm.register('p1', 'test');
    expect(lm.setState('p1', 'starting')).toBe(true);
    expect(lm.get('p1')?.state).toBe('starting');
    expect(lm.setState('p1', 'running')).toBe(true);
    expect(lm.get('p1')?.history).toHaveLength(2);
  });

  it('setState 非法转移失败', () => {
    lm.register('p1', 'test');
    expect(lm.setState('p1', 'running')).toBe(false);
    expect(lm.get('p1')?.state).toBe('pending');
  });

  it('setState 重复状态返回 true（幂等）', () => {
    lm.register('p1', 'test');
    lm.setState('p1', 'starting');
    expect(lm.setState('p1', 'starting')).toBe(true);
    expect(lm.get('p1')?.history).toHaveLength(1);
  });

  it('setPid 设置 pid', () => {
    lm.register('p1', 'test');
    lm.setPid('p1', 1234);
    expect(lm.get('p1')?.pid).toBe(1234);
  });

  it('touchOutput 更新 lastOutputAtMs', () => {
    const lm2 = new LifecycleManager({ now: () => 100 });
    lm2.register('p1', 'test');
    lm2.touchOutput('p1', 500);
    expect(lm2.get('p1')?.lastOutputAtMs).toBe(500);
  });

  it('finalize 标记退出并触发 exit 事件', () => {
    const events: { type: string }[] = [];
    lm.register('p1', 'test');
    lm.addListener((e) => events.push({ type: e.type }));
    lm.setState('p1', 'starting');
    lm.setState('p1', 'running');
    lm.finalize('p1', {
      reason: 'exit',
      exitCode: 0,
      exitSignal: null,
      durationMs: 100,
      timedOut: false,
    });
    expect(lm.get('p1')?.state).toBe('exited');
    expect(lm.get('p1')?.exit?.exitCode).toBe(0);
    expect(events.some((e) => e.type === 'exit')).toBe(true);
  });

  it('incrementRestart 累加计数', () => {
    lm.register('p1', 'test');
    expect(lm.incrementRestart('p1')).toBe(1);
    expect(lm.incrementRestart('p1')).toBe(2);
    expect(lm.get('p1')?.restartCount).toBe(2);
  });

  it('markZombie 后 cleanupZombies 清理超时僵尸', () => {
    const lm2 = new LifecycleManager({ now: () => 0, graceMs: 100 });
    lm2.register('p1', 'test');
    lm2.setState('p1', 'starting');
    lm2.setState('p1', 'running');
    lm2.markZombie('p1');
    // 未超时
    const cleaned0 = lm2.cleanupZombies(undefined, 50);
    expect(cleaned0).toHaveLength(0);
    // 超时后清理
    const cleaned1 = lm2.cleanupZombies(undefined, 200);
    expect(cleaned1).toEqual(['p1']);
    expect(lm2.get('p1')?.state).toBe('exited');
  });

  it('cleanupZombies 调用 cleanup 回调', () => {
    const lm2 = new LifecycleManager({ now: () => 0, graceMs: 0 });
    lm2.register('p1', 'test');
    lm2.setState('p1', 'starting');
    lm2.setState('p1', 'running');
    lm2.markZombie('p1');
    const cleanedIds: string[] = [];
    lm2.cleanupZombies((id) => cleanedIds.push(id), 100);
    expect(cleanedIds).toEqual(['p1']);
  });

  it('reviveZombie 将僵尸恢复为 running', () => {
    lm.register('p1', 'test');
    lm.setState('p1', 'starting');
    lm.setState('p1', 'running');
    lm.markZombie('p1');
    expect(lm.reviveZombie('p1')).toBe(true);
    expect(lm.get('p1')?.state).toBe('running');
  });

  it('reviveZombie 对非僵尸返回 false', () => {
    lm.register('p1', 'test');
    expect(lm.reviveZombie('p1')).toBe(false);
  });

  it('list/listActive 反映状态', () => {
    lm.register('p1', 'a');
    lm.register('p2', 'b');
    lm.setState('p1', 'starting');
    lm.setState('p1', 'running');
    expect(lm.list()).toHaveLength(2);
    expect(lm.listActive()).toHaveLength(1);
  });

  it('remove 删除记录', () => {
    lm.register('p1', 'test');
    expect(lm.remove('p1')).toBe(true);
    expect(lm.get('p1')).toBeUndefined();
  });

  it('clear 清空所有', () => {
    lm.register('p1', 'a');
    lm.register('p2', 'b');
    lm.clear();
    expect(lm.list()).toHaveLength(0);
  });

  it('isTerminalState / isActiveState 判断', () => {
    expect(lm.isTerminalState('exited')).toBe(true);
    expect(lm.isTerminalState('crashed')).toBe(true);
    expect(lm.isTerminalState('running')).toBe(false);
    expect(lm.isActiveState('running')).toBe(true);
    expect(lm.isActiveState('exited')).toBe(false);
  });

  it('addListener 返回取消订阅函数', () => {
    const events: string[] = [];
    lm.register('p1', 'test');
    const off = lm.addListener((e) => events.push(e.type));
    lm.setState('p1', 'starting');
    off();
    lm.setState('p1', 'running');
    expect(events).toHaveLength(1);
    expect(events[0]).toBe('state-change');
  });
});

describe('deriveReasonFromExit', () => {
  it('signal -> signal', () => {
    expect(deriveReasonFromExit({ code: null, signal: 'SIGKILL' as NodeJS.Signals })).toBe('signal');
  });
  it('code 0 -> exit', () => {
    expect(deriveReasonFromExit({ code: 0, signal: null })).toBe('exit');
  });
  it('code null -> exit', () => {
    expect(deriveReasonFromExit({ code: null, signal: null })).toBe('exit');
  });
  it('非零 -> crash', () => {
    expect(deriveReasonFromExit({ code: 1, signal: null })).toBe('crash');
  });
});
