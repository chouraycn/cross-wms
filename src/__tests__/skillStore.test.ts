/**
 * Unit tests for src/stores/skillStore.ts
 *
 * Tests skill CRUD, caching, listeners, refreshFromRemote, and audit functions.
 * Uses vi.mock to replace the API layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===================== Mock Setup =====================

vi.mock('../services/api', () => ({
  getUserSkills: vi.fn(),
  getBuiltinPatches: vi.fn(),
  createUserSkill: vi.fn(),
  updateUserSkill: vi.fn(),
  deleteUserSkill: vi.fn(),
  setBuiltinPatch: vi.fn(),
  fetchSkillUsageStats: vi.fn(),
  fetchSkillAudit: vi.fn(),
  triggerSkillAudit: vi.fn(),
}));

import * as api from '../services/api';
import {
  getAllSkills,
  getSkillById,
  addSkill,
  updateSkill,
  removeSkill,
  setSkillStatus,
  refreshFromRemote,
  loadAllUsageStats,
  getUsageStats,
  findSkillByName,
  findSkillByTrigger,
  getSkillsByCategory,
  updateRecentSkills,
  onSkillsChange,
  getAuditStatus,
  loadAuditStatuses,
  refreshAuditForSkill,
  initFromApi,
} from '../stores/skillStore';
import type { Skill, SkillAudit } from '../types/skill';

// ===================== Test Fixtures =====================

const mockUserSkill: Skill = {
  id: 'user-skill-1',
  name: 'My Custom Skill',
  desc: 'A custom skill for testing',
  icon: 'Code',
  category: 'tool',
  path: '/custom',
  trigger: '/my-skill',
  tags: ['custom', 'test'],
  status: 'active',
  source: 'user',
  installedAt: 1700000000000,
  executionMode: 'chat',
  promptTemplate: 'You are a helper',
};

const mockUserSkill2: Skill = {
  id: 'user-skill-2',
  name: 'Another Skill',
  desc: 'Another custom skill',
  icon: 'Build',
  category: 'auto',
  path: '/auto',
  trigger: '/another',
  status: 'available',
  source: 'user',
  installedAt: 1700000001000,
};

const mockUsageStats: Record<string, { totalUses: number; lastUsedAt: string | null }> = {
  'builtin-dashboard': { totalUses: 10, lastUsedAt: '2024-06-01' },
  'user-skill-1': { totalUses: 5, lastUsedAt: '2024-06-02' },
};

const mockAudit: SkillAudit = {
  id: 'audit-1',
  skillId: 'user-skill-1',
  skillVersion: 'abc123',
  score: 95,
  level: 'safe',
  reportJson: '{}',
  reportMarkdown: '# Report',
  triggeredBy: 'manual',
  createdAt: '2024-06-01T00:00:00Z',
};

// ===================== beforeEach =====================

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();

  // Default mock returns
  vi.mocked(api.getUserSkills).mockResolvedValue([mockUserSkill, mockUserSkill2]);
  vi.mocked(api.getBuiltinPatches).mockResolvedValue({});
  vi.mocked(api.fetchSkillUsageStats).mockResolvedValue(mockUsageStats);

  // Re-initialize store state
  await refreshFromRemote();
});

// ===================== getAllSkills() =====================

describe('skillStore.getAllSkills', () => {
  it('should return builtin skills plus user skills', () => {
    const skills = getAllSkills();
    // Should include builtin skills (from BUILTIN_SKILLS) and user skills
    const userSkillIds = skills.filter((s) => s.source === 'user').map((s) => s.id);
    expect(userSkillIds).toContain('user-skill-1');
    expect(userSkillIds).toContain('user-skill-2');
    // Should include at least the builtin dashboard skill
    const builtinSkillIds = skills.filter((s) => s.source === 'builtin').map((s) => s.id);
    expect(builtinSkillIds.length).toBeGreaterThan(0);
  });

  it('should apply status patches to builtin skills', async () => {
    vi.mocked(api.getBuiltinPatches).mockResolvedValue({ 'builtin-dashboard': 'available' });
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue({});
    await refreshFromRemote();

    const skills = getAllSkills();
    const dashboard = skills.find((s) => s.id === 'builtin-dashboard');
    expect(dashboard).toBeDefined();
    expect(dashboard!.status).toBe('available');
  });
});

// ===================== getSkillById() =====================

describe('skillStore.getSkillById', () => {
  it('should find a user skill by id', () => {
    const skill = getSkillById('user-skill-1');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('My Custom Skill');
  });

  it('should find a builtin skill by id', () => {
    const skill = getSkillById('builtin-dashboard');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('仪表盘总览');
  });

  it('should return undefined for non-existent id', () => {
    const skill = getSkillById('non-existent');
    expect(skill).toBeUndefined();
  });
});

// ===================== addSkill() =====================

describe('skillStore.addSkill', () => {
  it('should create a new user skill and add it to the list', async () => {
    const newSkillFromApi: Skill = {
      id: 'skill-new-123',
      name: 'New Skill',
      desc: 'Brand new',
      icon: 'Extension',
      category: 'tool',
      path: '/new',
      status: 'active',
      source: 'user',
      installedAt: 1700000002000,
      executionMode: 'chat',
    };
    vi.mocked(api.createUserSkill).mockResolvedValue(newSkillFromApi);

    const result = await addSkill({
      name: 'New Skill',
      desc: 'Brand new',
      icon: 'Extension',
      category: 'tool',
      path: '/new',
      status: 'active',
      executionMode: 'chat',
    });

    expect(api.createUserSkill).toHaveBeenCalledTimes(1);
    expect(result).toEqual(newSkillFromApi);
    expect(getSkillById('skill-new-123')).toBeDefined();
  });

  it('should dispatch crosswms-api-error on API failure', async () => {
    vi.mocked(api.createUserSkill).mockRejectedValue(new Error('API error'));
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(addSkill({
      name: 'Fail Skill',
      desc: 'Will fail',
      icon: 'Code',
      category: 'tool',
      path: '/fail',
      status: 'active',
    })).rejects.toThrow('API error');

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'crosswms-api-error' })
    );
  });
});

// ===================== updateSkill() =====================

describe('skillStore.updateSkill', () => {
  it('should update an existing user skill', async () => {
    const updatedSkill: Skill = { ...mockUserSkill, name: 'Updated Skill' };
    vi.mocked(api.updateUserSkill).mockResolvedValue(updatedSkill);

    const result = await updateSkill('user-skill-1', { name: 'Updated Skill' });

    expect(result).toBe(true);
    expect(api.updateUserSkill).toHaveBeenCalledWith('user-skill-1', { name: 'Updated Skill' });
    const skill = getSkillById('user-skill-1');
    expect(skill!.name).toBe('Updated Skill');
  });

  it('should return false for non-existent skill id', async () => {
    const result = await updateSkill('non-existent', { name: 'Nope' });
    expect(result).toBe(false);
    expect(api.updateUserSkill).not.toHaveBeenCalled();
  });

  it('should dispatch error event on API failure', async () => {
    vi.mocked(api.updateUserSkill).mockRejectedValue(new Error('Update failed'));
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await expect(updateSkill('user-skill-1', { name: 'Fail' })).rejects.toThrow('Update failed');
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'crosswms-api-error' })
    );
  });
});

// ===================== removeSkill() =====================

describe('skillStore.removeSkill', () => {
  it('should remove a user skill', async () => {
    vi.mocked(api.deleteUserSkill).mockResolvedValue(undefined);

    const result = await removeSkill('user-skill-1');

    expect(result).toBe(true);
    expect(api.deleteUserSkill).toHaveBeenCalledWith('user-skill-1');
    expect(getSkillById('user-skill-1')).toBeUndefined();
  });

  it('should return false for non-existent skill', async () => {
    const result = await removeSkill('non-existent');
    expect(result).toBe(false);
    expect(api.deleteUserSkill).not.toHaveBeenCalled();
  });

  it('should return false when trying to remove a builtin skill that was added as user skill with source=builtin', async () => {
    // Add a builtin-sourced skill to userSkills
    const builtinSkillInUser: Skill = {
      id: 'builtin-in-user',
      name: 'Builtin in user list',
      desc: 'Should not be deletable',
      icon: 'Dashboard',
      category: 'core',
      path: '/',
      status: 'active',
      source: 'builtin',
    };
    vi.mocked(api.getUserSkills).mockResolvedValue([builtinSkillInUser, mockUserSkill2]);
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue({});
    await refreshFromRemote();

    const result = await removeSkill('builtin-in-user');
    expect(result).toBe(false);
  });
});

// ===================== setSkillStatus() =====================

describe('skillStore.setSkillStatus', () => {
  it('should update status of a user skill via API', async () => {
    const updatedSkill: Skill = { ...mockUserSkill, status: 'available' };
    vi.mocked(api.updateUserSkill).mockResolvedValue(updatedSkill);

    const result = await setSkillStatus('user-skill-1', 'available');

    expect(result).toBe(true);
    expect(api.updateUserSkill).toHaveBeenCalledWith('user-skill-1', { status: 'available' });
  });

  it('should update builtin skill status via patch API', async () => {
    vi.mocked(api.setBuiltinPatch).mockResolvedValue(undefined);

    const result = await setSkillStatus('builtin-dashboard', 'available');

    expect(result).toBe(true);
    expect(api.setBuiltinPatch).toHaveBeenCalledWith('builtin-dashboard', 'available');
  });
});

// ===================== refreshFromRemote() =====================

describe('skillStore.refreshFromRemote', () => {
  it('should reload skills and patches from API', async () => {
    const newSkills: Skill[] = [{ ...mockUserSkill, name: 'Refreshed' }];
    vi.mocked(api.getUserSkills).mockResolvedValue(newSkills);
    vi.mocked(api.getBuiltinPatches).mockResolvedValue({ 'builtin-dashboard': 'coming' });
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue({});

    await refreshFromRemote();

    const skills = getAllSkills();
    const userSkills = skills.filter((s) => s.source === 'user');
    expect(userSkills).toHaveLength(1);
    expect(userSkills[0].name).toBe('Refreshed');

    const dashboard = skills.find((s) => s.id === 'builtin-dashboard');
    expect(dashboard!.status).toBe('coming');
  });

  it('should not throw on API failure (graceful degradation)', async () => {
    vi.mocked(api.getUserSkills).mockRejectedValue(new Error('Network error'));

    // Should not throw
    await expect(refreshFromRemote()).resolves.toBeUndefined();
  });
});

// ===================== Usage Stats & Caching =====================

describe('skillStore caching (usageStats)', () => {
  it('should cache usage stats from API', async () => {
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue(mockUsageStats);
    await loadAllUsageStats();

    expect(getUsageStats('user-skill-1')).toEqual({ totalUses: 5, lastUsedAt: '2024-06-02' });
    expect(getUsageStats('builtin-dashboard')).toEqual({ totalUses: 10, lastUsedAt: '2024-06-01' });
  });

  it('should return undefined for non-cached skill stats', () => {
    expect(getUsageStats('non-existent-skill')).toBeUndefined();
  });

  it('should clear cache before loading new stats', async () => {
    // First load
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue(mockUsageStats);
    await loadAllUsageStats();
    expect(getUsageStats('user-skill-1')).toBeDefined();

    // Second load with empty stats
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue({});
    await loadAllUsageStats();
    expect(getUsageStats('user-skill-1')).toBeUndefined();
  });
});

// ===================== findSkillByName / findSkillByTrigger =====================

describe('skillStore findSkillByName', () => {
  it('should find a skill by exact name', () => {
    const skill = findSkillByName('My Custom Skill');
    expect(skill).toBeDefined();
    expect(skill!.id).toBe('user-skill-1');
  });

  it('should return undefined for non-matching name', () => {
    const skill = findSkillByName('Non-existent');
    expect(skill).toBeUndefined();
  });
});

describe('skillStore findSkillByTrigger', () => {
  it('should find active skills matching the query', () => {
    const skills = findSkillByTrigger('my-skill');
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.some((s) => s.id === 'user-skill-1')).toBe(true);
  });

  it('should return all active skills when query is empty', () => {
    const skills = findSkillByTrigger('');
    const allActive = skills.every((s) => s.status === 'active');
    expect(allActive).toBe(true);
  });

  it('should not return available/coming skills', () => {
    const skills = findSkillByTrigger('another');
    // mockUserSkill2 has status='available', so it should not appear
    expect(skills.every((s) => s.status === 'active')).toBe(true);
  });
});

// ===================== getSkillsByCategory =====================

describe('skillStore getSkillsByCategory', () => {
  it('should return skills filtered by category', () => {
    const toolSkills = getSkillsByCategory('tool');
    expect(toolSkills.every((s) => s.category === 'tool')).toBe(true);
    expect(toolSkills.some((s) => s.id === 'user-skill-1')).toBe(true);
  });

  it('should return empty array for category with no skills', () => {
    const skills = getSkillsByCategory('non-existent-category');
    expect(skills).toEqual([]);
  });
});

// ===================== updateRecentSkills =====================

describe('skillStore updateRecentSkills', () => {
  it('should add skill name to localStorage recent list', () => {
    updateRecentSkills('My Custom Skill');

    const stored = JSON.parse(localStorage.getItem('crosswms-recent-skills') || '[]');
    expect(stored).toContain('My Custom Skill');
  });

  it('should move duplicate to front and limit to 6 items', () => {
    // Add 7 different names
    for (let i = 0; i < 7; i++) {
      updateRecentSkills(`Skill ${i}`);
    }
    // Add first one again
    updateRecentSkills('Skill 0');

    const stored: string[] = JSON.parse(localStorage.getItem('crosswms-recent-skills') || '[]');
    expect(stored[0]).toBe('Skill 0');
    expect(stored.length).toBeLessThanOrEqual(6);
  });
});

// ===================== onSkillsChange =====================

describe('skillStore onSkillsChange', () => {
  it('should notify listeners on data change', async () => {
    const listener = vi.fn();
    const unsubscribe = onSkillsChange(listener);

    vi.mocked(api.deleteUserSkill).mockResolvedValue(undefined);
    await removeSkill('user-skill-1');

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('should stop notifying after unsubscribe', async () => {
    const listener = vi.fn();
    const unsubscribe = onSkillsChange(listener);

    unsubscribe();
    listener.mockClear();

    vi.mocked(api.deleteUserSkill).mockResolvedValue(undefined);
    await removeSkill('user-skill-2');

    expect(listener).not.toHaveBeenCalled();
  });
});

// ===================== Audit Functions =====================

describe('skillStore audit functions', () => {
  it('should cache audit status after loadAuditStatuses', async () => {
    vi.mocked(api.fetchSkillAudit).mockImplementation(async (skillId: string) => {
      if (skillId === 'user-skill-1') return mockAudit;
      return null;
    });

    await loadAuditStatuses();

    expect(getAuditStatus('user-skill-1')).toEqual(mockAudit);
  });

  it('should refresh audit for a single skill', async () => {
    vi.mocked(api.triggerSkillAudit).mockResolvedValue(mockAudit);

    await refreshAuditForSkill('user-skill-1');

    expect(api.triggerSkillAudit).toHaveBeenCalledWith('user-skill-1', '', true);
    expect(getAuditStatus('user-skill-1')).toEqual(mockAudit);
  });

  it('should return undefined for non-audited skill', () => {
    expect(getAuditStatus('never-audited')).toBeUndefined();
  });
});

// ===================== initFromApi =====================

describe('skillStore initFromApi', () => {
  it('should initialize skills from API', async () => {
    vi.mocked(api.getUserSkills).mockResolvedValue([mockUserSkill]);
    vi.mocked(api.getBuiltinPatches).mockResolvedValue({});
    vi.mocked(api.fetchSkillUsageStats).mockResolvedValue({});

    await initFromApi();

    const skill = getSkillById('user-skill-1');
    expect(skill).toBeDefined();
    expect(skill!.name).toBe('My Custom Skill');
  });
});
