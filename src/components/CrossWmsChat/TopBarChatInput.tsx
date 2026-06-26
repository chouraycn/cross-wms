import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Chip, Typography, Popover, useTheme, IconButton, Collapse,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DescriptionIcon from '@mui/icons-material/Description';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import VideoFileIcon from '@mui/icons-material/VideoFile';
import TableChartIcon from '@mui/icons-material/TableChart';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getGrayScale } from '../../constants/theme';
import { Skill, INTENT_CATEGORY_LABELS, INTENT_QUICK_EXAMPLES, ICON_MAP } from '../../types/skill';
import type { IntentCategory } from '../../types/skill';
import type { Attachment } from '../../types/chat';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { useModels } from '../../contexts/ModelsContext';
import { useToast } from '../../contexts/ToastContext';
import ChatToolbar, { type ModelOption } from './ChatToolbar';
import AISettingsDialog from '../Layout/AISettingsDialog';
import { SessionReferenceSelector } from './SessionReferenceSelector';
import type { SendMessageOptions } from '../../hooks/useChat';
import { uploadFile } from '../../services/api';
import { API_BASE_URL } from '../../constants/api';
import { useAiEngineSettings } from '../../contexts/AppSettingsContext';
import { SLASH_COMMANDS } from '../../hooks/useSlashCommands';


// ===================== Props =====================

interface TopBarChatInputProps {
  /** 会话是否为空（无消息）— 仅在 0→1 消息时变化，流式期间稳定 */
  isEmpty: boolean;
  /** 轻量更新会话模型字段（不展开整个 session） */
  updateSessionModel: (model: string) => void;
  /** 从外部注入的初始技能（如从 URL 参数解析） */
  initialSkill?: Skill | null;
  /** 是否正在加载中（从外部注入，避免重复实例化 useChat） */
  isLoading: boolean;
  /** 发送消息函数（从外部注入，避免重复实例化 useChat） */
  sendMessage: (content: string, options?: SendMessageOptions) => void;
  /** 停止生成函数（从外部注入，避免重复实例化 useChat） */
  stopGeneration: () => void;
}

// ===================== v1.9.3: 文件类型图标工具 =====================

function getFileExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1) : '';
}

function getFileTypeIconPreview(mimeType: string, fileName: string): React.ElementType {
  const ext = getFileExtension(fileName).toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return ImageIcon;
  if (mime === 'application/pdf' || ext === 'pdf') return PictureAsPdfIcon;
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(ext)) return AudioFileIcon;
  if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return VideoFileIcon;
  if (['csv', 'xls', 'xlsx'].includes(ext)) return TableChartIcon;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FolderZipIcon;
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log'].includes(ext)) return DescriptionIcon;
  return InsertDriveFileIcon;
}

