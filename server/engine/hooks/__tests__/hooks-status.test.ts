import { describe, it, expect } from 'vitest';
import {
  buildHookStatusReport,
  filterLoadableHooks,
  filterHooksBySource,
  getHookStatusByName,
  getHookStatusByKey,
  summarizeHookStatus,
} from '../hooks-status.js';
import type { HookEntry, HookConfig } from '../types.js';

function createMockHookEntry(overrides: Partial<HookEntry> = {}): HookEntry {
  return {
    hook: {
      name: 'test-hook',
      description: 'A test hook',
      source: 'bundled',
      filePath: '/hooks/test/HOOK.md',
      baseDir: '/hooks/test',
      handlerPath: '/hooks/test/handler.ts',
    },
    frontmatter: {},
    metadata: {
      events: ['command:new'],
      hookKey: 'test-hook',
    },
    ...overrides,
  };
}

describe('hooks-status', () => {
  describe('buildHookStatusReport', () => {
    it('should build status report with basic entries', () => {
      const entry = createMockHookEntry();
      const report = buildHookStatusReport('/workspace', '/managed', {
        entries: [entry],
      });

      expect(report.workspaceDir).toBe('/workspace');
      expect(report.managedHooksDir).toBe('/managed');
      expect(report.hooks).toHaveLength(1);
      expect(report.hooks[0].name).toBe('test-hook');
      expect(report.hooks[0].hookKey).toBe('test-hook');
    });

    it('should mark bundled hooks as enabled by default', () => {
      const entry = createMockHookEntry();
      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      expect(report.hooks[0].enabledByConfig).toBe(true);
      expect(report.hooks[0].loadable).toBe(true);
    });

    it('should respect custom isEnabled function', () => {
      const entry = createMockHookEntry();
      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        isEnabled: () => ({ enabled: false, reason: 'disabled by config' }),
      });

      expect(report.hooks[0].enabledByConfig).toBe(false);
      expect(report.hooks[0].loadable).toBe(false);
      expect(report.hooks[0].blockedReason).toBe('disabled by config');
    });

    it('should evaluate bin requirements', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { bins: ['node', 'git'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        hasBin: (bin) => bin === 'node',
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(false);
      expect(report.hooks[0].missing.bins).toContain('git');
      expect(report.hooks[0].loadable).toBe(false);
    });

    it('should evaluate anyBins requirements', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { anyBins: ['docker', 'podman'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        hasBin: (bin) => bin === 'docker',
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(true);
    });

    it('should fail anyBins when none present', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { anyBins: ['docker', 'podman'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        hasBin: () => false,
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(false);
      expect(report.hooks[0].missing.anyBins).toEqual(['docker', 'podman']);
    });

    it('should evaluate env requirements', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { env: ['API_KEY'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(false);
      expect(report.hooks[0].missing.env).toContain('API_KEY');
    });

    it('should evaluate config requirements', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { config: ['mail.enabled', 'mail.account'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        config: {
          mail: {
            enabled: true,
            account: 'test@example.com',
          },
        },
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(true);
      expect(report.hooks[0].configChecks).toHaveLength(2);
      expect(report.hooks[0].configChecks[0].satisfied).toBe(true);
    });

    it('should handle missing config paths', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          requires: { config: ['mail.enabled'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        config: {},
      });

      expect(report.hooks[0].requirementsSatisfied).toBe(false);
      expect(report.hooks[0].missing.config).toContain('mail.enabled');
    });

    it('should normalize install options', () => {
      const entry = createMockHookEntry({
        metadata: {
          events: ['command:new'],
          install: [
            { kind: 'bundled' },
            { kind: 'npm', package: 'test-pkg' },
            { kind: 'git', repository: 'https://example.com/repo.git' },
          ],
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      expect(report.hooks[0].install).toHaveLength(3);
      expect(report.hooks[0].install[0].kind).toBe('bundled');
      expect(report.hooks[0].install[1].label).toContain('test-pkg');
    });

    it('should set managedByPlugin for plugin source', () => {
      const entry = createMockHookEntry({
        hook: {
          name: 'plugin-hook',
          description: 'Plugin hook',
          source: 'plugin',
          pluginId: 'test-plugin',
          filePath: '/plugins/test/hook.md',
          baseDir: '/plugins/test',
          handlerPath: '/plugins/test/handler.ts',
        },
        metadata: { events: ['command:new'] },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
        isEnabled: () => ({ enabled: true }),
      });

      expect(report.hooks[0].managedByPlugin).toBe(true);
      expect(report.hooks[0].pluginId).toBe('test-plugin');
    });

    it('should use hook.name as default hookKey', () => {
      const entry = createMockHookEntry({
        metadata: { events: ['command:new'] },
      });
      delete entry.metadata?.hookKey;

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      expect(report.hooks[0].hookKey).toBe('test-hook');
    });
  });

  describe('filterLoadableHooks', () => {
    it('should filter only loadable hooks', () => {
      const entry1 = createMockHookEntry();
      const entry2 = createMockHookEntry({
        hook: {
          name: 'disabled-hook',
          description: 'Disabled',
          source: 'workspace',
          filePath: '/hooks/disabled/HOOK.md',
          baseDir: '/hooks/disabled',
          handlerPath: '/hooks/disabled/handler.ts',
        },
        metadata: { events: ['command:new'] },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry1, entry2],
      });

      const loadable = filterLoadableHooks(report);
      expect(loadable.length).toBeLessThan(report.hooks.length);
    });
  });

  describe('filterHooksBySource', () => {
    it('should filter hooks by source', () => {
      const entry1 = createMockHookEntry();
      const entry2 = createMockHookEntry({
        hook: {
          name: 'plugin-hook',
          description: 'Plugin',
          source: 'plugin',
          filePath: '/plugins/test/HOOK.md',
          baseDir: '/plugins/test',
          handlerPath: '/plugins/test/handler.ts',
        },
        metadata: { events: ['command:new'] },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry1, entry2],
        isEnabled: () => ({ enabled: true }),
      });

      const bundled = filterHooksBySource(report, 'bundled');
      expect(bundled).toHaveLength(1);
      expect(bundled[0].name).toBe('test-hook');
    });
  });

  describe('getHookStatusByName', () => {
    it('should find hook by name', () => {
      const entry = createMockHookEntry();
      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      const found = getHookStatusByName(report, 'test-hook');
      expect(found).toBeDefined();
      expect(found?.name).toBe('test-hook');
    });

    it('should return undefined for unknown name', () => {
      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [],
      });

      expect(getHookStatusByName(report, 'nonexistent')).toBeUndefined();
    });
  });

  describe('getHookStatusByKey', () => {
    it('should find hook by key', () => {
      const entry = createMockHookEntry();
      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry],
      });

      const found = getHookStatusByKey(report, 'test-hook');
      expect(found).toBeDefined();
    });
  });

  describe('summarizeHookStatus', () => {
    it('should summarize hook status correctly', () => {
      const entry1 = createMockHookEntry();
      const entry2 = createMockHookEntry({
        hook: {
          name: 'workspace-hook',
          description: 'Workspace hook',
          source: 'workspace',
          filePath: '/hooks/ws/HOOK.md',
          baseDir: '/hooks/ws',
          handlerPath: '/hooks/ws/handler.ts',
        },
        metadata: {
          events: ['command:new'],
          requires: { bins: ['nonexistent-bin'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry1, entry2],
      });

      const summary = summarizeHookStatus(report);
      expect(summary.total).toBe(2);
      expect(summary.loadable).toBeGreaterThanOrEqual(1);
      expect(summary.bySource['bundled']).toBe(1);
      expect(summary.bySource['workspace']).toBe(1);
    });

    it('should count disabled and missing requirements', () => {
      const entry1 = createMockHookEntry({
        hook: {
          name: 'disabled-hook',
          description: 'Disabled',
          source: 'workspace',
          filePath: '/hooks/disabled/HOOK.md',
          baseDir: '/hooks/disabled',
          handlerPath: '/hooks/disabled/handler.ts',
        },
        metadata: { events: ['command:new'] },
      });
      const entry2 = createMockHookEntry({
        hook: {
          name: 'missing-req-hook',
          description: 'Missing reqs',
          source: 'bundled',
          filePath: '/hooks/missing/HOOK.md',
          baseDir: '/hooks/missing',
          handlerPath: '/hooks/missing/handler.ts',
        },
        metadata: {
          events: ['command:new'],
          requires: { env: ['MISSING_VAR'] },
        },
      });

      const report = buildHookStatusReport('/ws', '/managed', {
        entries: [entry1, entry2],
      });

      const summary = summarizeHookStatus(report);
      expect(summary.disabled + summary.missingRequirements).toBeGreaterThanOrEqual(1);
    });
  });
});
