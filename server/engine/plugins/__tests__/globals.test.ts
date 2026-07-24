import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logVerbose } from '../_stub_parent__globals.js';

const VERBOSE_ENV_KEYS = ['CROSS_WMS_VERBOSE', 'OPENCLAW_VERBOSE', 'VERBOSE'] as const;

describe('plugins/_stub_parent__globals', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const key of VERBOSE_ENV_KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    logSpy.mockRestore();
    for (const key of VERBOSE_ENV_KEYS) {
      delete process.env[key];
    }
  });

  describe('logVerbose', () => {
    it('默认不输出（无 env 标志）', () => {
      logVerbose('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('CROSS_WMS_VERBOSE=1 时输出消息', () => {
      process.env.CROSS_WMS_VERBOSE = '1';
      logVerbose('hello');
      expect(logSpy).toHaveBeenCalledWith('hello');
    });

    it('OPENCLAW_VERBOSE=true 时输出消息', () => {
      process.env.OPENCLAW_VERBOSE = 'true';
      logVerbose('openclaw-verbose');
      expect(logSpy).toHaveBeenCalledWith('openclaw-verbose');
    });

    it('VERBOSE=yes 时输出消息', () => {
      process.env.VERBOSE = 'yes';
      logVerbose('verbose-yes');
      expect(logSpy).toHaveBeenCalledWith('verbose-yes');
    });

    it('CROSS_WMS_VERBOSE=0 时不输出', () => {
      process.env.CROSS_WMS_VERBOSE = '0';
      logVerbose('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('VERBOSE=false 时不输出', () => {
      process.env.VERBOSE = 'false';
      logVerbose('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('VERBOSE=no 时不输出', () => {
      process.env.VERBOSE = 'no';
      logVerbose('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('任意一个标志开启即输出（优先级测试）', () => {
      process.env.OPENCLAW_VERBOSE = '0';
      process.env.VERBOSE = 'yes';
      logVerbose('either');
      expect(logSpy).toHaveBeenCalledWith('either');
    });

    it('多个标志同时开启时只输出一次', () => {
      process.env.CROSS_WMS_VERBOSE = '1';
      process.env.OPENCLAW_VERBOSE = 'true';
      process.env.VERBOSE = 'yes';
      logVerbose('once');
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith('once');
    });

    it('任意非约定的字符串值不触发输出（如 random）', () => {
      process.env.VERBOSE = 'random';
      logVerbose('hello');
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('空字符串消息仍然输出（当 verbose 开启时）', () => {
      process.env.CROSS_WMS_VERBOSE = '1';
      logVerbose('');
      expect(logSpy).toHaveBeenCalledWith('');
    });

    it('多次调用每次都输出', () => {
      process.env.CROSS_WMS_VERBOSE = '1';
      logVerbose('a');
      logVerbose('b');
      logVerbose('c');
      expect(logSpy).toHaveBeenCalledTimes(3);
      expect(logSpy).toHaveBeenNthCalledWith(1, 'a');
      expect(logSpy).toHaveBeenNthCalledWith(2, 'b');
      expect(logSpy).toHaveBeenNthCalledWith(3, 'c');
    });
  });
});
