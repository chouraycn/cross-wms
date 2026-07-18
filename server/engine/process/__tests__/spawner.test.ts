import { describe, it, expect } from 'vitest';
import {
  parseSpawnArgs,
  resolveMaxCapturedChars,
  appendCapturedOutput,
} from '../spawner.js';
import type { ProcessConfig } from '../types.js';

describe('parseSpawnArgs', () => {
  it('空 command 抛错', () => {
    expect(() => parseSpawnArgs({ name: 'x', command: '' } as ProcessConfig)).toThrow();
  });

  it('解析基础参数', () => {
    const args = parseSpawnArgs({
      name: 'x',
      command: '/bin/echo',
      args: ['hello'],
      cwd: '/tmp',
    });
    expect(args.command).toBe('/bin/echo');
    expect(args.args).toEqual(['hello']);
    expect(args.cwd).toBe('/tmp');
    expect(args.stdio).toEqual(['inherit', 'pipe', 'pipe']);
  });

  it('input 配置启用 pipe stdin', () => {
    const args = parseSpawnArgs({
      name: 'x',
      command: 'cat',
      input: 'data',
    });
    expect(args.stdio[0]).toBe('pipe');
  });

  it('ipc 配置追加 ipc 到 stdio', () => {
    const args = parseSpawnArgs({
      name: 'x',
      command: 'node',
      ipc: true,
    });
    expect(args.stdio).toContain('ipc');
    expect(args.stdio.length).toBe(4);
  });

  it('env 合并 process.env', () => {
    const args = parseSpawnArgs({
      name: 'x',
      command: 'node',
      env: { MY_VAR: '1' },
    });
    expect(args.env.MY_VAR).toBe('1');
  });
});

describe('resolveMaxCapturedChars', () => {
  it('默认值', () => {
    expect(resolveMaxCapturedChars()).toBe(1024 * 1024);
  });

  it('负数返回默认', () => {
    expect(resolveMaxCapturedChars(-1)).toBe(1024 * 1024);
  });

  it('小于 256 截断到 256', () => {
    expect(resolveMaxCapturedChars(100)).toBe(256);
  });

  it('正常值返回 floor', () => {
    expect(resolveMaxCapturedChars(500.7)).toBe(500);
  });
});

describe('appendCapturedOutput', () => {
  it('未超限时直接拼接', () => {
    const next = appendCapturedOutput('hello', ' world', 'stdout', 100);
    expect(next).toBe('hello world');
  });

  it('超限时截断尾部并加 marker', () => {
    const large = 'x'.repeat(200);
    const next = appendCapturedOutput('', large, 'stdout', 100);
    expect(next.length).toBeLessThanOrEqual(100);
    expect(next).toContain('captured stdout truncated');
    expect(next.endsWith('xxx')).toBe(true);
  });

  it('已接近上限时仍能追加', () => {
    const next = appendCapturedOutput('x'.repeat(95), 'abcde', 'stderr', 100);
    expect(next.length).toBeLessThanOrEqual(100);
  });
});
