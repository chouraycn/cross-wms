/**
 * Agent 切换器组件
 * 下拉选择器 / 弹出面板，支持快捷键切换
 */
import React, { memo, useRef, useEffect, useState, useCallback } from 'react';
import { AgentIdentity, AgentAvatar, AGENT_SCENARIOS, ROLE_LABELS, ROLE_COLORS } from './AgentProfile';
import './AgentSwitcher.css';

interface AgentSwitcherProps {
  currentAgent: AgentIdentity;
  agents?: AgentIdentity[];
  onAgentChange: (agent: AgentIdentity) => void;
  onOpenAgentSettings?: () => void;
  darkMode?: boolean;
  disabled?: boolean;
}

interface GroupedAgents {
  enabled: AgentIdentity[];
  disabled: AgentIdentity[];
}

const ACCENT = '#F97316';

export const AgentSwitcher: React.FC<AgentSwitcherProps> = memo(function AgentSwitcher({
  currentAgent,
  agents = AGENT_SCENARIOS,
  onAgentChange,
  onOpenAgentSettings,
  darkMode = false,
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 分组 Agent
  const groupedAgents: GroupedAgents = React.useMemo(() => {
    const filtered = agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return {
      enabled: filtered.filter((a) => a.enabled !== false),
      disabled: filtered.filter((a) => a.enabled === false),
    };
  }, [agents, searchQuery]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 打开时聚焦搜索框
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // 快捷键切换 (Ctrl/Cmd + Shift + A)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleAgentSelect = useCallback(
    (agent: AgentIdentity) => {
      if (agent.enabled !== false) {
        onAgentChange(agent);
        setIsOpen(false);
        setSearchQuery('');
      }
    },
    [onAgentChange]
  );

  const toggleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen((prev) => !prev);
    }
  }, [disabled]);

  if (!anchorRef.current) {
    return null;
  }
  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const popupWidth = Math.max(320, anchorRect?.width || 320);

  const containerClass = `cdf-agent-switcher ${darkMode ? 'cdf-dark' : ''}`;

  return (
    <div className={containerClass}>
      {/* 触发按钮 */}
      <button
        ref={anchorRef}
        className="cdf-agent-switcher__trigger"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <AgentAvatar agent={currentAgent} size={28} showTooltip={false} />
        <span className="cdf-agent-switcher__trigger-name">{currentAgent.name}</span>
        <svg
          className={`cdf-agent-switcher__trigger-arrow ${isOpen ? 'cdf-agent-switcher__trigger-arrow--open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 弹出面板 */}
      {isOpen && (
        <div
          ref={listRef}
          className="cdf-agent-switcher__panel"
          style={{
            width: popupWidth,
            zIndex: 1400,
          }}
          role="listbox"
          aria-label="选择 Agent"
        >
          {/* 搜索框 */}
          <div className="cdf-agent-switcher__search">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="搜索 Agent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="cdf-agent-switcher__search-input"
            />
            {searchQuery && (
              <button
                className="cdf-agent-switcher__search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="清除搜索"
              >
                ×
              </button>
            )}
          </div>

          {/* Agent 列表 */}
          <div className="cdf-agent-switcher__list">
            {/* 启用的 Agent */}
            {groupedAgents.enabled.length > 0 && (
              <>
                <div className="cdf-agent-switcher__section-title">可用</div>
                {groupedAgents.enabled.map((agent) => (
                  <AgentListItem
                    key={agent.id}
                    agent={agent}
                    isSelected={currentAgent.id === agent.id}
                    onSelect={handleAgentSelect}
                  />
                ))}
              </>
            )}

            {/* 禁用的 Agent */}
            {groupedAgents.disabled.length > 0 && (
              <>
                <div className="cdf-agent-switcher__section-title">不可用</div>
                {groupedAgents.disabled.map((agent) => (
                  <AgentListItem
                    key={agent.id}
                    agent={agent}
                    isSelected={currentAgent.id === agent.id}
                    onSelect={handleAgentSelect}
                  />
                ))}
              </>
            )}

            {/* 空状态 */}
            {groupedAgents.enabled.length === 0 && groupedAgents.disabled.length === 0 && (
              <div className="cdf-agent-switcher__empty">
                <div>未找到匹配的 Agent</div>
                <div className="cdf-agent-switcher__empty-hint">尝试其他关键词</div>
              </div>
            )}
          </div>

          {/* 底部操作 */}
          {onOpenAgentSettings && (
            <div className="cdf-agent-switcher__footer">
              <button
                className="cdf-agent-switcher__manage-btn"
                onClick={() => {
                  onOpenAgentSettings();
                  setIsOpen(false);
                  setSearchQuery('');
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                管理 Agent
              </button>
            </div>
          )}

          {/* 快捷键提示 */}
          <div className="cdf-agent-switcher__hint">
            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> 切换 Agent · <kbd>Esc</kbd> 关闭
          </div>
        </div>
      )}
    </div>
  );
});

AgentSwitcher.displayName = 'AgentSwitcher';

// ===================== Agent 列表项组件 =====================

interface AgentListItemProps {
  agent: AgentIdentity;
  isSelected: boolean;
  onSelect: (agent: AgentIdentity) => void;
}

const AgentListItem: React.FC<AgentListItemProps> = memo(function AgentListItem({
  agent,
  isSelected,
  onSelect,
}) {
  const colors = ROLE_COLORS[agent.role];
  const isDisabled = agent.enabled === false;

  return (
    <div
      className={`cdf-agent-switcher__item ${isSelected ? 'cdf-agent-switcher__item--selected' : ''} ${isDisabled ? 'cdf-agent-switcher__item--disabled' : ''}`}
      onClick={() => !isDisabled && onSelect(agent)}
      role="option"
      aria-selected={isSelected}
    >
      <AgentAvatar agent={agent} size={36} showTooltip={false} />
      <div className="cdf-agent-switcher__item-info">
        <div className="cdf-agent-switcher__item-name-row">
          <span className="cdf-agent-switcher__item-name">{agent.name}</span>
          <span
            className="cdf-agent-switcher__item-role"
            style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
          >
            {ROLE_LABELS[agent.role]}
          </span>
          {agent.isDefault && (
            <span className="cdf-agent-switcher__item-default">默认</span>
          )}
          {isDisabled && (
            <span className="cdf-agent-switcher__item-disabled-badge">不可用</span>
          )}
        </div>
        <div className="cdf-agent-switcher__item-desc">{agent.description}</div>
        {agent.capabilities && agent.capabilities.length > 0 && (
          <div className="cdf-agent-switcher__item-caps">
            {agent.capabilities.slice(0, 3).map((cap) => (
              <span key={cap} className="cdf-agent-switcher__item-cap">
                {cap}
              </span>
            ))}
            {agent.capabilities.length > 3 && (
              <span className="cdf-agent-switcher__item-cap-more">+{agent.capabilities.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {isSelected && (
        <svg
          className="cdf-agent-switcher__item-check"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={ACCENT}
        >
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      )}
    </div>
  );
});

AgentListItem.displayName = 'AgentListItem';

// ===================== 适配层：用于 ChatThread =====================

import type { RefObject } from 'react';

export interface AgentSwitcherWrapperProps {
  currentAgentId: string;
  onSelectAgent: (agentId: string) => void;
  onClose: () => void;
  anchorRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * AgentSwitcher 包装组件 — 用于 ChatThread
 * 将 currentAgentId 转换为 AgentIdentity
 */
export const AgentSwitcherWrapper: React.FC<AgentSwitcherWrapperProps> = memo(function AgentSwitcherWrapper({
  currentAgentId,
  onSelectAgent,
  onClose,
  anchorRef,
}) {
  const currentAgent = AGENT_SCENARIOS.find((a) => a.id === currentAgentId) || AGENT_SCENARIOS[0];

  const handleAgentChange = useCallback(
    (agent: AgentIdentity) => {
      onSelectAgent(agent.id);
    },
    [onSelectAgent]
  );

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [anchorRef, onClose]);

  // 定位面板
  const anchorRect = anchorRef?.current?.getBoundingClientRect();
  const top = anchorRect ? anchorRect.bottom + 8 : 0;
  const right = anchorRect ? window.innerWidth - anchorRect.right - 16 : 16;

  return (
    <div
      className="agent-switcher"
      style={{
        position: 'fixed',
        top: `${top}px`,
        right: `${right}px`,
      }}
    >
      <div className="agent-switcher__content">
        {['expert', 'analysis', 'operator', 'general'].map((role) => {
          const roleAgents = AGENT_SCENARIOS.filter((a) => a.role === role);
          if (roleAgents.length === 0) return null;

          return (
            <div key={role} className="agent-switcher__group">
              <div className="agent-switcher__group-title">{ROLE_LABELS[role as keyof typeof ROLE_LABELS]}</div>
              {roleAgents.map((agent) => (
                <div
                  key={agent.id}
                  className={`agent-switcher__item ${agent.id === currentAgentId ? 'agent-switcher__item--active' : ''}`}
                  onClick={() => handleAgentChange(agent)}
                >
                  <div className={`agent-switcher__avatar agent-switcher__avatar--${agent.role}`}>
                    {agent.emoji}
                  </div>
                  <div className="agent-switcher__info">
                    <div className="agent-switcher__name">
                      {agent.name}
                      {agent.id === currentAgentId && <span className="agent-switcher__name-check">✓</span>}
                      <span className={`agent-switcher__role agent-switcher__role--${agent.role}`}>
                        {ROLE_LABELS[agent.role]}
                      </span>
                    </div>
                    <div className="agent-switcher__desc">{agent.description}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="agent-switcher__footer">
        <div className="agent-switcher__shortcut">
          <span>快捷键</span>
          <span className="agent-switcher__kbd">Ctrl</span>
          <span>+</span>
          <span className="agent-switcher__kbd">Shift</span>
          <span>+</span>
          <span className="agent-switcher__kbd">A</span>
        </div>
      </div>
    </div>
  );
});

AgentSwitcherWrapper.displayName = 'AgentSwitcherWrapper';

export default AgentSwitcher;
