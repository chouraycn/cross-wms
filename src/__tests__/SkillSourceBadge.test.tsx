/**
 * SkillSourceBadge 徽章组件测试
 *
 * 覆盖点：
 *   - builtin scope 渲染蓝底"系统"
 *   - project scope 渲染绿底"项目"
 *   - user scope 渲染橙底"个人"
 *   - 未知 scope 回退到 builtin 配置
 *   - size prop 传递到 Chip
 */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SkillSourceBadge } from '../components/Skills/SkillSourceBadge';

afterEach(() => cleanup());

describe('SkillSourceBadge', () => {
  // -------------------- builtin scope --------------------
  describe('builtin scope', () => {
    it('应渲染"系统"标签', () => {
      render(<SkillSourceBadge scope="builtin" />);
      expect(screen.getByText('系统')).toBeInTheDocument();
    });

    it('应使用蓝色主题', () => {
      const { container } = render(<SkillSourceBadge scope="builtin" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
      // 验证蓝色背景
      expect(chip).toHaveStyle({ backgroundColor: '#EFF6FF' });
    });
  });

  // -------------------- project scope --------------------
  describe('project scope', () => {
    it('应渲染"项目"标签', () => {
      render(<SkillSourceBadge scope="project" />);
      expect(screen.getByText('项目')).toBeInTheDocument();
    });

    it('应使用绿色主题', () => {
      const { container } = render(<SkillSourceBadge scope="project" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveStyle({ backgroundColor: '#ECFDF5' });
    });
  });

  // -------------------- user scope --------------------
  describe('user scope', () => {
    it('应渲染"个人"标签', () => {
      render(<SkillSourceBadge scope="user" />);
      expect(screen.getByText('个人')).toBeInTheDocument();
    });

    it('应使用橙色主题', () => {
      const { container } = render(<SkillSourceBadge scope="user" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
      expect(chip).toHaveStyle({ backgroundColor: '#FFF7ED' });
    });
  });

  // -------------------- 未知 scope 回退 --------------------
  describe('未知 scope 回退', () => {
    it('未知 scope 应回退到 builtin 配置（蓝底"系统"）', () => {
      render(<SkillSourceBadge scope="unknown" />);
      expect(screen.getByText('系统')).toBeInTheDocument();
    });

    it('空字符串 scope 应回退到 builtin 配置', () => {
      render(<SkillSourceBadge scope="" />);
      expect(screen.getByText('系统')).toBeInTheDocument();
    });
  });

  // -------------------- size prop --------------------
  describe('size prop', () => {
    it('默认 size 应为 small', () => {
      const { container } = render(<SkillSourceBadge scope="builtin" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
      expect(chip!.className).toContain('MuiChip-sizeSmall');
    });

    it('size="medium" 应正确传递', () => {
      const { container } = render(<SkillSourceBadge scope="builtin" size="medium" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toBeInTheDocument();
      expect(chip!.className).toContain('MuiChip-sizeMedium');
    });
  });

  // -------------------- 颜色一致性 --------------------
  describe('文字颜色', () => {
    it('builtin 应有蓝色文字', () => {
      const { container } = render(<SkillSourceBadge scope="builtin" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveStyle({ color: '#2563EB' });
    });

    it('project 应有绿色文字', () => {
      const { container } = render(<SkillSourceBadge scope="project" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveStyle({ color: '#059669' });
    });

    it('user 应有橙色文字', () => {
      const { container } = render(<SkillSourceBadge scope="user" />);
      const chip = container.querySelector('.MuiChip-root');
      expect(chip).toHaveStyle({ color: '#EA580C' });
    });
  });
});
