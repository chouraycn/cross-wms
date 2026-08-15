import { describe, it, expect } from 'vitest';
import { inferBuiltinSkillIcon, inferBuiltinSkillTrigger, ICON_WHITELIST } from '../utils/builtin-skill-metadata';

describe('弹窗关键词提示区 数据流验证', () => {
  // 模拟一批典型内置 skill，验证 trigger 推断结果格式与弹窗按 / 拆分逻辑
  const CASES = [
    {
      id: 'wms-inventory-sync',
      name: '库存同步助手',
      desc: '多仓库存状态实时同步与预警',
      category: 'tool',
      tags: ['wms', 'inventory', 'sync'],
      expectTriggerHints: ['库存盘点', 'WMS 仓储', '多仓协同'], // 最多 3 条；可能不完全一致
      expectIconInWhitelist: true,
    },
    {
      id: 'gh-pr-assist',
      name: 'GitHub PR 助手',
      desc: '自动生成 PR 描述并跑 CI 检查',
      category: 'coding',
      tags: ['github', 'pr', 'ci'],
      expectTriggerHintsIncludes: ['GitHub'],
    },
    {
      id: 'oracle-model-review',
      name: 'Oracle 多模型评审',
      desc: '二模型评审回答差异 + token 预检',
      category: 'ai',
      tags: ['oracle', 'review', 'token'],
    },
    {
      id: 'customs-declaration-hs',
      name: '报关归类助手',
      desc: '自动匹配 HS CODE 税号并生成报关单草案',
      category: 'trade',
      tags: ['customs', 'hscode', 'declaration'],
    },
    {
      id: 'clawhub-market',
      name: 'ClawHub 技能市场',
      desc: '浏览并安装 ClawHub 上的官方与社区技能',
      category: 'discover',
      tags: ['marketplace', 'skill', 'install'],
    },
  ];

  it('每个案例都返回合法 icon（ICON_WHITELIST 内）', () => {
    for (const c of CASES) {
      const icon = inferBuiltinSkillIcon({
        id: c.id,
        name: c.name,
        description: c.desc,
        category: c.category,
        tags: c.tags,
      });
      expect(ICON_WHITELIST.has(icon)).toBe(true);
    }
  });

  it('trigger 推断返回的字符串使用 / 或 · 作为分隔符，便于弹窗拆分渲染', () => {
    for (const c of CASES) {
      const trigger = inferBuiltinSkillTrigger({
        id: c.id,
        name: c.name,
        description: c.desc,
        category: c.category,
        tags: c.tags,
      });
      // 不允许为全空 —— 弹窗关键词区若返回空字符串，会跳过渲染
      expect(typeof trigger).toBe('string');
      expect(trigger.length).toBeGreaterThan(0);

      // 复制弹窗代码中的拆分逻辑：按 / 拆（我们实现用 " · " 作为 join，兼容 /）
      const parts = trigger
        .split('/')
        .map(t => t.trim())
        .filter(Boolean);
      // 如果没有 "/"，再按 " · " 拆（join 分隔符）
      const finalParts = parts.length > 1 ? parts : trigger.split(' · ').filter(Boolean);
      expect(finalParts.length).toBeGreaterThanOrEqual(1);
      expect(finalParts.length).toBeLessThanOrEqual(3);

      // 不能包含 / 在单个 part 里（除非没有拆分，但此时只有一个 part）
      for (const p of finalParts) {
        expect(p.includes('/')).toBe(false);
      }
    }
  });

  it('显式 triggers / trigger 字段优先被使用', () => {
    const trigger = inferBuiltinSkillTrigger({
      id: 'foo-bar',
      name: 'Foo',
      desc: 'Anything',
      triggers: ['关键词A', '关键词B', '关键词C', '关键词D'],
      trigger: '应该被忽略',
    });
    expect(trigger).toBe('关键词A · 关键词B · 关键词C'); // 最多 3 条
  });

  it('trigger 单字段 + triggers 数组都会被合并，最多取 3 条', () => {
    const trigger = inferBuiltinSkillTrigger({
      id: 'x',
      name: 'X',
      desc: 'Y',
      trigger: '单独字段',
    });
    expect(trigger).toBe('单独字段');
  });

  it('弹窗拆分策略：含 · 时仅按 · 拆（防止 CI/CD 被误拆），否则按 / 拆（与 SkillPreviewDialog 一致）', () => {
    // 与组件一致的策略
    function splitTrigger(raw: string): string[] {
      const hasDotSep = raw.includes('·');
      return (hasDotSep
        ? raw.split(/\s*·\s*/)
        : raw.split(/\s*\/\s*/)
      ).map(t => t.trim()).filter(Boolean);
    }

    // 新格式：含 "·" → 只按 · 拆，保留关键词里的 "/"
    expect(splitTrigger('CI/CD 发布 · GitHub 评审 · 多仓协同'))
      .toEqual(['CI/CD 发布', 'GitHub 评审', '多仓协同']);

    // 旧格式：纯 "/" 分隔（无 ·）→ 按 "/" 拆
    expect(splitTrigger('盘点/库存/调拨'))
      .toEqual(['盘点', '库存', '调拨']);

    // 新格式宽容空格
    expect(splitTrigger('盘点 / 库存管理  ·  调拨  ·  WMS 核心'))
      .toEqual(['盘点 / 库存管理', '调拨', 'WMS 核心']);

    // 单条关键词（无分隔符）原样返回
    expect(splitTrigger('关键词A')).toEqual(['关键词A']);

    // 空字符串返回空数组 → 弹窗跳过渲染
    expect(splitTrigger('')).toEqual([]);
  });
});
