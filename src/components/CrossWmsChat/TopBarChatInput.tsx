import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Paper, Chip, Typography,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useChat } from '../../hooks/useChat';
import { Skill } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import ChatToolbar from './ChatToolbar';
import MemoryDialog, { type MemoryDialogHandle } from './MemoryDialog';

// ===================== Skill Auto-Match =====================

/**
 * 根据用户输入文本自动匹配最佳技能
 * 匹配策略：遍历所有活跃技能的 trigger 关键词和 tags，
 * 计算匹配分数（trigger 命中=2分，tag 命中=1分），返回最高分技能
 */
function matchSkillFromInput(input: string): Skill | null {
  if (!input.trim()) return null;
  const text = input.toLowerCase();
  const activeSkills = getAllSkills().filter(s => s.status === 'active' && s.promptTemplate);

  let bestSkill: Skill | null = null;
  let bestScore = 0;

  for (const skill of activeSkills) {
    let score = 0;

    // 从 trigger 提取关键词（格式如 "打开仪表盘 / 查看概览"）
    if (skill.trigger) {
      const triggers = skill.trigger.split('/').map(t => t.trim().toLowerCase()).filter(Boolean);
      for (const kw of triggers) {
        if (kw.length >= 2 && text.includes(kw)) {
          score += 2; // trigger 关键词匹配，权重 2
        }
      }
    }

    // 从 tags 匹配
    if (skill.tags) {
      for (const tag of skill.tags) {
        if (tag.length >= 2 && text.includes(tag.toLowerCase())) {
          score += 1; // tag 匹配，权重 1
        }
      }
    }

    // 从名称匹配（精确子串，权重 3）
    if (skill.name.length >= 2 && text.includes(skill.name.toLowerCase())) {
      score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  // 至少需要 2 分才自动激活（避免误匹配）
  return bestScore >= 2 ? bestSkill : null;
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

  // 当 initialSkill 从外部变化时同步到 selectedSkill（如 SkillDetailPage 跳转过来）
  useEffect(() => {
    if (initialSkill) setSelectedSkill(initialSkill);
  }, [initialSkill]);

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

    // 斜杠命令检测：只要当前行以 / 开头就触发
    const currentLine = text.split('\n').pop() || '';
    if (currentLine.startsWith('/')) {
      const query = currentLine.slice(1).trim();
      setSlashQuery(query);
      setShowSkillSelector(true);
      setShowSkills(false);
      setSkillFocusIndex(-1);
    } else if (text.endsWith('@')) {
      setShowSkills(true);
      setShowSkillSelector(false);
      setSkillFocusIndex(-1);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
      setSkillFocusIndex(-1);
    }
  }, []);

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

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;

    // 首次输入且未手动选择技能 → 自动匹配
    let effectiveSkill = selectedSkill;
    if (!selectedSkill && session.messages.length === 0) {
      const matched = matchSkillFromInput(inputValue);
      if (matched) {
        effectiveSkill = matched;
        setSelectedSkill(matched);
        setAutoMatched(true);
      }
    }

    const skillContext = effectiveSkill?.promptTemplate || undefined;
    sendMessage(inputValue, { skillContext });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setShowSkillSelector(false);
    setInputExpanded(false);
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

      {/* Memory dialog */}
      <MemoryDialog ref={memoryDialogRef} />
    </Box>
  );
}