function getFileTypeColor(mimeType: string, fileName: string): string {
  const ext = getFileExtension(fileName).toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return '#F59E0B';
  if (mime === 'application/pdf' || ext === 'pdf') return '#EF4444';
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return '#8B5CF6';
  if (mime.startsWith('video/') || ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return '#EC4899';
  if (['csv', 'xls', 'xlsx'].includes(ext)) return '#10B981';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '#6B7280';
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log'].includes(ext)) return '#3B82F6';
  return '#6B7280';
}

// ===================== Component =====================

export const TopBarChatInput = React.memo(function TopBarChatInput({ isEmpty, updateSessionModel, initialSkill, isLoading, sendMessage, stopGeneration }: TopBarChatInputProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { models: modelList, isLoading: modelsLoading } = useModels();
  const { settings: aiEngineSettings } = useAiEngineSettings();
  const [inputExpanded, setInputExpanded] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(initialSkill ?? null);
  const [inputValue, setInputValue] = useState('');
  const [skillFocusIndex, setSkillFocusIndex] = useState(-1);

  // 会话引用状态
  const [showSessionReference, setShowSessionReference] = useState(false);
  const [referencedSessions, setReferencedSessions] = useState<Array<{ id: string; title: string }>>([]);

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

  // 获取当前斜杠命令过滤后的技能列表（用于键盘导航，缓存避免每次渲染重新计算）
  const slashFilteredSkills = useMemo(() => {
    if (!showSkillSelector) return [];
    const allSkills = getAllSkills().filter(s => s.status === 'active');
    const q = slashQuery.toLowerCase();
    return allSkills.filter(skill =>
      skill.name.toLowerCase().includes(q) ||
      skill.desc.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q) ||
      (skill.trigger || '').toLowerCase().includes(q) ||
      (skill.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }, [showSkillSelector, slashQuery]);
  const slashFilteredCount = slashFilteredSkills.length;

  // 从 ModelsContext 中读取模型列表（仅启用的模型），Auto 作为首选项
  const MODEL_OPTIONS: ModelOption[] = [
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
  const [showAISettings, setShowAISettings] = useState(false);

  // 附件状态
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 模型切换：Auto 模式发送 "auto"，其他按名称匹配 ID */
  const handleModelChange = useCallback((name: string) => {
    setSelectedModel(name);
    if (name === 'Auto') {
      setSelectedModelId('auto');
      updateSessionModel('auto');
    } else {
      const found = enabledModels.find((m) => m.name === name);
      const modelId = found?.id || name;
      setSelectedModelId(modelId);
      updateSessionModel(modelId);
    }
  }, [enabledModels, updateSessionModel]);

  /** 格式化文件大小 */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // 与服务端 ALLOWED_EXTENSIONS 保持一致的允许扩展名列表
  const ALLOWED_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'avif',
    'pdf', 'csv', 'txt', 'json', 'md', 'xlsx', 'docx', 'doc', 'ppt', 'xls', 'pptx',
    'wps', 'et', 'dps', 'html', 'htm',
    'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'hpp',
    'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm', 'yaml', 'yml', 'xml',
    'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1', 'css', 'scss',
    'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm', 'log', 'tsv',
  ]);
  const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

  /** 处理文件上传 */
  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    // 前置校验：大小 + 文件类型
    for (const file of fileArray) {
      if (file.size > MAX_UPLOAD_SIZE) {
        showToast(`文件 "${file.name}" 超过 10MB 限制`, 'error', 3000);
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImage = file.type.startsWith('image/');
      if (!isImage && !ALLOWED_EXTENSIONS.has(ext)) {
        showToast(`不支持的文件类型: .${ext}`, 'error', 3000);
        return;
      }
    }

    setIsUploading(true);
    const newAttachments: Attachment[] = [];

    for (const file of fileArray) {
      try {
        const result = await uploadFile(file);
        const isImage = result.mimeType.startsWith('image/');
        // v1.9.3: 确保附件 URL 在 Electron 打包后也能正确访问
        // 开发模式下 API_BASE_URL 为空/undefined，使用相对路径
        const baseUrl = API_BASE_URL || '';
        const fullUrl = result.url.startsWith('http') ? result.url : `${baseUrl}${result.url}`;
        newAttachments.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          fileId: result.fileId,
          fileName: result.fileName,
          mimeType: result.mimeType,
          size: result.size,
          url: fullUrl,
          type: isImage ? 'image' : 'file',
        });
      } catch (err) {
        // console.error('[TopBarChatInput] 文件上传失败:', file.name, err);
        showToast(`文件上传失败: ${file.name}`, 'error', 3000);
      }
    }

    setPendingAttachments(prev => [...prev, ...newAttachments]);
    setIsUploading(false);
  }, []);

  /** 删除待发送附件 */
  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  /** 处理拖拽文件 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  const editableRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /**
   * IME 组合状态追踪 — 三重检测机制
   *
   * 问题背景：
   * 1. WKWebView 中 nativeEvent.isComposing 不可靠
   * 2. 某些输入法（搜狗/百度）输入英文时不触发 onCompositionEnd
   * 3. 某些场景下 onCompositionStart 不触发
   *
   * 解决方案：
   * - 优先使用 nativeEvent.isComposing（标准浏览器最可靠）
   * - onCompositionStart/End 作为兜底状态
   * - beforeinput 事件检测 insertCompositionText / insertText 作为补充
   * - 绝不使用超时自动重置（会导致回车误发送）
   */
  const isComposingRef = useRef(false);

  // Click outside to collapse input area
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSkills(false);
        setShowSkillSelector(false);
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

    const currentLine = text.split('\n').pop() || '';

    if (currentLine.startsWith('/')) {
      const query = currentLine.slice(1).trim();
      setSlashQuery(query);
      setShowSkillSelector(true);
      setShowSkills(false);
      setShowSessionReference(false);
      setSkillFocusIndex(-1);
    } else if (text.endsWith('@')) {
      // 输入"@"时显示会话引用选择器
      setShowSessionReference(true);
      setShowSkills(false);
      setShowSkillSelector(false);
      setSkillFocusIndex(-1);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
      setSkillFocusIndex(-1);
    }
  }, []);

  const handleInputClick = () => {
    // v2.3.1-fix: 点击输入框时清除 composition 残留标记，防止回车被误判
    compositionJustEndedRef.current = false;
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
    // v1.9.3: 允许空文字但带有附件的消息发送
    const hasAttachments = pendingAttachments.length > 0;
    if ((!effectiveInput.trim() && !hasAttachments) || isLoading) return;

    const trimmedInput = effectiveInput.trimStart();

    // 如果是斜杠命令，允许发送（上层 handleSendMessage 会处理命令）
    if (trimmedInput.startsWith('/')) {
      const firstWord = trimmedInput.slice(1).split(' ')[0].toLowerCase();
      const isSlashCommand = SLASH_COMMANDS.some(cmd => cmd.name.toLowerCase() === firstWord);
      if (isSlashCommand) {
        // 是已知的斜杠命令，继续发送流程
      } else if (showSkillSelector) {
        // 不是已知命令且显示了技能选择器，等待技能选择
        return;
      }
    }

    // 如果以 @ 开头且显示了会话引用选择器，不触发发送（等用户完成选择）
    if (trimmedInput.startsWith('@') && showSessionReference) {
      return;
    }

    const effectiveSkill = selectedSkill;

    // hybrid 模式：先执行导航，再进入对话
    if (effectiveSkill?.executionMode === 'hybrid') {
      const navPath = effectiveSkill.path;
      if (navPath && navPath !== '/' && navPath !== '') {
        navigate(navPath);
      }
    }

    const skillContext = effectiveSkill?.promptTemplate || undefined;
    const skillId = effectiveSkill?.id || undefined;

    // v1.5.85: 智能模型 + 附件时，自动选用支持多模态的模型，避免后端 auto 路由到不支持图片的模型
    let effectiveModelId = selectedModelId;
    if (effectiveModelId === 'auto' && pendingAttachments.length > 0) {
      const multimodalModel = enabledModels.find(m => m.capabilities?.includes('multimodal'));
      if (multimodalModel) {
        effectiveModelId = multimodalModel.id;
        // console.log(`[ModelRouter] 检测到附件，智能模型自动切换为多模态模型: ${multimodalModel.name} (${multimodalModel.id})`);
      }
    }

    sendMessage(effectiveInput, {
      skillContext,
      skillId,
      referencedSessions,
      model: effectiveModelId,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
      executionMode: aiEngineSettings.defaultExecutionMode !== 'legacy' ? aiEngineSettings.defaultExecutionMode : undefined,
      queueMode: aiEngineSettings.defaultQueueMode !== 'followup' ? aiEngineSettings.defaultQueueMode : undefined,
    });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    setShowSkillSelector(false);
    setInputExpanded(false);
    setReferencedSessions([]);
    setPendingAttachments([]);

    // chat 模式一次性执行后清除；hybrid/nav 模式保留技能状态
    if (effectiveSkill && effectiveSkill.executionMode === 'chat') {
      setSelectedSkill(null);
    }
  };

  /**
   * v1.5.73: compositionend 后标记 — 解决 WKWebView 中 compositionend 先于 keydown 触发的问题
   *
   * WKWebView 事件顺序（中文输入法按 Enter 确认选字时）：
   *   compositionend → beforeinput(insertText) → keydown(Enter)
   *
   * compositionend 会重置 isComposingRef / compositionTextInsertedRef，
   * 导致后续 keydown(Enter) 三个检测全部失败，消息被误发送。
   *
   * 此 ref 在 compositionend 中设为 true，在 keydown(Enter) 中检测并清除，
   * 确保 IME 确认用的 Enter 不会被当作发送快捷键。
   */
  const compositionJustEndedRef = useRef(false);

  /**
   * 检测当前是否处于 IME 组合状态 — 五重检测
   *
   * 检测优先级（任一项为 true 即认为在组合中）：
   * 1. nativeEvent.isComposing（标准浏览器）
   * 2. isComposingRef（onCompositionStart/End 维护）
   * 3. compositionTextInsertedRef（beforeinput insertCompositionText 检测）
   * 4. compositionJustEndedRef（compositionend → keydown 之间的过渡期）
   */
  const isComposing = (e: React.KeyboardEvent | React.CompositionEvent): boolean => {
    // @ts-expect-error nativeEvent 类型兼容
    const nativeIsComposing = e.nativeEvent?.isComposing;
    if (typeof nativeIsComposing === 'boolean') {
      return nativeIsComposing || isComposingRef.current || compositionJustEndedRef.current;
    }
    return isComposingRef.current || compositionJustEndedRef.current;
  };

  /**
   * v2.3.0: beforeinput 事件处理 — 检测 IME 组合状态
   *
   * macOS 中文输入法在拼音模式下输入英文（不切换输入法），
   * 按 Enter 确认时不会触发 onCompositionStart/End，
   * 但会触发 beforeinput 事件且 inputType 为 'insertCompositionText'。
   *
   * 策略：
   * - beforeinput 时如果 inputType 包含 'Composition'，标记为组合中
   * - 下一个非组合的 beforeinput 事件触发时重置（不依赖超时，避免 WKWebView 下回车误发送）
   */
  const compositionTextInsertedRef = useRef(false);

  const handleBeforeInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const event = e.nativeEvent as InputEvent;
    if (event.inputType?.includes('Composition')) {
      isComposingRef.current = true;
      compositionTextInsertedRef.current = true;
    } else if (compositionTextInsertedRef.current) {
      // 组合结束后的第一个非组合输入，重置状态（不依赖超时）
      isComposingRef.current = false;
      compositionTextInsertedRef.current = false;
    }
  }, []);

  const handleInputWithComposition = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const event = e.nativeEvent as InputEvent;
    // 组合文本输入时维持组合标记（确保 WKWebView 下 isComposingRef 不丢失）
    if (event.inputType?.includes('Composition')) {
      isComposingRef.current = true;
      compositionTextInsertedRef.current = true;
    }
    // 调用原有的 input 处理
    handleInputChange();
  }, [handleInputChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // v2.3.1-fix: 保存并立即清除 compositionJustEndedRef，防止死锁
    // 问题：compositionend → 设置 compositionJustEndedRef=true → Enter 被该标记阻塞
    // → 标记永不重置 → 后续所有回车永久失效
    // 解决：在 keydown 开头快照该值后立即清除，用快照值做判断
    const justEndedComposition = compositionJustEndedRef.current;
    compositionJustEndedRef.current = false;

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
      if (e.key === 'Enter' && !isComposing(e) && !compositionTextInsertedRef.current && !justEndedComposition) {
        e.preventDefault();
        if (skillFocusIndex >= 0 && skillFocusIndex < slashFilteredCount) {
          if (slashFilteredSkills[skillFocusIndex]) {
            handleSkillSelect(slashFilteredSkills[skillFocusIndex]);
          }
        } else {
          handleSend();
        }
        setSkillFocusIndex(-1);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e) && !compositionTextInsertedRef.current && !justEndedComposition) {
      e.preventDefault();
      handleSend();
      return;
    }
    // v2.3.2-fix: 如果 IME 已结束（nativeEvent.isComposing=false, justEndedComposition=false），
    // 但 isComposingRef/compositionTextInsertedRef 被 beforeinput(insertCompositionText) 残留置为 true，
    // 导致上面的 send 条件未命中 → Enter 未被 preventDefault → contentEditable 原生换行
    // 修复：第二个 Enter（plain Enter）时，清除残留标记，触发发送
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any)?.isComposing && !justEndedComposition) {
      isComposingRef.current = false;
      compositionTextInsertedRef.current = false;
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
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        sx={{
          width: '100%',
          borderRadius: '12px',
          border: `1px solid ${gs.border}`,
          bgcolor: gs.bgPanel,
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'hidden',
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
                  {selectedSkill.promptTemplate && (
                    <Typography component="span" sx={{ fontSize: 9, color: '#7C3AED', fontWeight: 600, bgcolor: '#FAF5FF', px: 0.5, borderRadius: 0.5 }}>
                      AI
                    </Typography>
                  )}
                </Box>
              }
              onDelete={() => { setSelectedSkill(null); }}
              size="small"
              sx={{
                height: 26,
                fontSize: 12,
                bgcolor: selectedSkill.promptTemplate ? '#FAF5FF' : '#F3F4F6',
                border: selectedSkill.promptTemplate ? '1px solid #DDD6FE' : '1px solid #E5E7EB',
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Box>
        )}
        {/* v1.7.0: 意图分类 Chips 行 — 仅当选中技能有 intentCategories 时展示 */}
        {selectedSkill?.intentCategories && selectedSkill.intentCategories.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.75, bgcolor: gs.bgPanel, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
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
        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.75, bgcolor: gs.bgPanel, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            {pendingAttachments.map((att) => (
              <Box
                key={att.id}
                className="attachment-item"
                sx={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 0.75,
                  py: 0.5,
                  borderRadius: '8px',
                  bgcolor: isDark ? '#1A1A1A' : '#F5F5F5',
                  maxWidth: 200,
                  '&:hover .attachment-close-btn': {
                    opacity: 1,
                    visibility: 'visible',
                  },
                }}
              >
                {att.type === 'image' && att.url ? (
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid',
                    borderColor: gs.border,
                  }}
                >
                  <img
                    src={att.url}
                    alt={att.fileName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '6px', bgcolor: getFileTypeColor(att.mimeType, att.fileName) + '18', flexShrink: 0 }}>
                  {React.createElement(getFileTypeIconPreview(att.mimeType, att.fileName), { sx: { fontSize: 18, color: getFileTypeColor(att.mimeType, att.fileName) } })}
                </Box>
              )}
                <Box sx={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 11, color: gs.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.fileName}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: gs.textMuted }}>
                    {formatFileSize(att.size)}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  className="attachment-close-btn"
                  onClick={() => removePendingAttachment(att.id)}
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    bgcolor: '#000000',
                    color: '#FFFFFF',
                    '&:hover': { bgcolor: '#1A1A1A' },
                    borderRadius: '50%',
                    p: 0,
                    minWidth: 0,
                    '.MuiSvgIcon-root': { fontSize: 12 },
                    opacity: 0,
                    visibility: 'hidden',
                    transition: 'opacity 0.2s, visibility 0.2s',
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            ))}
            {isUploading && (
              <Typography sx={{ fontSize: 11, color: gs.textMuted, fontStyle: 'italic' }}>
                上传中...
              </Typography>
            )}
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
          {/* 隐藏的文件上传 input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.svg,.ico,.tiff,.avif,.pdf,.csv,.txt,.json,.md,.xlsx,.docx,.doc,.ppt,.xls,.pptx,.wps,.et,.dps"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(e.target.files);
                e.target.value = '';
              }
            }}
          />
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
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, width: '100%' }}>
                <div
                  ref={editableRef}
                  contentEditable
                  suppressContentEditableWarning
                  onBeforeInput={handleBeforeInput}
                  onInput={handleInputWithComposition}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => { isComposingRef.current = true; compositionJustEndedRef.current = false; }}
                  onCompositionEnd={() => {
                    // Bug Fix: 仅在确实正在组合输入时才标记 compositionJustEndedRef
                    // WKWebView 会在非 IME 回车时也触发 compositionend（无 compositionstart 配对）
                    const wasComposing = isComposingRef.current;
                    isComposingRef.current = false;
                    compositionTextInsertedRef.current = false;
                    if (wasComposing) {
                      compositionJustEndedRef.current = true;
                    }
                  }}
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
              </Box>
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
          selectedModel={modelsLoading ? '加载中...' : selectedModel}
          onModelChange={handleModelChange}
          selectedPermission={selectedPermission}
          onPermissionChange={setSelectedPermission}
          isLoading={isLoading}
          inputValue={inputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          onSkillSelect={handleSkillSelect}
          modelOptions={MODEL_OPTIONS}
          onOpenAISettings={() => setShowAISettings(true)}
          modelsLoading={modelsLoading}
          onAttachClick={() => fileInputRef.current?.click()}
          hasAttachments={pendingAttachments.length > 0}
        />
      </Paper>
      {/* v2.3.0: 文件夹选择区域 — Paper 外部，白色区域保持四角圆角 */}
      <Collapse in={isEmpty} timeout={300}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 0.75,
            mt: -1,
            bgcolor: isDark ? 'rgba(0,0,0,0.2)' : '#F5F5F5',
            borderBottomLeftRadius: '12px',
            borderBottomRightRadius: '12px',
            borderLeft: `1px solid ${gs.border}`,
            borderRight: `1px solid ${gs.border}`,
            borderBottom: `1px solid ${gs.border}`,
          }}
        >
            {/* 选择文件夹下拉 */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 1,
                py: 0.4,
                borderRadius: '6px',
                cursor: 'pointer',
                color: gs.textMuted,
                fontSize: 13,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#E8E8E8' },
              }}
            >
              <FolderOpenIcon sx={{ fontSize: 16 }} />
              <Typography sx={{ fontSize: 13, color: gs.textMuted }}>选择文件夹（可选）</Typography>
              <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
            </Box>
          </Box>
        </Collapse>

      {/* AI 设置弹窗（模型管理） */}
      <AISettingsDialog
        open={showAISettings}
        onClose={() => setShowAISettings(false)}
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
});
