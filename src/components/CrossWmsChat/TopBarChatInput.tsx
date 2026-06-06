import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Paper, Chip, Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useChat } from '../../hooks/useChat';
import { Skill, SkillSuggestionItem } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import SkillSuggestionPopover from './SkillSuggestionPopover';
import type { PopoverSuggestion } from './SkillSuggestionPopover';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import ChatToolbar from './ChatToolbar';
import MemoryDialog, { type MemoryDialogHandle } from './MemoryDialog';
import { SessionReferenceSelector } from './SessionReferenceSelector';

// ===================== Skill Auto-Match =====================

/** 简易模糊匹配：字符依次出现即算部分匹配（0~1） */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return 1;
  if (t.startsWith(q)) return 0.9;
  const qWords = q.split(/\s+/);
  const tWords = t.split(/\s+/);
  let max = 0;
  for (const qw of qWords) {
    for (const tw of tWords) {
      if (tw.includes(qw)) { max = Math.max(max, qw.length / (tw.length || 1)); }
    }
  }
  if (max > 0) return Math.max(max, 0.5);
  let i = 0;
  for (const c of q) {
    const idx = t.indexOf(c, i);
    if (idx === -1) return 0;
    i = idx + 1;
  }
  return 0.4;
}

/**
 * 根据用户输入文本自动匹配最佳技能（模糊匹配版）
 * trigger/tags/name 均使用模糊匹配，加权记分
 * 自动激活阈值提升至 3 分（降低误触发率）
 */
