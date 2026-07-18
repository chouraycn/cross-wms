import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import {
  assertTransition,
  installPlugin,
  enablePlugin,
  disablePlugin,
  uninstallPlugin,
  updatePlugin,
  getLifecycleState,
  getLifecycleEvents,
  resetLifecycleStateForTests,
} from '../lifecycle.js';
import { pluginRuntimeRegistry } from '../registry.js';
import { resetPermissionStateForTests, grantPluginPermission } from '../permissions.js';
import { createNoopPluginContext } from '../../plugin-sdk/context.js';
import type { PluginManifest } from '../types.js';

function makeManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'p1',
    name: 'P1',
    version: '1.0.0',
    ...overrides,
  };
}

describe('plugins/lifecycle', () => {
  beforeEach(() => {
    resetLifecycleStateForTests();
    resetPermissionStateForTests();
    pluginRuntimeRegistry.clear();
  });

  describe('assertTransition', () => {
    it('合法迁移不抛错', () => {
      expect(() => assertTransition('installed', 'enabling')).not.toThrow();
    });

    it('非法迁移抛错', () => {
      expect(() => assertTransition('enabled', 'enabling')).toThrow(/非法状态迁移/);
    });

    it('uninstalled 不允许任何迁移', () => {
      expect(() => assertTransition('uninstalled', 'enabling')).toThrow();
    });
  });

  describe('installPlugin', () => {
    it('成功安装并触发 install 钩子', async () => {
      const ctx = createNoopPluginContext('p1');
      const install = vi.fn();
      await installPlugin('p1', {
        version: '1.0.0',
        lifecycle: { install },
        context: ctx,
      });
      expect(install).toHaveBeenCalledWith(ctx);
      expect(getLifecycleState('p1')).toBe('installed');
    });

    it('重复安装抛错', async () => {
      const ctx = createNoopPluginContext('p1');
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await expect(installPlugin('p1', { version: '1.0.0', context: ctx })).rejects.toThrow(
        /已安装/,
      );
    });

    it('install 钩子抛错时进入 error 状态', async () => {
      const ctx = createNoopPluginContext('p1');
      await expect(
        installPlugin('p1', {
          version: '1.0.0',
          lifecycle: {
            install: () => {
              throw new Error('install failed');
            },
          },
          context: ctx,
        }),
      ).rejects.toThrow();
      expect(getLifecycleState('p1')).toBe('error');
    });
  });

  describe('enable / disable', () => {
    it('enable 调用 lifecycle.enable 钩子', async () => {
      const ctx = createNoopPluginContext('p1');
      const enable = vi.fn();
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await enablePlugin('p1', {
        lifecycle: { enable },
        context: ctx,
      });
      expect(enable).toHaveBeenCalled();
      expect(getLifecycleState('p1')).toBe('enabled');
    });

    it('disable 调用 lifecycle.disable 钩子', async () => {
      const ctx = createNoopPluginContext('p1');
      const disable = vi.fn();
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await enablePlugin('p1', { context: ctx });
      await disablePlugin('p1', {
        lifecycle: { disable },
        context: ctx,
      });
      expect(disable).toHaveBeenCalled();
      expect(getLifecycleState('p1')).toBe('disabled');
    });

    it('enable 缺少权限时抛错', async () => {
      const ctx = createNoopPluginContext('p1');
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await expect(
        enablePlugin('p1', {
          context: ctx,
          permissions: ['shell'],
        }),
      ).rejects.toThrow(/权限/);
    });

    it('已授权权限不抛错', async () => {
      grantPluginPermission('p1', 'shell');
      const ctx = createNoopPluginContext('p1');
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await expect(
        enablePlugin('p1', {
          context: ctx,
          permissions: ['shell'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('uninstall', () => {
    it('成功卸载', async () => {
      const ctx = createNoopPluginContext('p1');
      const uninstall = vi.fn();
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await enablePlugin('p1', { context: ctx });
      await disablePlugin('p1', { context: ctx });
      await uninstallPlugin('p1', {
        lifecycle: { uninstall },
        context: ctx,
      });
      expect(uninstall).toHaveBeenCalled();
      expect(getLifecycleState('p1')).toBe('uninstalled');
    });
  });

  describe('update', () => {
    it('成功更新到新版本', async () => {
      const ctx = createNoopPluginContext('p1');
      const update = vi.fn();
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await enablePlugin('p1', { context: ctx });
      await updatePlugin('p1', {
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        manifest: makeManifest({ id: 'p1', version: '1.1.0' }),
        lifecycle: { update },
        context: ctx,
      });
      expect(update).toHaveBeenCalled();
      // 从 enabled 进入 updating，更新成功后回到 enabled
      expect(getLifecycleState('p1')).toBe('enabled');
    });
  });

  describe('getLifecycleEvents', () => {
    it('记录 enable / disable 事件', async () => {
      const ctx = createNoopPluginContext('p1');
      await installPlugin('p1', { version: '1.0.0', context: ctx });
      await enablePlugin('p1', { context: ctx });
      await disablePlugin('p1', { context: ctx });
      const events = getLifecycleEvents('p1');
      expect(events.some((e) => e.type === 'activate')).toBe(true);
      expect(events.some((e) => e.type === 'load')).toBe(true);
    });
  });
});
