import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Chip, Typography, Popover, useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { useChat } from '../../hooks/useChat';
import { getGrayScale } from '../../constants/theme';
import { Skill, SkillSuggestionItem, INTENT_CATEGORY_LABELS, INTENT_QUICK_EXAMPLES } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import type { IntentCategory } from '../../types/skill';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import SkillSuggestionPopover from './SkillSuggestionPopover';
import type { PopoverSuggestion } from './SkillSuggestionPopover';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useModels } from '../../contexts/ModelsContext';
import ChatToolbar from './ChatToolbar';
import AISettingsDialog from '../Layout/AISettingsDialog';
import { SessionReferenceSelector } from './SessionReferenceSelector';
// T05: 语义匹配集成
import { matchSkills, submitMatchFeedback, loadLocalMatchConfig, DEFAULT_MATCH_ENGINE_CONFIG, type MatchFeedback } from '../../services/matchingApi';
import SkillMatchResult, { type SemanticMatchResult } from '../Matching/SkillMatchResult';
import MatchFeedbackWidget from '../Matching/MatchFeedbackWidget';
import type { MatchEngineConfig } from '../../services/matchingApi';

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

// ===================== T05: 语义匹配辅助 =====================

/** 加载匹配配置（合并 localStorage 前端扩展字段） */
function loadMatchEngineConfig(): MatchEngineConfig {
  const localConfig = loadLocalMatchConfig();
  return { ...DEFAULT_MATCH_ENGINE_CONFIG, ...localConfig };
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
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const { models: modelList } = useModels();
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

  // T05: 语义匹配状态
  const [matchCandidates, setMatchCandidates] = useState<SemanticMatchResult[]>([]);
  const [showMatchCandidates, setShowMatchCandidates] = useState(false);
  const [semanticMatching, setSemanticMatching] = useState(false);
  const [showMatchFeedback, setShowMatchFeedback] = useState(false);
  const [lastMatchResult, setLastMatchResult] = useState<{ skillId: string; skillName: string; confidence: number; input: string } | null>(null);

  // v1.7.0: 意图分类 Popover 状态
  const [intentAnchorEl, setIntentAnchorEl] = useState<HTMLElement | null>(null);
  const [expandedIntent, setExpandedIntent] = useState<IntentCategory | null>(null);

  // 当 initialSkill 从外部变化时同步到 selectedSkill（如 SkillDetailPage 跳转过来）
  useEffect(() => {
    if (initialSkill) setSelectedSkill(initialSkill);
  }, [initialSkill]);

  // v1.7.0: 技能切换时清理意图分类状态
  useEffect(() => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  }, [selectedSkill?.id]);

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

  // 从 ModelsContext 中读取模型列表（仅启用的模型），Auto 作为首选项
  const MODEL_OPTIONS: import('./ChatToolbar').ModelOption[] = [
    { id: 'auto', name: 'Auto', provider: 'auto', description: '根据任务自动选择最合适的模型' },
    ...modelList
      .filter((m) => m.enabled)
      .map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        description: m.description,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        isDefault: m.isDefault,
        enabled: m.enabled,
      })),
  ];

  // 获取已启用的模型列表（含 id 和 name，用于 id↔name 映射）
  const enabledModels = modelList.filter((m) => m.enabled);

  // 初始化选中的模型（默认 Auto）
  const [selectedModel, setSelectedModel] = useState('Auto');
  const [selectedModelId, setSelectedModelId] = useState('auto');
  const [selectedPermission, setSelectedPermission] = useState('默认权限');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [showAISettings, setShowAISettings] = useState(false);

  /** 模型切换：Auto 模式发送 "auto"，其他按名称匹配 ID */
  const handleModelChange = useCallback((name: string) => {
    setSelectedModel(name);
    if (name === 'Auto') {
      setSelectedModelId('auto');
      onSessionUpdate({ ...session, model: 'auto' });
    } else {
      const found = enabledModels.find((m) => m.name === name);
      const modelId = found?.id || name;
      setSelectedModelId(modelId);
      onSessionUpdate({ ...session, model: modelId });
    }
  }, [enabledModels, session, onSessionUpdate]);

  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false); // 手动追踪 IME 组合状态（WKWebView 中 isComposing 不可靠）

  const { isLoading, sendMessage, stopGeneration } = useChat(
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
        // T05: 关闭语义匹配候选
        setShowMatchCandidates(false);
        setMatchCandidates([]);
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

  // ===================== T05: 语义匹配核心逻辑 =====================

  /** 语义匹配 — 调用后端 /api/matching/match */
  const handleSemanticMatch = useCallback(async (input: string): Promise<Skill | null> => {
    const config = loadMatchEngineConfig();
    try {
      setSemanticMatching(true);
      const response = await matchSkills(input, {
        topK: 5,
        mode: 'hybrid',
      });

      if (response.results && response.results.length > 0) {
        const topMatch = response.results[0];
        // 将后端 MatchResult 转换为前端 SemanticMatchResult
        const matchResults: SemanticMatchResult[] = response.results.map(r => ({
          skillId: r.skillId,
          skillName: r.skillName,
          confidence: r.score,
          reasons: r.reasons,
          matchMode: r.matchMode,
        }));

        if (topMatch.score >= config.autoActivateThreshold) {
          // 高置信度：自动激活
          const skill = getAllSkills().find(s => s.id === topMatch.skillId);
          if (skill) {
            setLastMatchResult({
              skillId: skill.id,
              skillName: skill.name,
              confidence: topMatch.score,
              input,
            });
            setShowMatchFeedback(true);
            return skill;
          }
        } else if (topMatch.score >= config.candidateThreshold) {
          // 中置信度：展示候选列表
          setMatchCandidates(matchResults);
          setShowMatchCandidates(true);
          return null;
        }
        // 低置信度：降级到关键词匹配
      }
      return null;
    } catch (err) {
      console.warn('[SemanticMatch] 语义匹配失败，降级到关键词匹配:', err);
      return null;
    } finally {
      setSemanticMatching(false);
    }
  }, []);

  /** 从语义匹配候选列表中选择技能 */
  const handleMatchCandidateSelect = (skillId: string) => {
    const skill = getAllSkills().find(s => s.id === skillId);
    if (skill) {
      handleSkillSelect(skill);
      setAutoMatched(true);
      // 记录匹配结果用于反馈
      const candidate = matchCandidates.find(m => m.skillId === skillId);
      if (candidate) {
        setLastMatchResult({
          skillId,
          skillName: candidate.skillName,
          confidence: candidate.confidence,
          input: inputValue,
        });
        setShowMatchFeedback(true);
      }
    }
    setShowMatchCandidates(false);
    setMatchCandidates([]);
  };

  /** 关闭语义匹配候选列表 */
  const handleMatchCandidateDismiss = () => {
    setShowMatchCandidates(false);
    setMatchCandidates([]);
  };

  /** 提交匹配反馈 */
  const handleMatchFeedbackSubmit = (feedback: MatchFeedback) => {
    submitMatchFeedback(feedback).catch(err => {
      console.warn('[MatchFeedback] 提交反馈失败:', err);
    });
  };

  // ===================== v1.7.0: 意图分类 =====================

  /** 意图分类颜色映射 */
  const INTENT_COLORS: Record<IntentCategory, { bg: string; border: string; text: string }> = {
    inventory_detail: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    inbound_outbound_trend: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
    replenishment_analysis: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    alert_summary: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    prediction_analysis: { bg: '#FAF5FF', border: '#DDD6FE', text: '#6D28D9' },
  };

  /** 点击意图分类 Chip — 切换 Popover */
  const handleIntentChipClick = (intent: IntentCategory, event: React.MouseEvent<HTMLElement>) => {
    if (expandedIntent === intent) {
      setIntentAnchorEl(null);
      setExpandedIntent(null);
    } else {
      setIntentAnchorEl(event.currentTarget);
      setExpandedIntent(intent);
    }
  };

  /** 关闭意图 Popover */
  const handleIntentPopoverClose = () => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  };

  /** 点击快捷示例 — 自动填入输入框并发送 */
  const handleQuickExampleClick = (text: string) => {
    setInputValue(text);
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setIntentAnchorEl(null);
    setExpandedIntent(null);
    handleSend(text);
  };

  const handleSend = (overrideText?: string) => {
    const effectiveInput = overrideText ?? inputValue;
    if (!effectiveInput.trim() || isLoading || semanticMatching) return;

    // T05: 如果以 / 或 @ 开头，不触发发送（等用户完成选择）
    const trimmedInput = effectiveInput.trimStart();
    if (trimmedInput.startsWith('/') || trimmedInput.startsWith('@')) {
      return;
    }

    // 关闭建议浮层
    setSuggestionOpen(false);
    setSuggestions([]);
    // T05: 关闭语义匹配候选
    setShowMatchCandidates(false);
    setMatchCandidates([]);

    // ====== Skills 自动调度（首次 + 多轮持续调度）======
    let effectiveSkill = selectedSkill;
    const isAutoMatched = autoMatched; // 当前技能是否是自动匹配的

    // 1. 如果当前有自动匹配的技能，检测输入是否匹配新技能 → 切换或退出
    if (isAutoMatched && effectiveSkill) {
      const newKeywordMatch = matchSkillFromInput(effectiveInput);
      if (newKeywordMatch && newKeywordMatch.id !== effectiveSkill.id) {
        // 输入匹配到新技能 → 自动切换
        effectiveSkill = newKeywordMatch;
        setSelectedSkill(newKeywordMatch);
        setAutoMatched(true);
      } else if (!newKeywordMatch && !matchSkillFromInput(effectiveInput)) {
        // 输入不再匹配任何技能 → 自动退出
        // 但保留当前技能上下文，让对话自然过渡
      }
    }

    // 2. 未选择技能时（首次输入或多轮中技能已退出）→ 自动匹配
    if (!effectiveSkill) {
      const hasConflictedSuggestion = suggestions.some(s => s.isConflicted);
      if (!hasConflictedSuggestion) {
        // 先尝试关键词匹配（同步）
        const keywordMatched = matchSkillFromInput(effectiveInput);
        if (keywordMatched) {
          effectiveSkill = keywordMatched;
          setSelectedSkill(keywordMatched);
          setAutoMatched(true);
        }

        // 关键词未命中时，异步尝试语义匹配
        if (!keywordMatched) {
          handleSemanticMatch(effectiveInput).then(semanticSkill => {
            if (semanticSkill && !selectedSkill) {
              setSelectedSkill(semanticSkill);
              setAutoMatched(true);
            }
          }).catch(() => {});
        }
      }
    }

    // 3. hybrid 模式：先执行导航，再进入对话
    if (effectiveSkill?.executionMode === 'hybrid') {
      const navPath = effectiveSkill.path;
      if (navPath && navPath !== '/' && navPath !== '') {
        // 使用前端路由导航
        navigate(navPath);
      }
      // hybrid 模式下保留技能上下文，继续对话
    }

    const skillContext = effectiveSkill?.promptTemplate || undefined;
    const skillId = effectiveSkill?.id || undefined;
    const referencedSessionIds = referencedSessions.map(s => s.id);

    sendMessage(effectiveInput, { skillContext, skillId, referencedSessions, model: selectedModelId, preset: selectedPreset || undefined });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setShowSkillSelector(false);
    setInputExpanded(false);
    setReferencedSessions([]);

    // 4. 执行后处理：chat 模式一次性执行后清除；hybrid/nav 模式保留
    if (effectiveSkill) {
      if (effectiveSkill.executionMode === 'chat') {
        setSelectedSkill(null);
        setAutoMatched(false);
      }
      // 'nav' 和 'hybrid' 模式保留技能状态，支持多轮对话
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
      if (e.key === 'Enter' && !isComposingRef.current) {
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
    if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
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
          border: `1px solid ${gs.border}`,
          bgcolor: gs.bgPanel,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'auto',
        }}
      >
        {/* Selected skill tag */}
        {selectedSkill && (
          <Box sx={{ px: 1.5, py: 0.5, bgcolor: gs.bgPanel, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              icon={<Box component="span" sx={{ display: 'flex', alignItems: 'center', ml: '4px' }}>{ICON_MAP[selectedSkill.icon] || <AutoFixHighIcon sx={{ fontSize: 14 }} />}</Box>}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <span>{selectedSkill.name}</span>
                  {autoMatched && (
                    <Typography component="span" sx={{ fontSize: 9, color: gs.textMuted, fontWeight: 500, bgcolor: gs.bgHover, px: 0.5, borderRadius: 0.5 }}>
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
        {/* v1.7.0: 意图分类 Chips 行 — 仅当选中技能有 intentCategories 时展示 */}
        {selectedSkill?.intentCategories && selectedSkill.intentCategories.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.75, bgcolor: gs.bgPanel, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 11, color: gs.textMuted, fontWeight: 500, mr: 0.25, flexShrink: 0 }}>
              查询意图
            </Typography>
            {selectedSkill.intentCategories.map((intent) => {
              const colors = INTENT_COLORS[intent];
              const isActive = expandedIntent === intent;
              return (
                <Chip
                  key={intent}
                  label={INTENT_CATEGORY_LABELS[intent]}
                  onClick={(e) => handleIntentChipClick(intent, e)}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: 11,
                    fontWeight: isActive ? 600 : 400,
                    bgcolor: isActive ? colors.bg : gs.bgHover,
                    border: `1px solid ${isActive ? colors.border : gs.border}`,
                    color: isActive ? colors.text : gs.textMuted,
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: colors.bg,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                    '& .MuiChip-label': { px: 1.25 },
                    transition: 'all 0.15s ease',
                  }}
                />
              );
            })}
          </Box>
        )}
        {/* Referenced sessions chips */}
        {referencedSessions.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.5, bgcolor: gs.bgPanel, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
            bgcolor: isDark ? '#1E3A8A' : '#EFF6FF', lineHeight: 1.4, opacity: showAutoTip ? 1 : 0,
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
                <Typography sx={{ fontSize: 15, color: gs.textMuted, lineHeight: 1.4 }}>
                  今天帮你做些什么？
                </Typography>
                <Typography sx={{ fontSize: 13, color: gs.textDisabled, lineHeight: 1.4 }}>
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
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; }}
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  minHeight: 60,
                  outline: 'none',
                  color: gs.textPrimary,
                  width: '100%',
                  wordBreak: 'break-word',
                  marginBottom: 8,
                  whiteSpace: 'pre-wrap',
                }}
              />
              {!inputValue.trim() && (
                <div style={{
                  fontSize: 13,
                  color: gs.textDisabled,
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
          onModelChange={handleModelChange}
          selectedPermission={selectedPermission}
          onPermissionChange={setSelectedPermission}
          selectedPreset={selectedPreset}
          onPresetChange={setSelectedPreset}
          isLoading={isLoading}
          inputValue={inputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          onSkillSelect={handleSkillSelect}
          modelOptions={MODEL_OPTIONS}
          onOpenAISettings={() => setShowAISettings(true)}
        />
      </Paper>

      {/* AI 设置弹窗（模型管理） */}
      <AISettingsDialog
        open={showAISettings}
        onClose={() => setShowAISettings(false)}
      />

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

      {/* T05: 语义匹配候选列表 */}
      {showMatchCandidates && matchCandidates.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            mb: 1,
            zIndex: 1300,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <SkillMatchResult
            matches={matchCandidates}
            onSelect={handleMatchCandidateSelect}
            onDismiss={handleMatchCandidateDismiss}
          />
        </Box>
      )}

      {/* T05: 匹配反馈组件 */}
      {showMatchFeedback && lastMatchResult && selectedSkill && (
        <Box sx={{ mt: 0.5 }}>
          <MatchFeedbackWidget
            userInput={lastMatchResult.input}
            matchedSkillId={lastMatchResult.skillId}
            matchedSkillName={lastMatchResult.skillName}
            confidence={lastMatchResult.confidence}
            onSubmit={handleMatchFeedbackSubmit}
          />
        </Box>
      )}

      {/* v1.7.0: 意图分类快捷示例 Popover */}
      <Popover
        open={!!intentAnchorEl && !!expandedIntent}
        anchorEl={intentAnchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        onClose={handleIntentPopoverClose}
        disableAutoFocus
        slotProps={{
          paper: {
            elevation: 0,
            sx: {
              mt: 0.5,
              borderRadius: '10px',
              border: '1px solid #E5E7EB',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              minWidth: 240,
              maxWidth: 340,
            },
          },
        }}
      >
        {expandedIntent && (
          <Box>
            {/* 标题行 */}
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #F3F4F6' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: INTENT_COLORS[expandedIntent].text }}>
                {INTENT_CATEGORY_LABELS[expandedIntent]}
              </Typography>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.25 }}>
                点击示例快速查询
              </Typography>
            </Box>
            {/* 快捷示例列表 */}
            <Box sx={{ py: 0.5 }}>
              {(INTENT_QUICK_EXAMPLES[expandedIntent] || []).map((example, idx) => (
                <Box
                  key={idx}
                  onClick={() => handleQuickExampleClick(example.text)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 2,
                    py: 1,
                    cursor: 'pointer',
                    transition: 'background-color 0.15s ease',
                    '&:hover': { bgcolor: gs.bgHover },
                    '&:not(:last-child)': { borderBottom: `1px solid ${gs.border}` },
                  }}
                >
                  {/* 图标 */}
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      bgcolor: INTENT_COLORS[expandedIntent].bg,
                      color: INTENT_COLORS[expandedIntent].text,
                      '& .MuiSvgIcon-root': { fontSize: 14 },
                    }}
                  >
                    {ICON_MAP[example.icon] || <AutoFixHighIcon sx={{ fontSize: 14 }} />}
                  </Box>
                  {/* 文本 */}
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      color: '#374151',
                      lineHeight: 1.4,
                    }}
                  >
                    {example.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  );
}