function matchSkillFromInput(input: string): Skill | null {
  if (!input.trim()) return null;
  const text = input.toLowerCase();
  const words = text.split(/\s+/);
  const activeSkills = getAllSkills().filter(s => s.status === 'active' && s.promptTemplate);

  let bestSkill: Skill | null = null;
  let bestScore = 0;

  for (const skill of activeSkills) {
    let score = 0;

    if (skill.trigger) {
      const triggers = skill.trigger.split('/').map(t => t.trim()).filter(Boolean);
      for (const kw of triggers) {
        const sim = fuzzyMatch(kw, text);
        if (sim >= 0.8 && kw.length >= 2) {
          score += sim >= 1 ? 3 : 2;
          if (words[0] && fuzzyMatch(words[0], kw) >= 0.8) score += 1;
        }
      }
    }

    if (skill.tags) {
      for (const tag of skill.tags) {
        const sim = fuzzyMatch(tag, text);
        if (sim >= 0.7) score += sim >= 0.9 ? 2 : 1;
      }
    }

    const nameSim = fuzzyMatch(skill.name, text);
    if (nameSim >= 0.6) {
      score += nameSim >= 1 ? 4 : nameSim >= 0.8 ? 3 : 2;
    }

    if (skill.desc) {
      const descSim = fuzzyMatch(skill.desc.slice(0, 20), text);
      if (descSim >= 0.8) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  return bestScore >= 3 ? bestSkill : null;
}

// ===================== Skill Suggestions (Popover) =====================

/**
 * 根据用户输入匹配技能建议（模糊匹配，阈值 1.5）
 * 用于在输入框下方显示建议浮层
 * T04: 当多个候选得分接近（差距 < 30%）时，标记 isConflicted
 */
function matchSkillSuggestions(input: string): PopoverSuggestion[] {
  if (!input.trim() || input.length < 3) return [];

  const activeSkills = getAllSkills().filter(s => s.status === 'active');
  const results: PopoverSuggestion[] = [];

  for (const skill of activeSkills) {
    let score = 0;
    const reasons: string[] = [];

    // 名称匹配
    const nameScore = fuzzyMatch(skill.name, input);
    if (nameScore > 0) {
      score += nameScore * 1.5;
      if (nameScore >= 0.8) reasons.push('名称匹配');
    }

    // 触发词匹配
    if (skill.trigger) {
      const trigScore = fuzzyMatch(skill.trigger, input);
      if (trigScore > 0) {
        score += trigScore * 1.2;
        if (trigScore >= 0.6) reasons.push('触发词匹配');
      }
    }

    // 标签匹配
    if (skill.tags) {
      for (const tag of skill.tags) {
        const tagScore = fuzzyMatch(tag, input);
        if (tagScore >= 0.7) {
          score += 1;
          reasons.push(`标签: ${tag}`);
          break;
        }
      }
    }

    // 描述匹配
    if (skill.desc) {
      const descScore = fuzzyMatch(skill.desc, input);
      if (descScore >= 0.5) {
        score += 0.5;
      }
    }

    if (score >= 1.5) {
      results.push({
        suggestion: {
          id: skill.id,
          name: skill.name,
          matchScore: score,
          reason: reasons.join('; ') || '综合匹配',
        },
        skill,
        isConflicted: false, // 初始化，下面统一标记
      });
    }
  }

  // 按 matchScore 降序，取前 3
  const sorted = results
    .sort((a, b) => b.suggestion.matchScore - a.suggestion.matchScore)
    .slice(0, 3);

  // T04: 检测冲突 — 前两项得分差距 < 30%，标记所有冲突项
  if (sorted.length >= 2) {
    const top1 = sorted[0].suggestion.matchScore;
    const top2 = sorted[1].suggestion.matchScore;
    if (top1 > 0 && (top1 - top2) / top1 < 0.3) {
      // 前两项得分接近，标记所有冲突项
      for (const item of sorted) {
        item.isConflicted = true;
      }
    }
  }

  return sorted;
}

/**
 * 检查建议列表前两项是否冲突（得分差距 < 30%）
 * @deprecated 冲突标记已内嵌到 PopoverSuggestion.isConflicted，此函数仅保留兼容
 */
function checkSuggestionConflict(suggestions: PopoverSuggestion[]): boolean {
  if (suggestions.length < 2) return false;
  const top1 = suggestions[0].suggestion.matchScore;
  const top2 = suggestions[1].suggestion.matchScore;
  if (top1 <= 0) return false;
  const gap = (top1 - top2) / top1;
  return gap < 0.3;
}

// ===================== Props =====================

interface TopBarChatInputProps {
  session: {
    id: string;
    title: string;
    model: string;
    messages: {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      timestamp: Date;
    }[];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSessionUpdate: (session: any) => void;
  /** 从外部注入的初始技能（如从 URL 参数解析） */
  initialSkill?: Skill | null;
}

// ===================== Component =====================

export function TopBarChatInput({ session, onSessionUpdate, initialSkill }: TopBarChatInputProps) {
  const { settings } = useAppSettings();
  const [inputExpanded, setInputExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(initialSkill ?? null);
  const [inputValue, setInputValue] = useState('');
  const [skillFocusIndex, setSkillFocusIndex] = useState(-1);
  const [autoMatched, setAutoMatched] = useState(false); // 标记技能是自动匹配的
  const [showAutoTip, setShowAutoTip] = useState(false); // 自动匹配提示文字

  // T03: 技能建议浮层状态
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PopoverSuggestion[]>([]);

  // 会话引用状态
  const [showSessionReference, setShowSessionReference] = useState(false);
  const [referencedSessions, setReferencedSessions] = useState<Array<{ id: string; title: string }>>([]);

  // 当 initialSkill 从外部变化时同步到 selectedSkill（如 SkillDetailPage 跳转过来）
  useEffect(() => {
    if (initialSkill) setSelectedSkill(initialSkill);
  }, [initialSkill]);

  // 自动匹配成功时显示内联提示，2s 后自动消失
  useEffect(() => {
    if (autoMatched && selectedSkill) {
      setShowAutoTip(true);
      const timer = setTimeout(() => setShowAutoTip(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [autoMatched, selectedSkill]);

  // 获取当前斜杠命令过滤后的技能列表（用于键盘导航）
  const slashFilteredCount = (() => {
    if (!showSkillSelector) return 0;
    const allSkills = getAllSkills().filter(s => s.status === 'active');
    const q = slashQuery.toLowerCase();
    return allSkills.filter(skill =>
      skill.name.toLowerCase().includes(q) ||
      skill.desc.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q) ||
      (skill.trigger || '').toLowerCase().includes(q) ||
      (skill.tags || []).some(t => t.toLowerCase().includes(q))
    ).length;
  })();

  // 从 settings 中读取模型列表（仅启用的模型）
  const MODEL_OPTIONS = settings.models.models
    .filter((m) => m.enabled)
    .map((m) => m.name);

  // 初始化选中的模型（优先使用默认模型）
  const [selectedModel, setSelectedModel] = useState(() => {
    const defaultModel = settings.models.models.find((m) => m.id === settings.models.defaultModelId);
    return defaultModel?.name || MODEL_OPTIONS[0] || 'GPT-4';
  });
  const [selectedPermission, setSelectedPermission] = useState('默认权限');

  const memoryDialogRef = useRef<MemoryDialogHandle>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isLoading, sendMessage } = useChat(
    session?.id ? session : undefined,
    onSessionUpdate
  );

  // Click outside to collapse input area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSkills(false);
        setShowSkillSelector(false);
        setShowSessionReference(false);
        setSuggestionOpen(false);
        if (!inputValue.trim()) {
          setInputExpanded(false);
          if (editableRef.current) {
            editableRef.current.innerHTML = '';
          }
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  const handleInputChange = useCallback(() => {
    const text = editableRef.current?.innerText || '';
    setInputValue(text);

    // T05: 互斥逻辑 — 当输入以 / 或 @ 开头时，不触发建议浮层
    const currentLine = text.split('\n').pop() || '';
    const trimmedLine = currentLine.trimStart();

    if (currentLine.startsWith('/')) {
      const query = currentLine.slice(1).trim();
      setSlashQuery(query);
      setShowSkillSelector(true);
      setShowSkills(false);
      setShowSessionReference(false);
      setSkillFocusIndex(-1);
      // T05: @/selectors 与 suggestionOpen 互斥
      setSuggestionOpen(false);
      setSuggestions([]);
    } else if (text.endsWith('@')) {
      // 输入"@"时显示会话引用选择器
      setShowSessionReference(true);
      setShowSkills(false);
      setShowSkillSelector(false);
      setSkillFocusIndex(-1);
      // T05: @/selectors 与 suggestionOpen 互斥
      setSuggestionOpen(false);
      setSuggestions([]);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
      setSkillFocusIndex(-1);

      // T05: 不在 / 或 @ 模式下，且输入以 / 或 @ 开头时不触发建议浮层
      const isSlashOrAt = trimmedLine.startsWith('/') || trimmedLine.startsWith('@');

      // T03: 技能建议 — 输入 >= 3 字符且未激活技能时触发
      // T05: 当 showSkills 或 showSkillSelector 为 true 时，suggestionOpen 设为 false
      if (text.length >= 3 && !selectedSkill && !isSlashOrAt) {
        const matched = matchSkillSuggestions(text);
        setSuggestions(matched);
        setSuggestionOpen(matched.length > 0 && !showSkills && !showSkillSelector);
      } else {
        setSuggestionOpen(false);
        setSuggestions([]);
      }
    }
  }, [showSkills, showSkillSelector, selectedSkill]);

  const handleInputClick = () => {
    if (!inputExpanded) {
      setInputExpanded(true);
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }, 0);
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    setSelectedSkill(skill);
    setShowSkills(false);
    setShowSkillSelector(false);
    setSuggestionOpen(false);
    setSuggestions([]);
    if (editableRef.current) {
      if (inputValue.includes('/')) {
        const lines = inputValue.split('\n');
        const lastLine = lines[lines.length - 1];
        if (lastLine.startsWith('/')) {
          lines[lines.length - 1] = '';
        }
        editableRef.current.innerText = lines.join('\n');
      }
      setInputValue(editableRef.current.innerText);
      setTimeout(() => {
        if (editableRef.current) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
          editableRef.current.focus();
        }
      }, 0);
    }
  };

  /** T04: 从建议浮层中选择技能 — 冲突项也允许手动选择 */
  const handleSuggestionSelect = (skill: Skill) => {
    setSuggestionOpen(false);
    setSuggestions([]);
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    handleSkillSelect(skill);
  };

  /** 从会话引用选择器中选择会话 */
  const handleSessionSelect = (session: { id: string; title: string }) => {
    setReferencedSessions(prev => {
      // 避免重复引用同一会话
      if (prev.some(s => s.id === session.id)) return prev;
      return [...prev, session];
    });
    setShowSessionReference(false);
    // 聚焦到输入框
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.focus();
      }
    }, 0);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;

    // T05: 如果以 / 或 @ 开头，不触发发送（等用户完成选择）
    const trimmedInput = inputValue.trimStart();
    if (trimmedInput.startsWith('/') || trimmedInput.startsWith('@')) {
      return;
    }

    // 关闭建议浮层
    setSuggestionOpen(false);
    setSuggestions([]);

    // 首次输入且未手动选择技能 → 自动匹配
    // T04: 当建议浮层存在冲突（isConflicted）时，不自动激活
    let effectiveSkill = selectedSkill;
    if (!selectedSkill && session.messages.length === 0) {
      const hasConflictedSuggestion = suggestions.some(s => s.isConflicted);
      if (!hasConflictedSuggestion) {
        const matched = matchSkillFromInput(inputValue);
        if (matched) {
          effectiveSkill = matched;
          setSelectedSkill(matched);
          setAutoMatched(true);
        }
      }
    }

    const skillContext = effectiveSkill?.promptTemplate || undefined;
    const skillId = effectiveSkill?.id || undefined;
    const referencedSessionIds = referencedSessions.map(s => s.id);

    sendMessage(inputValue, { skillContext, skillId, referencedSessionIds });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setShowSkillSelector(false);
    setInputExpanded(false);
    setReferencedSessions([]); // 发送后清除引用的会话
    if (effectiveSkill && effectiveSkill.executionMode === 'chat') {
      setSelectedSkill(null);
      setAutoMatched(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSkillSelector) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSkillSelector(false);
        setSkillFocusIndex(-1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSkillFocusIndex(prev => slashFilteredCount > 0 ? (prev + 1) % slashFilteredCount : -1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSkillFocusIndex(prev => prev <= 0 ? slashFilteredCount - 1 : prev - 1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (skillFocusIndex >= 0 && skillFocusIndex < slashFilteredCount) {
          const allSkills = getAllSkills().filter(s => s.status === 'active');
          const q = slashQuery.toLowerCase();
          const filtered = allSkills.filter(skill =>
            skill.name.toLowerCase().includes(q) ||
            skill.desc.toLowerCase().includes(q) ||
            skill.category.toLowerCase().includes(q) ||
            (skill.trigger || '').toLowerCase().includes(q) ||
            (skill.tags || []).some(t => t.toLowerCase().includes(q))
          );
          if (filtered[skillFocusIndex]) {
            handleSkillSelect(filtered[skillFocusIndex]);
          }
        } else {
          handleSend();
        }
        setSkillFocusIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ---- Render ----

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        pr: 1.25,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          borderRadius: '12px',
          border: '1px solid #eee',
          bgcolor: '#fff',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'auto',
        }}
      >
        {/* Selected skill tag */}
        {selectedSkill && (
          <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderBottom: `1px solid #eee`, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              icon={<Box component="span" sx={{ display: 'flex', alignItems: 'center', ml: '4px' }}>{ICON_MAP[selectedSkill.icon] || <AutoFixHighIcon sx={{ fontSize: 14 }} />}</Box>}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{selectedSkill.name}</span>
                  {autoMatched && (
                    <Typography component="span" sx={{ fontSize: 9, color: '#6B7280', fontWeight: 500, bgcolor: '#F3F4F6', px: 0.5, borderRadius: 0.5 }}>
                      自动
                    </Typography>
                  )}
                  {selectedSkill.promptTemplate && !autoMatched && (
                    <Typography component="span" sx={{ fontSize: 9, color: '#7C3AED', fontWeight: 600, bgcolor: '#FAF5FF', px: 0.5, borderRadius: 0.5 }}>
                      AI
                    </Typography>
                  )}
                </Box>
              }
              onDelete={() => { setSelectedSkill(null); setAutoMatched(false); }}
              size="small"
              sx={{
                height: 26,
                fontSize: 12,
                bgcolor: autoMatched ? '#F0FDF4' : selectedSkill.promptTemplate ? '#FAF5FF' : '#F3F4F6',
                border: autoMatched ? '1px solid #BBF7D0' : selectedSkill.promptTemplate ? '1px solid #DDD6FE' : '1px solid #E5E7EB',
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Box>
        )}
        {/* Referenced sessions chips */}
        {referencedSessions.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.5, bgcolor: '#fff', borderBottom: `1px solid #eee`, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
            {referencedSessions.map((session) => (
              <Chip
                key={session.id}
                icon={<Box component="span" sx={{ display: 'flex', alignItems: 'center', ml: '4px' }}><ChatBubbleOutlineIcon sx={{ fontSize: 14 }} /></Box>}
                label={session.title}
                onDelete={() => setReferencedSessions(prev => prev.filter(s => s.id !== session.id))}
                size="small"
                sx={{
                  height: 26,
                  fontSize: 12,
                  bgcolor: '#EFF6FF',
                  border: '1px solid #BFDBFE',
                  '& .MuiChip-label': { px: 1 },
                }}
              />
            ))}
          </Box>
        )}
        {showAutoTip && selectedSkill && (
          <Typography sx={{
            fontSize: 10, color: '#2563EB', px: 1.5, py: 0.5,
            bgcolor: '#EFF6FF', lineHeight: 1.4, opacity: showAutoTip ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}>
            ⚡ 已自动激活「{selectedSkill.name}」技能
          </Typography>
        )}

        {/* Input area */}
        <Box
          onClick={handleInputClick}
          sx={{
            padding: inputExpanded ? '12px 16px' : '8px 16px',
            minHeight: inputExpanded ? 80 : 32,
            display: 'flex',
            flexDirection: 'column',
            cursor: 'text',
            justifyContent: inputExpanded ? 'flex-start' : 'center',
          }}
        >
          {!inputExpanded ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography sx={{ fontSize: 15, color: '#999', lineHeight: 1.4 }}>
                  今天帮你做些什么？
                </Typography>
                <Typography sx={{ fontSize: 13, color: '#bbb', lineHeight: 1.4 }}>
                  @ 引用对话文件，/ 调用技能与指令
                </Typography>
              </Box>
            </Box>
          ) : (
            <>
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  minHeight: 60,
                  outline: 'none',
                  color: '#333',
                  width: '100%',
                  wordBreak: 'break-word',
                  marginBottom: 8,
                  whiteSpace: 'pre-wrap',
                }}
              />
              {!inputValue.trim() && (
                <div style={{
                  fontSize: 13,
                  color: '#bbb',
                  lineHeight: 1.4,
                }}>
                  @ 引用对话文件，/ 调用技能与指令
                </div>
              )}
            </>
          )}
        </Box>

        {/* Toolbar */}
        <ChatToolbar
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedPermission={selectedPermission}
          onPermissionChange={setSelectedPermission}
          isLoading={isLoading}
          inputValue={inputValue}
          onSend={handleSend}
          onOpenMemory={() => memoryDialogRef.current?.open()}
          onSkillSelect={handleSkillSelect}
          modelOptions={MODEL_OPTIONS}
        />
      </Paper>

      {/* T03: 技能建议浮层 — 输入时自动匹配 */}
      <SkillSuggestionPopover
        anchorEl={containerRef.current}
        suggestions={suggestions}
        onSelect={handleSuggestionSelect}
        open={suggestionOpen}
      />

      {/* Skill selector dropdown — @ 触发 */}
      {showSkills && (
        <SkillSelector
          anchorEl={containerRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
        />
      )}

      {/* Skill selector dropdown — / 斜杠命令触发 */}
      {showSkillSelector && (
        <SkillSelector
          anchorEl={containerRef.current}
          onSelect={handleSkillSelect}
          onClose={() => { setShowSkillSelector(false); setSkillFocusIndex(-1); }}
          initialFilter={slashQuery}
          activeOnly
          slashMode
          focusedIndex={skillFocusIndex}
        />
      )}

      {/* Session reference selector — @ 触发 */}
      {showSessionReference && (
        <SessionReferenceSelector
          anchorEl={containerRef.current}
          onSelect={handleSessionSelect}
          onClose={() => setShowSessionReference(false)}
        />
      )}

      {/* Memory dialog */}
      <MemoryDialog ref={memoryDialogRef} />
    </Box>
  );
}
