/**
 * VersionManager 单元测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VersionManager, versionManager } from '../version-manager.js';

describe('VersionManager', () => {
  let manager: VersionManager;

  beforeEach(() => {
    manager = new VersionManager();
  });

  it('should parse semantic version', () => {
    const version = manager.parse('1.2.3');
    expect(version.major).toBe(1);
    expect(version.minor).toBe(2);
    expect(version.patch).toBe(3);
  });

  it('should parse version with v prefix', () => {
    const version = manager.parse('v2.0.0');
    expect(version.major).toBe(2);
    expect(version.minor).toBe(0);
    expect(version.patch).toBe(0);
  });

  it('should compare versions correctly', () => {
    expect(manager.compare('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(manager.compare('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(manager.compare('1.2.3', '1.2.3')).toBe(0);
  });

  it('should detect compatibility level', () => {
    expect(manager.getCompatibilityLevel('1.0.0', '2.0.0')).toBe('major');
    expect(manager.getCompatibilityLevel('1.0.0', '1.1.0')).toBe('minor');
    expect(manager.getCompatibilityLevel('1.0.0', '1.0.1')).toBe('patch');
  });

  it('should detect breaking changes', () => {
    expect(manager.isBreakingChange('1.0.0', '2.0.0')).toBe(true);
    expect(manager.isBreakingChange('1.0.0', '1.1.0')).toBe(false);
  });

  it('should track version history', () => {
    manager.recordVersion('skill-1', '1.0.0');
    manager.recordVersion('skill-1', '1.1.0');
    manager.recordVersion('skill-1', '2.0.0');

    const history = manager.getVersionHistory('skill-1');
    expect(history).toHaveLength(3);
    expect(history[0].version).toBe('1.0.0');
    expect(history[history.length - 1].version).toBe('2.0.0');
  });

  it('should get latest version', () => {
    manager.recordVersion('skill-1', '1.0.0');
    manager.recordVersion('skill-1', '1.2.0');

    const latest = manager.getLatestVersion('skill-1');
    expect(latest?.version).toBe('1.2.0');
  });

  it('should compute next version', () => {
    expect(manager.getNextVersion('1.2.3', 'major')).toBe('2.0.0');
    expect(manager.getNextVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(manager.getNextVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('singleton versionManager should be available', () => {
    expect(versionManager).toBeInstanceOf(VersionManager);
  });
});
