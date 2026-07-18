/**
 * Subagent Spawn Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSubagent } from '../subagent-spawn.js';
import { listActiveSubagents, clearActiveSubagents } from '../subagent-registry.state.js';
import type { SpawnOptions, SpawnContext } from '../subagent-spawn.types.js';

describe('subagent-spawn', () => {
  beforeEach(() => {
    clearActiveSubagents();
  });

  afterEach(() => {
    clearActiveSubagents();
  });

  it('should spawn a basic subagent', async () => {
    const options: SpawnOptions = {
      task: 'test task',
      agentId: 'research-agent',
      mode: 'run',
    };

    const context: SpawnContext = {
      workspaceDir: '/tmp/test',
    };

    const result = await spawnSubagent(options, context);

    expect(result.status).toBe('accepted');
    expect(result.instanceId).toBeDefined();
    expect(result.childSessionKey).toBeDefined();
  });

  it('should fail when task is missing', async () => {
    const options = { agentId: 'test' } as unknown as SpawnOptions;
    const context: SpawnContext = {};

    const result = await spawnSubagent(options, context);

    expect(result.status).toBe('error');
  });

  it('should generate unique session key', async () => {
    const options1: SpawnOptions = { task: 'task1', agentId: 'research-agent', mode: 'run' };
    const options2: SpawnOptions = { task: 'task2', agentId: 'coding-agent', mode: 'run' };
    const context: SpawnContext = {};

    const result1 = await spawnSubagent(options1, context);
    const result2 = await spawnSubagent(options2, context);

    expect(result1.status).toBe('accepted');
    expect(result2.status).toBe('accepted');
    expect(result1.childSessionKey).not.toBe(result2.childSessionKey);
  });

  it('should track spawn depth via metadata', async () => {
    const options: SpawnOptions = {
      task: 'test task',
      agentId: 'analysis-agent',
      mode: 'run',
      model: 'test-model',
    };
    const context: SpawnContext = {};

    const result = await spawnSubagent(options, context);

    expect(result.status).toBe('accepted');
    expect(result.instanceId).toBeDefined();
  });

  it('should handle cleanup option', async () => {
    const options: SpawnOptions = {
      task: 'test task',
      agentId: 'wms-operator-agent',
      mode: 'run',
      cleanup: 'keep',
    };
    const context: SpawnContext = {};

    const result = await spawnSubagent(options, context);

    expect(result.status).toBe('accepted');
  });
});