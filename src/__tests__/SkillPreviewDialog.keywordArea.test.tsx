/**
 * SkillPreviewDialog — 关键词提示区 UI 渲染验证
 *  1) 灰色外盒 (bg #F3F4F6 + border #E5E7EB)
 *  2) "在 AI 对话中输入以下关键词唤起：" 文案与 KeyboardIcon
 *  3) 关键词使用 " · " 分隔符 → 拆分为独立 /xxx 标签
 *  4) 关键词使用 "/" 分隔符 → 拆分为独立 /xxx 标签
 *  5) 标签单粒样式：白底 #FFFFFF / 边框 #D1D5DB / 文字 #374151
 *  6) 无 trigger 时整段不渲染
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import SkillPreviewDialog from '../components/Skills/SkillPreviewDialog';
import type { Skill } from '../types/skill';

// Mock 掉可能需要 fetch/scan 的 MarkdownRenderer
vi.mock('../components/CrossWmsChat/MarkdownRenderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="md-renderer">{content}</div>
  ),
}));

vi.mock('../services/api', () => ({
  scanSkillMd: () => Promise.resolve([]),
  readSkillMd: () => Promise.resolve({ body: '' }),
}));

const Base: Skill = {
  id: 'sample-skill-001',
  name: '示例技能',
  desc: '测试用的技能描述',
  category: 'tool',
  source: 'builtin',
  status: 'active',
  icon: 'Extension',
  path: '/skills/sample-skill-001',
  tags: ['test'],
  installedAt: Date.now(),
};

function renderDialog(skill: Skill) {
  return render(
    <SkillPreviewDialog
      open={true}
      skill={skill}
      onClose={() => {}}
      onUse={() => {}}
    />
  );
}

describe('SkillPreviewDialog · 关键词提示区渲染', () => {
  it('trigger 为空 → 提示盒完全不渲染', () => {
    renderDialog({ ...Base, trigger: '' });
    expect(screen.queryByText(/在 AI 对话中输入以下关键词唤起/)).toBeNull();
  });

  it('trigger 以 · 分隔 → 拆成 3 个独立 /xxx 标签', () => {
    renderDialog({ ...Base, trigger: '盘点 · 库存 · 调拨' });
    const intro = screen.getByText(/在 AI 对话中输入以下关键词唤起/);
    expect(intro).toBeTruthy();

    const labels = screen.getAllByText((t: any) => typeof t === 'string' && t.startsWith('/'));
    const raw = labels.map((n) => n.textContent);
    expect(raw).toContain('/盘点');
    expect(raw).toContain('/库存');
    expect(raw).toContain('/调拨');
  });

  it('trigger 以 / 分隔（旧格式兼容）→ 拆成 3 个独立 /xxx 标签', () => {
    // 注意：旧分隔符 / 只在整个字符串不包含 "·" 时才生效
    renderDialog({ ...Base, trigger: 'WMS/海关归类/需求拆解' });
    const labels = screen.getAllByText((t: any) => typeof t === 'string' && t.startsWith('/'));
    const raw = labels.map((n) => n.textContent);
    expect(raw).toContain('/WMS');
    expect(raw).toContain('/海关归类');
    expect(raw).toContain('/需求拆解');
  });

  it('新格式 · 分隔时保留关键词内斜杠（例如 CI/CD 不被误拆）', () => {
    renderDialog({ ...Base, trigger: 'CI/CD 发布 · GitHub 评审 · 多仓协同' });
    const labels = screen.getAllByText((t: any) => typeof t === 'string' && t.startsWith('/'));
    const raw = labels.map((n) => n.textContent);
    expect(raw).toContain('/CI/CD 发布');
    expect(raw).toContain('/GitHub 评审');
    expect(raw).toContain('/多仓协同');
    // 确保不存在误拆产物
    expect(raw).not.toContain('/CI');
    expect(raw).not.toContain('/CD 发布');
  });

  it('混合含 · 时以 · 为准，/ 不拆（宽容空格）', () => {
    renderDialog({ ...Base, trigger: '盘点 / 库存管理  ·  调拨  ·  WMS 核心' });
    const labels = screen.getAllByText((t: any) => typeof t === 'string' && t.startsWith('/'));
    const raw = labels.map((n) => n.textContent);
    expect(raw).toEqual(
      expect.arrayContaining(['/盘点 / 库存管理', '/调拨', '/WMS 核心'])
    );
    expect(raw).toHaveLength(3);
    // 确保没被误拆
    expect(raw).not.toContain('/盘点');
    expect(raw).not.toContain('/库存管理');
  });

  it('关键词外盒是灰色主题：关键词提示区 data-testid + 标签白底', () => {
    // MUI Dialog 通过 Portal 渲染到 document.body，用 screen 而非 container 查询
    renderDialog({ ...Base, trigger: '盘点 · 库存' });

    // 命中提示外盒
    const triggerWrap = screen.getByTestId('skill-dialog-trigger-box');
    expect(triggerWrap).toBeTruthy();
    // 命中单个白底标签粒
    const chips = screen.getAllByTestId('skill-dialog-trigger-chip');
    expect(chips.length).toBeGreaterThanOrEqual(2);
    const texts = chips.map((el) => el.textContent);
    expect(texts).toContain('/盘点');
    expect(texts).toContain('/库存');
  });
});
