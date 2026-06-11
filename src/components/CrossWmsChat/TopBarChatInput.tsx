import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Chip, Typography, Popover, useTheme,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ImageIcon from '@mui/icons-material/Image';
import { useChat } from '../../hooks/useChat';
import { getGrayScale } from '../../constants/theme';
import { Skill, SkillSuggestionItem, INTENT_CATEGORY_LABELS, INTENT_QUICK_EXAMPLES } from '../../types/skill';
import { ICON_MAP } from '../../types/skill';
import type { IntentCategory } from '../../types/skill';
import type { Attachment } from '../../types/chat';
import { v4 as uuidv4 } from 'uuid';
import { getAllSkills } from '../../stores/skillStore';
import { useAppSettings } from '../../contexts/AppSettingsContext';
import { useModels } from '../../contexts/ModelsContext';
import ChatToolbar from './ChatToolbar';
import AISettingsDialog from '../Layout/AISettingsDialog';
import { SessionReferenceSelector } from './SessionReferenceSelector';

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
  /** 回复某条消息 */
  replyToMessage?: { messageId: string; content: string; role: 'user' | 'assistant' } | null;
  /** 取消回复 */
  onCancelReply?: () => void;
}

// ===================== Component =====================

export function TopBarChatInput({ session, onSessionUpdate, initialSkill, replyToMessage, onCancelReply }: TopBarChatInputProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = getGrayScale(isDark);
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const { models: modelList } = useModels();
  const [inputExpanded, setInputExpanded] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(initialSkill ?? null);
  const [inputValue, setInputValue] = useState('');
  const [autoMatched, setAutoMatched] = useState(false);

  // 会话引用状态
  const [showSessionReference, setShowSessionReference] = useState(false);
  const [referencedSessions, setReferencedSessions] = useState<Array<{ id: string; title: string }>>([]);

  // v1.7.0: 意图分类 Popover 状态
  const [intentAnchorEl, setIntentAnchorEl] = useState<HTMLElement | null>(null);
  const [expandedIntent, setExpandedIntent] = useState<IntentCategory | null>(null);

  // 附件上传状态
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 当 initialSkill 从外部变化时同步到 selectedSkill（如 SkillDetailPage 跳转过来）
  useEffect(() => {
    if (initialSkill) setSelectedSkill(initialSkill);
  }, [initialSkill]);

  // v1.7.0: 技能切换时清理意图分类状态
  useEffect(() => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  }, [selectedSkill?.id]);

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

  // ===================== 附件上传辅助函数 =====================
  const isImageFile = (file: File) => file.type.startsWith('image/');

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const fileToAttachment = async (file: File): Promise<Attachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: uuidv4(),
          name: file.name,
          type: file.type.startsWith('image/') ? 'image' : 'file',
          url: reader.result as string,
          size: file.size,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newAttachments = await Promise.all(
      Array.from(files).map(fileToAttachment)
    );
    setPendingAttachments(prev => [...prev, ...newAttachments]);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      Promise.all(files.map(fileToAttachment)).then(newAttachments => {
        setPendingAttachments(prev => [...prev, ...newAttachments]);
      });
    }
  };

  // Click outside to collapse input area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSessionReference(false);
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

    if (text.endsWith('@')) {
      setShowSessionReference(true);
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

  /** 从会话引用选择器中选择会话 */
  const handleSessionSelect = (session: { id: string; title: string }) => {
    setReferencedSessions(prev => {
      if (prev.some(s => s.id === session.id)) return prev;
      return [...prev, session];
    });
    setShowSessionReference(false);
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.focus();
      }
    }, 0);
  };

  // ===================== v1.7.0: 意图分类 =====================

  const INTENT_COLORS: Record<IntentCategory, { bg: string; border: string; text: string }> = {
    inventory_detail: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
    inbound_outbound_trend: { bg: '#F0FDF4', border: '#BBF7D0', text: '#15803D' },
    replenishment_analysis: { bg: '#FFF7ED', border: '#FED7AA', text: '#C2410C' },
    alert_summary: { bg: '#FEF2F2', border: '#FECACA', text: '#B91C1C' },
    prediction_analysis: { bg: '#FAF5FF', border: '#DDD6FE', text: '#6D28D9' },
  };

  const handleIntentChipClick = (intent: IntentCategory, event: React.MouseEvent<HTMLElement>) => {
    if (expandedIntent === intent) {
      setIntentAnchorEl(null);
      setExpandedIntent(null);
    } else {
      setIntentAnchorEl(event.currentTarget);
      setExpandedIntent(intent);
    }
  };

  const handleIntentPopoverClose = () => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  };

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
    if (!effectiveInput.trim() || isLoading) return;

    const trimmedInput = effectiveInput.trimStart();
    if (trimmedInput.startsWith('/') || trimmedInput.startsWith('@')) {
      return;
    }

    // hybrid 模式：先执行导航，再进入对话
    if (selectedSkill?.executionMode === 'hybrid') {
      const navPath = selectedSkill.path;
      if (navPath && navPath !== '/' && navPath !== '') {
        navigate(navPath);
      }
    }

    const skillContext = selectedSkill?.promptTemplate || undefined;
    const skillId = selectedSkill?.id || undefined;
    const referencedSessionIds = referencedSessions.map(s => s.id);

    sendMessage(effectiveInput, { skillContext, skillId, referencedSessions, model: selectedModelId, preset: selectedPreset || undefined, attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined, replyTo: replyToMessage || undefined });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setInputExpanded(false);
    setReferencedSessions([]);
    setPendingAttachments([]);
    onCancelReply?.();

    if (selectedSkill) {
      if (selectedSkill.executionMode === 'chat') {
        setSelectedSkill(null);
        setAutoMatched(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      {/* Reply to message preview */}
      {replyToMessage && (
        <Box sx={{ px: 1.5, py: 0.75, bgcolor: gs.bgHover, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12, color: gs.textMuted, flex: 1 }}>
            回复: {replyToMessage.content.slice(0, 80)}{replyToMessage.content.length > 80 ? '...' : ''}
          </Typography>
          <Chip
            label="取消"
            size="small"
            onDelete={onCancelReply}
            deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
            sx={{ fontSize: 11, height: 22 }}
          />
        </Box>
      )}
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
        {/* v1.7.0: 意图分类 Chips 行 */}
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
                onPaste={handlePaste}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { setTimeout(() => { isComposingRef.current = false; }, 0); }}
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
              ></div>
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

      {/* Session reference selector — @ 触发 */}
      {showSessionReference && (
        <SessionReferenceSelector
          anchorEl={containerRef.current}
          onSelect={handleSessionSelect}
          onClose={() => setShowSessionReference(false)}
        />
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
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid #F3F4F6' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: INTENT_COLORS[expandedIntent].text }}>
                {INTENT_CATEGORY_LABELS[expandedIntent]}
              </Typography>
              <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.25 }}>
                点击示例快速查询
              </Typography>
            </Box>
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
