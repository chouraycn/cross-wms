/**
 * Unit tests for src/stores/chainStore.ts
 *
 * Tests the ChainStore class: CRUD, duplicate, subscribe/notify.
 * Uses vi.mock to replace the API layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Setup =====================

vi.mock('../services/api', () => ({
  fetchSkillChains: vi.fn(),
  createSkillChain: vi.fn(),
  updateSkillChain: vi.fn(),
  deleteSkillChain: vi.fn(),
  duplicateSkillChain: vi.fn(),
}));

import * as api from '../services/api';
import { chainStore } from '../stores/chainStore';
import type { SkillChain } from '../types/skill';

// ===================== Test Fixtures =====================

const mockChain: SkillChain = {
  id: 'chain-1',
  name: 'Test Chain',
  description: 'A test chain',
  nodes: [
    {
      id: 'node-1',
      skillId: 'builtin-dashboard',
      skillName: '仪表盘总览',
      skillIcon: 'Dashboard',
      dataPassMode: 'full',
      timeout: 30000,
      retryCount: 1,
      order: 1,
    },
  ],
  failStrategy: 'stop',
  createdAt: '2024-06-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
};

const mockChain2: SkillChain = {
  id: 'chain-2',
  name: 'Second Chain',
  description: 'Another chain',
  nodes: [],
  failStrategy: 'skip',
  createdAt: '2024-06-02T00:00:00Z',
  updatedAt: '2024-06-02T00:00:00Z',
};

// ===================== beforeEach =====================

beforeEach(async () => {
  vi.clearAllMocks();

  // Default: load two chains
  vi.mocked(api.fetchSkillChains).mockResolvedValue([mockChain, mockChain2]);

  // Re-initialize chainStore state
  await chainStore.loadChains();
});

// ===================== getChains() =====================

describe('chainStore.getChains', () => {
  it('should return loaded chains', () => {
    const chains = chainStore.getChains();
    expect(chains).toHaveLength(2);
    expect(chains[0].id).toBe('chain-1');
    expect(chains[1].id).toBe('chain-2');
  });

  it('should return empty array when no chains loaded', async () => {
    vi.mocked(api.fetchSkillChains).mockResolvedValue([]);
    await chainStore.loadChains();

    expect(chainStore.getChains()).toEqual([]);
  });
});

// ===================== getChain() =====================

describe('chainStore.getChain', () => {
  it('should find a chain by id', () => {
    const chain = chainStore.getChain('chain-1');
    expect(chain).toBeDefined();
    expect(chain!.name).toBe('Test Chain');
  });

  it('should return undefined for non-existent chain', () => {
    const chain = chainStore.getChain('non-existent');
    expect(chain).toBeUndefined();
  });
});

// ===================== loadChains() =====================

describe('chainStore.loadChains', () => {
  it('should fetch chains from API and notify listeners', async () => {
    const listener = vi.fn();
    const unsub = chainStore.subscribe(listener);
    listener.mockClear();

    vi.mocked(api.fetchSkillChains).mockClear();
    vi.mocked(api.fetchSkillChains).mockResolvedValue([mockChain]);
    await chainStore.loadChains();

    expect(api.fetchSkillChains).toHaveBeenCalledTimes(1);
    expect(chainStore.getChains()).toHaveLength(1);
    expect(listener).toHaveBeenCalled();

    unsub();
  });

  it('should handle API error gracefully', async () => {
    vi.mocked(api.fetchSkillChains).mockRejectedValue(new Error('Network error'));

    // Should not throw
    await expect(chainStore.loadChains()).resolves.toBeUndefined();
  });
});

// ===================== createChain() =====================

describe('chainStore.createChain', () => {
  it('should create a chain and add it to the list', async () => {
    const newChain: SkillChain = {
      id: 'chain-new',
      name: 'New Chain',
      description: 'Created by test',
      nodes: [],
      failStrategy: 'stop',
      createdAt: '2024-06-03T00:00:00Z',
      updatedAt: '2024-06-03T00:00:00Z',
    };
    vi.mocked(api.createSkillChain).mockResolvedValue(newChain);

    const result = await chainStore.createChain({
      name: 'New Chain',
      description: 'Created by test',
      nodes: [],
      failStrategy: 'stop',
    });

    expect(api.createSkillChain).toHaveBeenCalledTimes(1);
    expect(result).toEqual(newChain);
    expect(chainStore.getChain('chain-new')).toBeDefined();
  });

  it('should notify listeners after creating a chain', async () => {
    const listener = vi.fn();
    const unsub = chainStore.subscribe(listener);
    listener.mockClear();

    vi.mocked(api.createSkillChain).mockResolvedValue({
      id: 'chain-3',
      name: 'Chain 3',
      description: '',
      nodes: [],
      failStrategy: 'stop',
      createdAt: '',
      updatedAt: '',
    });

    await chainStore.createChain({
      name: 'Chain 3',
      description: '',
      nodes: [],
      failStrategy: 'stop',
    });

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ===================== updateChain() =====================

describe('chainStore.updateChain', () => {
  it('should update an existing chain', async () => {
    const updatedChain: SkillChain = { ...mockChain, name: 'Updated Chain' };
    vi.mocked(api.updateSkillChain).mockResolvedValue(updatedChain);

    await chainStore.updateChain('chain-1', { name: 'Updated Chain' });

    expect(api.updateSkillChain).toHaveBeenCalledWith('chain-1', { name: 'Updated Chain' });
    const chain = chainStore.getChain('chain-1');
    expect(chain!.name).toBe('Updated Chain');
  });

  it('should still notify even if chain id not found locally', async () => {
    const listener = vi.fn();
    const unsub = chainStore.subscribe(listener);
    listener.mockClear();

    const updatedChain: SkillChain = {
      id: 'ghost-chain',
      name: 'Ghost',
      description: '',
      nodes: [],
      failStrategy: 'stop',
      createdAt: '',
      updatedAt: '',
    };
    vi.mocked(api.updateSkillChain).mockResolvedValue(updatedChain);

    await chainStore.updateChain('ghost-chain', { name: 'Ghost' });

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ===================== deleteChain() =====================

describe('chainStore.deleteChain', () => {
  it('should remove a chain from the list', async () => {
    vi.mocked(api.deleteSkillChain).mockResolvedValue(undefined);

    await chainStore.deleteChain('chain-1');

    expect(api.deleteSkillChain).toHaveBeenCalledWith('chain-1');
    expect(chainStore.getChain('chain-1')).toBeUndefined();
    expect(chainStore.getChains()).toHaveLength(1);
  });

  it('should notify listeners after deleting', async () => {
    const listener = vi.fn();
    const unsub = chainStore.subscribe(listener);
    listener.mockClear();

    vi.mocked(api.deleteSkillChain).mockResolvedValue(undefined);
    await chainStore.deleteChain('chain-1');

    expect(listener).toHaveBeenCalled();
    unsub();
  });
});

// ===================== duplicateChain() =====================

describe('chainStore.duplicateChain', () => {
  it('should duplicate a chain and add it to the list', async () => {
    const duplicatedChain: SkillChain = {
      id: 'chain-1-copy',
      name: 'Test Chain (Copy)',
      description: 'A test chain',
      nodes: mockChain.nodes,
      failStrategy: 'stop',
      createdAt: '2024-06-04T00:00:00Z',
      updatedAt: '2024-06-04T00:00:00Z',
    };
    vi.mocked(api.duplicateSkillChain).mockResolvedValue(duplicatedChain);

    const result = await chainStore.duplicateChain('chain-1');

    expect(api.duplicateSkillChain).toHaveBeenCalledWith('chain-1');
    expect(result).toEqual(duplicatedChain);
    expect(chainStore.getChain('chain-1-copy')).toBeDefined();
    expect(chainStore.getChains()).toHaveLength(3);
  });
});

// ===================== subscribe() =====================

describe('chainStore.subscribe', () => {
  it('should unsubscribe correctly', async () => {
    const listener = vi.fn();
    const unsub = chainStore.subscribe(listener);

    unsub();
    listener.mockClear();

    // Trigger a change
    vi.mocked(api.deleteSkillChain).mockResolvedValue(undefined);
    await chainStore.deleteChain('chain-1');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners', async () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsub1 = chainStore.subscribe(listener1);
    const unsub2 = chainStore.subscribe(listener2);

    vi.mocked(api.deleteSkillChain).mockResolvedValue(undefined);
    await chainStore.deleteChain('chain-1');

    expect(listener1).toHaveBeenCalled();
    expect(listener2).toHaveBeenCalled();

    unsub1();
    unsub2();
  });

  it('should not let one listener error affect others', async () => {
    const badListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    const goodListener = vi.fn();
    const unsub1 = chainStore.subscribe(badListener);
    const unsub2 = chainStore.subscribe(goodListener);

    vi.mocked(api.deleteSkillChain).mockResolvedValue(undefined);
    await chainStore.deleteChain('chain-1');

    // Good listener should still be called despite bad listener error
    expect(goodListener).toHaveBeenCalled();

    unsub1();
    unsub2();
  });
});
