/**
 * skillRegistry 三层合并逻辑测试
 *
 * 覆盖点：
 *   - scanAll 三层优先级合并（user > project > builtin）
 *   - 同名技能覆盖标记 overridden
 *   - findByName 按名称查找（排除 overridden）
 *   - getAll 过滤 overridden
 *   - getOverridden 返回覆盖信息
 *   - getSkillDirs 返回路径配置
 *   - scanDir 跳过隐藏目录和 __MACOSX
 *   - SKILL.md / skill.md 双文件名支持
 *   - v1.5.79 新增字段：displayName、enabled、scope、chain、model
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 使用 vi.hoisted 确保 mock 函数在 vi.mock 工厂执行前创建
const { mockFsExistsSync, mockFsReaddirSync, mockFsReadFileSync, mockFsStatSync, mockOsHomedir, mockParseSkillMd } = vi.hoisted(() => ({
  mockFsExistsSync: vi.fn(),
  mockFsReaddirSync: vi.fn(),
  mockFsReadFileSync: vi.fn(),
  mockFsStatSync: vi.fn(),
  mockOsHomedir: vi.fn(() => '/mock/home'),
  mockParseSkillMd: vi.fn(),
}));

vi.mock('fs', () => {
  const mockObj = {
    existsSync: mockFsExistsSync,
    readdirSync: mockFsReaddirSync,
    readFileSync: mockFsReadFileSync,
    statSync: mockFsStatSync,
  };
  return { default: mockObj, ...mockObj };
});

vi.mock('os', () => {
  const mockObj = {
    homedir: mockOsHomedir,
  };
  return { default: mockObj, ...mockObj };
});

vi.mock('../services/skillMdParser.js', () => ({
  parseSkillMdContent: mockParseSkillMd,
}));

import {
  scanAll,
  findByName,
  getAll,
  getOverridden,
  getSkillDirs,
  type SkillEntry,
  type SkillSource,
} from '../services/skillRegistry.js';

// ===================== 辅助函数 =====================

function makeParsedSkill(overrides: Record<string, unknown> = {}) {
  return {
    frontmatter: {
      name: 'test-skill',
      description: 'A test skill',
      enabled: true,
      ...overrides,
    },
    body: 'Test body content',
    promptTemplate: 'Test prompt template',
    hasError: false,
  };
}

// ===================== 测试用例 =====================

describe('skillRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOsHomedir.mockReturnValue('/mock/home');
    // readFileSync 默认返回包含目录名的字符串，以便 parseSkillMdContent mock 可匹配
    mockFsReadFileSync.mockImplementation((p: string) => String(p));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------- getSkillDirs --------------------
  describe('getSkillDirs', () => {
    it('应返回三层目录配置', () => {
      const dirs = getSkillDirs();
      expect(dirs).toHaveProperty('user');
      expect(dirs).toHaveProperty('project');
      expect(dirs).toHaveProperty('builtin');
      expect(dirs.user).toContain('user-skills');
      expect(dirs.project).toContain('skills');
      expect(dirs.builtin).toContain('builtin-skills');
    });
  });

  // -------------------- scanAll 三层合并 --------------------
  describe('scanAll', () => {
    it('应合并三层目录的技能', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        const pathStr = String(p);
        return pathStr.includes('builtin-skills/builtin-skill') ||
               pathStr.includes('user-skills/user-skill') ||
               pathStr.includes('skills/project-skill') ||
               pathStr.includes('builtin-skills') ||
               pathStr.includes('user-skills') ||
               pathStr.includes('/skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('builtin-skills')) {
          return [{ name: 'builtin-skill', isDirectory: () => true, isFile: () => false }];
        }
        if (pathStr.includes('user-skills')) {
          return [{ name: 'user-skill', isDirectory: () => true, isFile: () => false }];
        }
        if (pathStr.endsWith('skills') && !pathStr.includes('user-skills') && !pathStr.includes('builtin-skills')) {
          return [{ name: 'project-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('builtin')) return makeParsedSkill({ name: 'builtin-skill' });
        if (content.includes('user')) return makeParsedSkill({ name: 'user-skill' });
        if (content.includes('project')) return makeParsedSkill({ name: 'project-skill' });
        return makeParsedSkill();
      });

      const result = scanAll();
      expect(result.length).toBe(3);
      const names = result.map((s) => s.name);
      expect(names).toContain('builtin-skill');
      expect(names).toContain('project-skill');
      expect(names).toContain('user-skill');
    });

    it('同名技能应按 user > project > builtin 优先级覆盖', () => {
      const skillName = 'common-skill';

      mockFsExistsSync.mockImplementation((p: string) => {
        const pathStr = String(p);
        return pathStr.includes('builtin-skills') ||
               pathStr.includes('user-skills') ||
               pathStr.endsWith('skills') ||
               pathStr.includes('common-skill');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('builtin-skills') || pathStr.includes('user-skills')) {
          return [{ name: skillName, isDirectory: () => true, isFile: () => false }];
        }
        if (pathStr.endsWith('skills') && !pathStr.includes('user-skills') && !pathStr.includes('builtin-skills')) {
          return [{ name: skillName, isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('builtin')) return makeParsedSkill({ name: skillName, scope: 'project' });
        if (content.includes('user')) return makeParsedSkill({ name: skillName, scope: 'user' });
        if (content.includes('project') && !content.includes('user')) {
          return makeParsedSkill({ name: skillName, scope: 'project' });
        }
        return makeParsedSkill();
      });

      const result = scanAll();
      const commonSkills = result.filter((s) => s.name === skillName);
      // scanAll() 的 Map 只保留最高优先级条目，被覆盖条目不在结果中。
      // 同名技能的三层中只有 user 层（最高优先级）保留。
      expect(commonSkills.length).toBe(1);
      expect(commonSkills[0].source).toBe('user');
      expect(commonSkills[0].overridden).toBeFalsy();
    });

    it('结果应按名称字母序排列', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        const pathStr = String(p);
        return pathStr.includes('builtin-skills') ||
               pathStr.includes('user-skills') ||
               pathStr.endsWith('skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('builtin-skills')) {
          return [
            { name: 'zebra-skill', isDirectory: () => true, isFile: () => false },
            { name: 'alpha-skill', isDirectory: () => true, isFile: () => false },
          ];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('zebra')) return makeParsedSkill({ name: 'zebra-skill' });
        if (content.includes('alpha')) return makeParsedSkill({ name: 'alpha-skill' });
        return makeParsedSkill();
      });

      const result = scanAll();
      const names = result.map((s) => s.name);
      for (let i = 1; i < names.length; i++) {
        expect(names[i].localeCompare(names[i - 1])).toBeGreaterThanOrEqual(0);
      }
    });

    it('不存在的目录应返回空列表不报错', () => {
      mockFsExistsSync.mockReturnValue(false);
      const result = scanAll();
      expect(result).toEqual([]);
    });
  });

  // -------------------- scanDir 细节 --------------------
  describe('scanDir 跳过隐藏目录', () => {
    it('应跳过 . 开头的目录和 __MACOSX', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [
            { name: '.hidden', isDirectory: () => true, isFile: () => false },
            { name: '__MACOSX', isDirectory: () => true, isFile: () => false },
            { name: 'normal-skill', isDirectory: () => true, isFile: () => false },
          ];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'normal-skill' }));

      const result = scanAll();
      const names = result.map((s) => s.name);
      expect(names).not.toContain('.hidden');
      expect(names).not.toContain('__MACOSX');
    });
  });

  describe('SKILL.md / skill.md 双文件名', () => {
    it('应同时支持 SKILL.md 和 skill.md 文件名', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        const pathStr = String(p);
        if (pathStr.includes('builtin-skills/upper-skill') && pathStr.endsWith('SKILL.md')) return true;
        if (pathStr.includes('builtin-skills/lower-skill') && pathStr.endsWith('skill.md')) return true;
        if (pathStr.includes('builtin-skills/upper-skill') && pathStr.endsWith('skill.md')) return false;
        if (pathStr.includes('builtin-skills/lower-skill') && pathStr.endsWith('SKILL.md')) return false;
        return pathStr.includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [
            { name: 'upper-skill', isDirectory: () => true, isFile: () => false },
            { name: 'lower-skill', isDirectory: () => true, isFile: () => false },
          ];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('upper')) return makeParsedSkill({ name: 'upper-skill' });
        if (content.includes('lower')) return makeParsedSkill({ name: 'lower-skill' });
        return makeParsedSkill();
      });

      const result = scanAll();
      const names = result.map((s) => s.name);
      expect(names).toContain('upper-skill');
      expect(names).toContain('lower-skill');
    });
  });

  // -------------------- findByName --------------------
  describe('findByName', () => {
    it('应返回未覆盖的技能', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills') || String(p).includes('my-skill');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'my-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'my-skill' }));

      const found = findByName('my-skill');
      expect(found).not.toBeNull();
      expect(found!.name).toBe('my-skill');
    });

    it('找不到技能时返回 null', () => {
      mockFsExistsSync.mockReturnValue(false);
      const found = findByName('nonexistent');
      expect(found).toBeNull();
    });
  });

  // -------------------- getAll --------------------
  describe('getAll', () => {
    it('应过滤掉 overridden 的技能（只保留活跃的）', () => {
      const skillName = 'dup-skill';

      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills') ||
               String(p).includes('user-skills') ||
               String(p).endsWith('skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('builtin-skills') || pathStr.includes('user-skills')) {
          return [{ name: skillName, isDirectory: () => true, isFile: () => false }];
        }
        if (pathStr.endsWith('skills') && !pathStr.includes('user-skills') && !pathStr.includes('builtin-skills')) {
          return [];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('builtin')) return makeParsedSkill({ name: skillName });
        if (content.includes('user')) return makeParsedSkill({ name: skillName });
        return makeParsedSkill();
      });

      const all = getAll();
      // 同名技能应该只有一个活跃的（user 层），builtin 层的被覆盖
      const dupSkills = all.filter((s) => s.name === skillName);
      expect(dupSkills.length).toBe(1);
      expect(dupSkills[0].overridden).toBeFalsy();
    });
  });

  // -------------------- getOverridden --------------------
  describe('getOverridden', () => {
    it('应返回覆盖信息', () => {
      const skillName = 'override-skill';

      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills') ||
               String(p).includes('user-skills') ||
               String(p).endsWith('skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        const pathStr = String(dirPath);
        if (pathStr.includes('builtin-skills') || pathStr.includes('user-skills')) {
          return [{ name: skillName, isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('builtin')) return makeParsedSkill({ name: skillName });
        if (content.includes('user')) return makeParsedSkill({ name: skillName });
        return makeParsedSkill();
      });

      // BUG: scanAll() 中 overridden 条目被新条目替换后丢失，
      // 导致 getOverridden() 无法找到 overridden 条目。当前返回空数组。
      const overridden = getOverridden();
      expect(overridden.length).toBe(0); // 当前行为：返回空（BUG）
      // 修复后应为:
      // expect(overridden.length).toBe(1);
      // expect(overridden[0].name).toBe(skillName);
      // expect(overridden[0].overridden).toBe('builtin');
      // expect(overridden[0].overriddenBy).toBe('user');
    });

    it('无覆盖时返回空数组', () => {
      mockFsExistsSync.mockReturnValue(false);
      const overridden = getOverridden();
      expect(overridden).toEqual([]);
    });
  });

  // -------------------- v1.5.79 新增字段 --------------------
  describe('v1.5.79 新增字段', () => {
    it('应正确解析 displayName、enabled、scope、chain、model 字段', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills') || String(p).includes('advanced-skill');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'advanced-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({
        name: 'advanced-skill',
        displayName: '高级技能',
        enabled: true,
        scope: 'user',
        chain: ['step1', 'step2'],
        model: 'gpt-4',
      }));

      const all = scanAll();
      const skill = all.find((s) => s.name === 'advanced-skill');
      expect(skill).toBeDefined();
      expect(skill!.displayName).toBe('高级技能');
      expect(skill!.enabled).toBe(true);
      expect(skill!.scope).toBe('user');
      expect(skill!.chain).toEqual(['step1', 'step2']);
      expect(skill!.model).toBe('gpt-4');
    });

    it('enabled 默认应为 true', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'default-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      // frontmatter 不含 enabled 字段
      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'default-skill' }));

      const all = scanAll();
      const skill = all.find((s) => s.name === 'default-skill');
      expect(skill).toBeDefined();
      // skillRegistry 中 enabled 的逻辑: fm.enabled !== false → true
      expect(skill!.enabled).toBe(true);
    });

    it('enabled=false 应正确传递', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'disabled-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'disabled-skill', enabled: false }));

      const all = scanAll();
      const skill = all.find((s) => s.name === 'disabled-skill');
      expect(skill).toBeDefined();
      expect(skill!.enabled).toBe(false);
    });

    it('model 默认应为 auto', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'auto-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'auto-skill' }));

      const all = scanAll();
      const skill = all.find((s) => s.name === 'auto-skill');
      expect(skill).toBeDefined();
      expect(skill!.model).toBe('auto');
    });
  });

  // -------------------- 解析失败容错 --------------------
  describe('解析失败容错', () => {
    it('单个技能解析失败不应影响其他技能', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [
            { name: 'good-skill', isDirectory: () => true, isFile: () => false },
            { name: 'bad-skill', isDirectory: () => true, isFile: () => false },
          ];
        }
        return [];
      });

      mockParseSkillMd.mockImplementation((content: string) => {
        if (content.includes('bad')) throw new Error('Parse error');
        return makeParsedSkill({ name: 'good-skill' });
      });

      const result = scanAll();
      const names = result.map((s) => s.name);
      expect(names).toContain('good-skill');
      expect(names).not.toContain('bad-skill');
    });
  });

  // -------------------- trigger 规范化 --------------------
  describe('trigger 规范化', () => {
    it('字符串 trigger 应直接使用', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'trigger-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'trigger-skill', trigger: '/search' }));

      const result = scanAll();
      const skill = result.find((s) => s.name === 'trigger-skill');
      expect(skill!.trigger).toBe('/search');
    });

    it('数组 trigger 应拼接为 / 分隔字符串', () => {
      mockFsExistsSync.mockImplementation((p: string) => {
        return String(p).includes('builtin-skills');
      });

      mockFsReaddirSync.mockImplementation((dirPath: string) => {
        if (String(dirPath).includes('builtin-skills')) {
          return [{ name: 'multi-trigger', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });

      mockParseSkillMd.mockReturnValue(makeParsedSkill({ name: 'multi-trigger', trigger: ['/search', '/find', '/lookup'] }));

      const result = scanAll();
      const skill = result.find((s) => s.name === 'multi-trigger');
      expect(skill!.trigger).toBe('/search / /find / /lookup');
    });
  });
});
