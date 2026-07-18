import { describe, it, expect } from 'vitest';
import { ProcessErrorHandler, isFatalError } from '../error-handler.js';
import type { ProcessConfig } from '../types.js';

function makeConfig(): ProcessConfig {
  return { name: 'test', command: '/bin/true' };
}

describe('ProcessErrorHandler', () => {
  const handler = new ProcessErrorHandler();

  it('ENOENT 错误分类为 spawn-error 且不可恢复', () => {
    const err = new Error('spawn ENOENT');
    const c = handler.classify({ error: err, config: makeConfig() });
    expect(c.category).toBe('spawn-error');
    expect(c.recoverable).toBe(false);
    expect(c.suggestedReason).toBe('spawn-error');
  });

  it('EACCES 错误分类为 spawn-error', () => {
    const err = new Error('spawn EACCES');
    const c = handler.classify({ error: err, config: makeConfig() });
    expect(c.category).toBe('spawn-error');
  });

  it('包含 timed out 的错误分类为 timeout', () => {
    const err = new Error('operation timed out');
    const c = handler.classify({ error: err, config: makeConfig() });
    expect(c.category).toBe('timeout');
    expect(c.suggestedReason).toBe('overall-timeout');
    expect(c.recoverable).toBe(true);
  });

  it('durationMs 超过 timeoutMs 分类为 timeout', () => {
    const c = handler.classify({
      error: new Error('something'),
      exitCode: null,
      timeoutMs: 100,
      durationMs: 200,
      config: makeConfig(),
    });
    expect(c.category).toBe('timeout');
  });

  it('signal 终止分类为 signal', () => {
    const c = handler.classify({
      exitCode: null,
      signal: 'SIGKILL',
      config: makeConfig(),
    });
    expect(c.category).toBe('signal');
    expect(c.suggestedReason).toBe('signal');
  });

  it('非零退出码分类为 exit-nonzero', () => {
    const c = handler.classify({
      exitCode: 42,
      config: makeConfig(),
    });
    expect(c.category).toBe('exit-nonzero');
    expect(c.suggestedReason).toBe('crash');
    expect(c.recoverable).toBe(true);
  });

  it('退出码 124 分类为 timeout', () => {
    const c = handler.classify({
      exitCode: 124,
      config: makeConfig(),
    });
    expect(c.category).toBe('timeout');
  });

  it('退出码 128+signal 分类为 signal 退出', () => {
    const c = handler.classify({
      exitCode: 137, // 128+9 (SIGKILL)
      config: makeConfig(),
    });
    expect(c.category).toBe('signal');
  });

  it('正常退出分类为 unknown 且不可恢复', () => {
    const c = handler.classify({
      exitCode: 0,
      config: makeConfig(),
    });
    expect(c.category).toBe('unknown');
    expect(c.suggestedReason).toBe('exit');
    expect(c.recoverable).toBe(false);
  });

  it('handle 返回 logged=true', () => {
    const c = handler.classify({ error: new Error('boom'), config: makeConfig() });
    const result = handler.handle(c, makeConfig(), 'p1');
    expect(result.logged).toBe(true);
  });

  it('isFatalError 判断不可恢复', () => {
    const fatal = handler.classify({ error: new Error('spawn ENOENT'), config: makeConfig() });
    const recoverable = handler.classify({ exitCode: 1, config: makeConfig() });
    expect(isFatalError(fatal)).toBe(true);
    expect(isFatalError(recoverable)).toBe(false);
  });

  it('IPC 相关错误分类为 ipc-error', () => {
    const err = new Error('ipc channel closed');
    const c = handler.classify({ error: err, config: makeConfig() });
    expect(c.category).toBe('ipc-error');
  });
});
