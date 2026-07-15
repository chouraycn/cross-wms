// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRegistry, RuntimeInstance } from '../agentRegistry.js';

describe('AgentRegistry - subagent lifecycle', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
    registry.stopOrphanRecovery();
  });

  afterEach(() => {
    registry.stopOrphanRecovery();
  });

  function createInstance(partial: Partial<RuntimeInstance> & Pick<RuntimeInstance, 'instanceId' | 'agentId'>): RuntimeInstance {
    return {
      agentRole: 'researcher',
      taskDescription: 'test task',
      status: 'running',
      startedAt: Date.now(),
      deliveryStatus: 'pending',
      ...partial,
    } as RuntimeInstance;
  }

  it('should register and retrieve runtime instance', () => {
    const instance = createInstance({ instanceId: 'inst-1', agentId: 'agent-1' });
    registry.registerInstance(instance);

    const found = registry.getInstance('inst-1');
    expect(found).toBeTruthy();
    expect(found?.instanceId).toBe('inst-1');
    expect(found?.deliveryStatus).toBe('pending');
  });

  it('should list child instances by parent instance id', () => {
    registry.registerInstance(createInstance({ instanceId: 'parent', agentId: 'agent-1' }));
    registry.registerInstance(createInstance({ instanceId: 'child-1', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.registerInstance(createInstance({ instanceId: 'child-2', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.registerInstance(createInstance({ instanceId: 'other', agentId: 'agent-3' }));

    const children = registry.listInstances({ parentInstanceId: 'parent' });
    expect(children.length).toBe(2);
    expect(children.map(c => c.instanceId).sort()).toEqual(['child-1', 'child-2']);
  });

  it('should reconcile child instances', () => {
    registry.registerInstance(createInstance({ instanceId: 'parent', agentId: 'agent-1' }));
    registry.registerInstance(createInstance({ instanceId: 'child-running', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.updateInstance('child-running', { status: 'running' });
    registry.registerInstance(createInstance({ instanceId: 'child-completed', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.updateInstance('child-completed', { status: 'completed' });
    registry.registerInstance(createInstance({ instanceId: 'child-failed', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.updateInstance('child-failed', { status: 'failed' });
    registry.registerInstance(createInstance({ instanceId: 'child-orphan', agentId: 'agent-2', parentInstanceId: 'parent' }));
    registry.updateInstance('child-orphan', { status: 'cancelled', isOrphan: true });

    const result = registry.reconcileChildInstances('parent');
    expect(result.running).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.orphaned).toBe(1);
  });

  it('should recover orphan instances when parent is missing', () => {
    registry.registerInstance(createInstance({ instanceId: 'orphan', agentId: 'agent-2', parentInstanceId: 'missing-parent' }));

    const count = registry.recoverOrphanInstances();
    expect(count).toBe(1);

    const instance = registry.getInstance('orphan');
    expect(instance?.status).toBe('cancelled');
    expect(instance?.isOrphan).toBe(true);
    expect(instance?.error).toContain('父代理');
  });

  it('should recover orphan instances when parent is completed', () => {
    registry.registerInstance(createInstance({ instanceId: 'parent', agentId: 'agent-1', status: 'completed' }));
    registry.registerInstance(createInstance({ instanceId: 'orphan', agentId: 'agent-2', parentInstanceId: 'parent' }));

    const count = registry.recoverOrphanInstances();
    expect(count).toBe(1);

    const instance = registry.getInstance('orphan');
    expect(instance?.status).toBe('cancelled');
    expect(instance?.isOrphan).toBe(true);
  });

  it('should not recover non-orphan instances', () => {
    registry.registerInstance(createInstance({ instanceId: 'parent', agentId: 'agent-1', status: 'running' }));
    registry.registerInstance(createInstance({ instanceId: 'child', agentId: 'agent-2', parentInstanceId: 'parent' }));

    const count = registry.recoverOrphanInstances();
    expect(count).toBe(0);

    const child = registry.getInstance('child');
    expect(child?.status).toBe('running');
    expect(child?.isOrphan).toBeFalsy();
  });

  it('should cancel running instance', () => {
    registry.registerInstance(createInstance({ instanceId: 'inst', agentId: 'agent-1' }));

    const success = registry.cancelInstance('inst');
    expect(success).toBe(true);

    const instance = registry.getInstance('inst');
    expect(instance?.status).toBe('cancelled');
    expect(instance?.completedAt).toBeGreaterThan(0);
  });

  it('should not cancel already terminated instance', () => {
    registry.registerInstance(createInstance({ instanceId: 'inst', agentId: 'agent-1', status: 'completed' }));

    const success = registry.cancelInstance('inst');
    expect(success).toBe(false);
  });

  it('should report instance stats', () => {
    registry.registerInstance(createInstance({ instanceId: 'running', agentId: 'agent-1', status: 'running' }));
    registry.registerInstance(createInstance({ instanceId: 'completed', agentId: 'agent-1', status: 'completed' }));
    registry.registerInstance(createInstance({ instanceId: 'failed', agentId: 'agent-1', status: 'failed' }));
    registry.registerInstance(createInstance({ instanceId: 'orphan', agentId: 'agent-2', parentInstanceId: 'missing', status: 'running' }));
    registry.recoverOrphanInstances();

    const stats = registry.getInstanceStats();
    expect(stats.total).toBe(4);
    expect(stats.running).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.orphaned).toBe(1);
  });
});
