/**
 * 轻量版技能选择器 — 纯 CSS + React，无 MUI 依赖
 *
 * - 斜杠命令触发：输入 "/" 后弹出
 * - 支持键盘导航（↑↓ Enter Esc）
 * - 按名称/描述/分类/标签过滤
 * - 显示技能图标、名称、描述、分类
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Skill } from '../../types/skill-core.js';
import { getAllSkills } from '../../stores/skillStore.js';

interface Props {
  /** 触发弹出的锚点元素 */
  anchorEl: HTMLElement | null;
  /** 选中回调 */
  onSelect: (skill: Skill) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 过滤词（斜杠命令后的文本） */
  filter?: string;
  /** 是否只显示 active 状态 */
  activeOnly?: boolean;
  /** 外部传入的聚焦索引（键盘导航） */
  focusedIndex?: number;
}

/** 分类颜色映射 */
const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  core: { bg: '#EFF6FF', text: '#1D4ED8' },
  data: { bg: '#F0FDF4', text: '#15803D' },
  auto: { bg: '#FFF7ED', text: '#C2410C' },
  tool: { bg: '#FAF5FF', text: '#6D28D9' },
  communication: { bg: '#FEF2F2', text: '#B91C1C' },
  document: { bg: '#F0F9FF', text: '#0369A1' },
  design: { bg: '#FDF4FF', text: '#A21CAF' },
  development: { bg: '#F5F3FF', text: '#5B21B6' },
  media: { bg: '#FFF1F2', text: '#BE123C' },
  finance: { bg: '#ECFDF5', text: '#047857' },
  productivity: { bg: '#FFFBEB', text: '#B45309' },
  'ai-agent': { bg: '#F0FDFA', text: '#0F766E' },
};

function getCategoryColor(cat: string) {
  return CATEGORY_COLORS[cat] || { bg: '#F3F4F6', text: '#374151' };
}

/** 分类中文映射 */
const CATEGORY_LABELS: Record<string, string> = {
  core: '核心', data: '数据', auto: '自动化', tool: '工具',
  communication: '通讯', document: '文档', design: '设计',
  development: '开发', media: '媒体', finance: '财务',
  productivity: '效率', 'ai-agent': 'AI 智能体',
};

function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export const SkillSelectorLite: React.FC<Props> = ({
  anchorEl,
  onSelect,
  onClose,
  filter = '',
  activeOnly = false,
  focusedIndex: externalFocusedIndex,
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  // 获取技能列表
  const allSkills = useMemo(() => {
    const skills = getAllSkills();
    return activeOnly ? skills.filter(s => s.status === 'active') : skills;
  }, [activeOnly]);

  // 过滤
  const filteredSkills = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return allSkills;
    return allSkills.filter(skill =>
      skill.name.toLowerCase().includes(q) ||
      skill.desc.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q) ||
      (skill.trigger || '').toLowerCase().includes(q) ||
      (skill.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [allSkills, filter]);

  // 同步外部聚焦索引
  useEffect(() => {
    if (externalFocusedIndex !== undefined && externalFocusedIndex >= 0) {
      setHoveredIndex(externalFocusedIndex);
    }
  }, [externalFocusedIndex]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (anchorEl && !anchorEl.contains(e.target as Node) && listRef.current && !listRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorEl, onClose]);

  if (!anchorEl) return null;

  const anchorRect = anchorEl.getBoundingClientRect();
  const popupWidth = 400;
  const popupLeft = Math.max(8, Math.min(
    anchorRect.left + (anchorRect.width - popupWidth) / 2,
    window.innerWidth - popupWidth - 8
  ));

  return (
    <div
      ref={listRef}
      className="cdf-skill-selector"
      style={{
        position: 'fixed',
        bottom: `calc(100vh - ${anchorRect.top}px + 8px)`,
        left: popupLeft,
        width: popupWidth,
        maxHeight: 360,
        overflow: 'auto',
        zIndex: 1400,
      }}
    >
      {/* 标题栏 */}
      <div className="cdf-skill-selector__header">
        <span className="cdf-skill-selector__title">技能指令</span>
        <span className="cdf-skill-selector__hint">↑↓ 导航 · Enter 选择 · Esc 关闭</span>
      </div>

      {filteredSkills.length === 0 ? (
        <div className="cdf-skill-selector__empty">
          <div>未找到匹配的技能</div>
          {filter && <div className="cdf-skill-selector__empty-sub">尝试其他关键词</div>}
        </div>
      ) : (
        <div className="cdf-skill-selector__list">
          {filteredSkills.map((skill, index) => {
            const catColor = getCategoryColor(skill.category);
            const isHovered = index === hoveredIndex;
            return (
              <div
                key={skill.id}
                data-skill-index={index}
                className={`cdf-skill-selector__item ${isHovered ? 'cdf-skill-selector__item--hover' : ''}`}
                onClick={() => onSelect(skill)}
                onMouseEnter={() => setHoveredIndex(index)}
              >
                {/* 图标占位 */}
                <div className="cdf-skill-selector__icon">
                  {skill.icon?.charAt(0) || '⚡'}
                </div>
                <div className="cdf-skill-selector__info">
                  <div className="cdf-skill-selector__name-row">
                    <span className="cdf-skill-selector__name">{skill.name}</span>
                    <span
                      className="cdf-skill-selector__category"
                      style={{ background: catColor.bg, color: catColor.text }}
                    >
                      {getCategoryLabel(skill.category)}
                    </span>
                  </div>
                  <div className="cdf-skill-selector__desc">{skill.desc}</div>
                  {skill.trigger && (
                    <div className="cdf-skill-selector__trigger">{skill.trigger}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
