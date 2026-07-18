/**
 * Subagent Lifecycle Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  addActiveSubagent,
  getActiveSubagent,
  updateSubagentStatus,
  removeActiveSubagent,
  clearActiveSubagents,
  listActiveSubagents,
} from '../subagent-registry.state.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { isTerminalStatus, isActiveStatus } from '../subagent-registry.helpers.js';

describe('subagent-lifecycle', () => {
  beforeEach(() => {
    clearActiveSubagents();
  });

  afterEach(() => {
    clearActiveSubagents();
  });

  it('should add an active subagent', () => {
    const instance: SubagentInstance = {
      id: 'test-instance',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'spawning',
      spawnedAt: Date.now(),
    };

    const result = addActiveSubagent(instance);

    expect(result).toBe(true);

    const retrieved = getActiveSubagent('test-instance');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('test-instance');
  });

  it('should update subagent status from spawning to running', () => {
    const instance: SubagentInstance = {
      id: 'status-test',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'spawning',
      spawnedAt: Date.now(),
    };

    addActiveSubagent(instance);
    const result = updateSubagentStatus('status-test', 'running');

    expect(result).toBe(true);

    const updated = getActiveSubagent('status-test');
    expect(updated?.status).toBe('running');
  });

  it('should update subagent status from running to completed', () => {
    const instance: SubagentInstance = {
      id: 'complete-test',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    };

    addActiveSubagent(instance);
    const result = updateSubagentStatus('complete-test', 'completed', {
      result: { success: true },
      completedAt: Date.now(),
    });

    expect(result).toBe(true);

    const updated = getActiveSubagent('complete-test');
    expect(updated?.status).toBe('completed');
    expect(updated?.result).toEqual({ success: true });
  });

  it('should mark instance as failed', () => {
    const instance: SubagentInstance = {
      id: 'fail-test',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    };

    addActiveSubagent(instance);
    const result = updateSubagentStatus('fail-test', 'failed', {
      error: 'Test failure',
      completedAt: Date.now(),
    });

    expect(result).toBe(true);

    const updated = getActiveSubagent('fail-test');
    expect(updated?.status).toBe('failed');
    expect(updated?.error).toBe('Test failure');
  });

  it('should cancel an instance', () => {
    const instance: SubagentInstance = {
      id: 'cancel-test',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    };

    addActiveSubagent(instance);
    const result = updateSubagentStatus('cancel-test', 'cancelled', {
      error: 'User cancelled',
      completedAt: Date.now(),
    });

    expect(result).toBe(true);

    const updated = getActiveSubagent('cancel-test');
    expect(updated?.status).toBe('cancelled');
  });

  it('should remove an active subagent', () => {
    const instance: SubagentInstance = {
      id: 'remove-test',
      definitionId: 'test-def',
      sessionKey: 'test-session',
      status: 'completed',
      spawnedAt: Date.now(),
      completedAt: Date.now(),
    };

    addActiveSubagent(instance);
    const result = removeActiveSubagent('remove-test');

    expect(result).toBe(true);
    expect(getActiveSubagent('remove-test')).toBeUndefined();
  });

  it('should list active subagents', () => {
    addActiveSubagent({
      id: 'inst1',
      definitionId: 'test-def',
      sessionKey: 'sess1',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    });
    addActiveSubagent({
      id: 'inst2',
      definitionId: 'test-def',
      sessionKey: 'sess2',
      status: 'paused',
      spawnedAt: Date.now(),
    });

    const list = listActiveSubagents();

    expect(list.length).toBe(2);
    expect(list.some((i) => i.id === 'inst1')).toBe(true);
    expect(list.some((i) => i.id === 'inst2')).toBe(true);
  });

  it('should filter subagents by status', () => {
    addActiveSubagent({
      id: 'running1',
      definitionId: 'test-def',
      sessionKey: 'sess1',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    });
    addActiveSubagent({
      id: 'paused1',
      definitionId: 'test-def',
      sessionKey: 'sess2',
      status: 'paused',
      spawnedAt: Date.now(),
    });
    addActiveSubagent({
      id: 'running2',
      definitionId: 'test-def',
      sessionKey: 'sess3',
      status: 'running',
      spawnedAt: Date.now(),
      startedAt: Date.now(),
    });

    const runningList = listActiveSubagents({ status: 'running' });

    expect(runningList.length).toBe(2);
    expect(runningList.every((i) => i.status === 'running')).toBe(true);
  });

  it('should identify terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('paused')).toBe(false);
    expect(isTerminalStatus('spawning')).toBe(false);
  });

  it('should identify active statuses', () => {
    expect(isActiveStatus('spawning')).toBe(true);
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('paused')).toBe(true);
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('failed')).toBe(false);
    expect(isActiveStatus('cancelled')).toBe(false);
  });
});