import React, { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Chip, Typography, Popover, useTheme, IconButton, Collapse, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button,
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { getGrayScale } from '../../constants/theme';
import { Skill, INTENT_CATEGORY_LABELS, INTENT_QUICK_EXAMPLES, ICON_MAP } from '../../types/skill';
import type { IntentCategory } from '../../types/skill';
import type { Attachment } from '../../types/chat';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { useModels } from '../../contexts/ModelsContext';
import { useToast } from '../../contexts/ToastContext';
import { useChatSession } from '../../contexts/ChatContext';
import ChatToolbar, { type ModelOption } from './ChatToolbar';
const AISettingsDialog = React.lazy(() => import('../Layout/AISettingsDialog'));
import { SessionReferenceSelector } from './SessionReferenceSelector';
import type { SendAgentMessageOptions } from '../../hooks/useAgentChat';
import { uploadFile } from '../../services/api';
import { API_BASE_URL } from '../../constants/api';
import { useAiEngineSettings } from '../../contexts/AppSettingsContext';
import { SLASH_COMMANDS, SlashCommand } from '../../hooks/useSlashCommands';
import { SlashCommandSelector } from './SlashCommandSelector';


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
  sendMessage: (content: string, options?: SendAgentMessageOptions) => void;
  /** 停止生成函数（从外部注入，避免重复实例化 useChat） */
  stopGeneration: () => void;
  /** 样式变体：default=默认带边框，cardless=无边框无背景（外层有卡片），card=白色圆角卡片带阴影 */
  variant?: 'default' | 'cardless' | 'card';
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

export const TopBarChatInput = React.memo(function TopBarChatInput({ isEmpty, updateSessionModel, initialSkill, isLoading, sendMessage, stopGeneration, variant = 'default' }: TopBarChatInputProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { models: modelList, isLoading: modelsLoading, ensureInitialized } = useModels();

  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);
  const { settings: aiEngineSettings } = useAiEngineSettings();
  const { session, handleNewChat } = useChatSession();
  // v-latest: 输入框始终保持展开（高）高度，取消点击后变高的行为，
  // 避免光标与提示文字因高度跳变而位移/变形
  const [inputExpanded] = useState(true);
  const [showSkills, setShowSkills] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(initialSkill ?? null);
  const [inputValue, setInputValue] = useState('');
  const [skillFocusIndex, setSkillFocusIndex] = useState(-1);
  const [caretPos, setCaretPos] = useState<{ x: number; y: number; h: number } | null>(null);

  // 斜杠命令状态
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashCommandFocusIndex, setSlashCommandFocusIndex] = useState(0);

  // 会话引用状态
  const [showSessionReference, setShowSessionReference] = useState(false);
  const [referencedSessions, setReferencedSessions] = useState<Array<{ id: string; title: string }>>([]);

  // v1.7.0: 意图分类 Popover 状态
  const [intentAnchorEl, setIntentAnchorEl] = useState<HTMLElement | null>(null);
  const [expandedIntent, setExpandedIntent] = useState<IntentCategory | null>(null);

  // 选择文件夹状态
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // 语音输入状态
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 输入框聚焦状态
  const [isInputFocused, setIsInputFocused] = useState(false);

  // 清空对话确认对话框
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleVoiceInput = useCallback(() => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('当前浏览器不支持语音识别，请使用 Chrome', 'error', 3000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';
    const initialText = editableRef.current?.innerText || '';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (editableRef.current) {
        const displayText = initialText + finalText + (interim ? '…' : '');
        editableRef.current.innerText = displayText;
        setInputValue(initialText + finalText);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        showToast('无法访问麦克风，请检查权限设置', 'error', 3000);
      } else if (event.error === 'no-speech') {
        showToast('未检测到语音输入', 'info', 2000);
      } else {
        showToast(`语音识别错误: ${event.error}`, 'error', 2000);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (editableRef.current) {
        const combined = initialText + finalText;
        editableRef.current.innerText = combined;
        setInputValue(combined);

        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);

        handleInputChangeRef.current();
      }
      if (finalText) {
        showToast('语音输入完成', 'success', 1500);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    showToast('开始录音，再次点击停止', 'info', 2000);
  }, [isRecording, showToast]);

  // 思考级别基础列表
  const BASE_THINKING_LEVELS = [
    { value: 'off', label: '关闭' },
    { value: 'low', label: '快速' },
    { value: 'medium', label: '标准' },
    { value: 'high', label: '深度' },
  ];

  // v10.0: 根据模型配置动态获取可用思考级别
  const getAvailableThinkingLevels = useMemo(() => {
    if (!session?.model) return BASE_THINKING_LEVELS;
    const modelConfig = modelList.find(m => m.id === session.model);
    if (!modelConfig) return BASE_THINKING_LEVELS;

    // 检查模型是否支持思考能力
    const supportsThinking = modelConfig.capabilities?.includes('reasoning');
    if (!supportsThinking) {
      return [{ value: 'off', label: '关闭' }];
    }

    // 如果模型指定了可用的思考级别，则使用模型指定的级别
    if (modelConfig.thinkingLevels && modelConfig.thinkingLevels.length > 0) {
      const availableLevels = modelConfig.thinkingLevels.filter(level => 
        BASE_THINKING_LEVELS.some(base => base.value === level)
      );
      if (availableLevels.length > 0) {
        return availableLevels.map(level => 
          BASE_THINKING_LEVELS.find(base => base.value === level)!
        );
      }
    }

    return BASE_THINKING_LEVELS;
  }, [session?.model, modelList]);

  // v10.0: 获取当前模型的默认思考级别
  const getModelDefaultThinkingLevel = useMemo(() => {
    if (!session?.model) return 'off';
    const modelConfig = modelList.find(m => m.id === session.model);
    return modelConfig?.defaultThinkingLevel || 'off';
  }, [session?.model, modelList]);

  // 初始化时使用会话中保存的思考级别，如果没有则使用模型默认值
  const getInitialThinkingLevel = useMemo(() => {
    if (session?.thinkingLevel) return session.thinkingLevel;
    return getModelDefaultThinkingLevel;
  }, [session?.thinkingLevel, getModelDefaultThinkingLevel]);

  // 初始化时使用会话中保存的思考级别
  const [thinkingLevel, setThinkingLevel] = useState(getInitialThinkingLevel);
  const [thinkingMenuAnchor, setThinkingMenuAnchor] = useState<HTMLElement | null>(null);

  // v10.0: 会话切换时，从 session.thinkingLevel 恢复思考级别
  useEffect(() => {
    if (session?.thinkingLevel) {
      setThinkingLevel(session.thinkingLevel);
    } else if (getModelDefaultThinkingLevel) {
      setThinkingLevel(getModelDefaultThinkingLevel);
    }
  }, [session?.id, session?.thinkingLevel, getModelDefaultThinkingLevel]);

  const currentThinking = getAvailableThinkingLevels.find(t => t.value === thinkingLevel) || getAvailableThinkingLevels[0];

  // 当 initialSkill 从外部变化时同步到 selectedSkill（如 SkillDetailPage 跳转过来）
  useEffect(() => {
    if (initialSkill) setSelectedSkill(initialSkill);
  }, [initialSkill]);

  // v1.7.0: 技能切换时清理意图分类状态
  useEffect(() => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  }, [selectedSkill?.id]);

  const handleSendRef = useRef<() => void>(() => {});

  // 全局快捷键处理
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSkillSelector(false);
        setShowSessionReference(false);
        setShowSkills(false);
        setIntentAnchorEl(null);
        setExpandedIntent(null);
        setShowAISettings(false);
        setThinkingMenuAnchor(null);
      }

      if (editableRef.current && editableRef.current === document.activeElement) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSendRef.current();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // 选择文件夹处理：优先使用原生 NSOpenPanel，回退到 input[webkitdirectory]
  const handleSelectFolder = useCallback(async () => {
    // @ts-ignore
    const native = window.cdfAppNative;
    if (native && typeof native.pickFolder === 'function') {
      try {
        const folderPath = await native.pickFolder();
        if (folderPath) {
          setSelectedFolder(folderPath);
        }
      } catch {
        // 原生调用失败，回退到 input
        folderInputRef.current?.click();
      }
    } else {
      // Web 环境：使用 input[webkitdirectory]
      folderInputRef.current?.click();
    }
  }, []);

  // input[webkitdirectory] change 事件处理（Web 回退方案）
  const handleFolderInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // webkitdirectory 会返回文件夹下所有文件，第一个文件的 relativePath 包含文件夹名
      // @ts-ignore - webkitRelativePath 是非标准属性
      const relPath: string = files[0].webkitRelativePath || '';
      const folderName = relPath.split('/')[0];
      if (folderName) {
        // 任务 7: 完善文件夹选择能力 — 显示完整路径和文件统计
        const fileCount = files.length;
        setSelectedFolder(`${folderName}（${fileCount} 个文件）`);
      }
    }
    // 重置 input value 以便重复选择同一文件夹
    e.target.value = '';
  }, []);

  // 清除选中的文件夹
  const handleClearFolder = useCallback(() => {
    setSelectedFolder(null);
  }, []);

  const handleInputChangeRef = useRef<() => void>(() => {});

  // 在光标位置插入文本
  const insertTextAtCursor = useCallback((text: string) => {
    if (!editableRef.current) return;
    editableRef.current.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInputChangeRef.current();
  }, []);

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

  // 过滤后的斜杠命令列表
  const filteredSlashCommands = useMemo(() => {
    if (!showSlashCommands) return [];
    const q = slashQuery.toLowerCase();
    return SLASH_COMMANDS.filter(cmd =>
      cmd.name.toLowerCase().includes(q) ||
      cmd.description.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [showSlashCommands, slashQuery]);

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
          if (editableRef.current) {
            editableRef.current.innerHTML = '';
          }
        } else {
          // 有输入内容时，派发失焦事件以更新预览
          const text = editableRef.current?.innerText || '';
          window.dispatchEvent(new CustomEvent('cdf-chat-input-blur', {
            detail: { value: text },
          }));
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputValue]);

  // 跟踪光标位置
  const updateCaretPos = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editableRef.current) {
      const range = sel.getRangeAt(0).cloneRange();
      // 强制 collapse 到 end，获取实际光标位置
      range.collapse(false);
      const rect = range.getClientRects()[0] || range.getBoundingClientRect();
      const containerRect = editableRef.current.getBoundingClientRect();
      setCaretPos({
        x: rect.left - containerRect.left,
        y: rect.top - containerRect.top,
        h: rect.height,
      });
    }
  }, []);

  const handleInputChange = useCallback(() => {
    const text = editableRef.current?.innerText || '';
    setInputValue(text);
    updateCaretPos();

    const currentLine = text.split('\n').pop() || '';

    if (currentLine.startsWith('/')) {
      const query = currentLine.slice(1).trim();
      setSlashQuery(query);
      setShowSlashCommands(true);
      setSlashCommandFocusIndex(0);
      setShowSkillSelector(false);
      setShowSkills(false);
      setShowSessionReference(false);
      setSkillFocusIndex(-1);
    } else if (text.endsWith('@')) {
      // 输入"@"时显示会话引用选择器
      setShowSessionReference(true);
      setShowSkills(false);
      setShowSkillSelector(false);
      setShowSlashCommands(false);
      setSkillFocusIndex(-1);
    } else {
      setShowSkillSelector(false);
      setShowSkills(false);
      setShowSlashCommands(false);
      setSkillFocusIndex(-1);
    }
  }, []);
  handleInputChangeRef.current = handleInputChange;

  const handleInputClick = () => {
    // v2.3.1-fix: 点击输入框时清除 composition 残留标记，防止回车被误判
    compositionJustEndedRef.current = false;
    // 输入框始终保持展开高度，点击仅聚焦并将光标移至末尾（不再触发高度跳变）
    if (editableRef.current) {
      editableRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
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
          updateCaretPos();
        }
      }, 0);
    }
  };

  // 选择斜杠命令
  const handleSlashCommandSelect = useCallback((cmd: SlashCommand) => {
    setShowSlashCommands(false);
    setSlashCommandFocusIndex(0);
    if (editableRef.current) {
      const lines = inputValue.split('\n');
      const lastLineIndex = lines.length - 1;
      if (lines[lastLineIndex].startsWith('/')) {
        lines[lastLineIndex] = `/${cmd.name} `;
      }
      editableRef.current.innerText = lines.join('\n');
      setInputValue(editableRef.current.innerText);
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(editableRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
          updateCaretPos();
        }
      }, 0);
    }
  }, [inputValue]);

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
      thinkingLevel: thinkingLevel !== 'off' ? thinkingLevel : undefined,
    });
    if (editableRef.current) {
      editableRef.current.innerHTML = '';
    }
    setInputValue('');
    window.dispatchEvent(new CustomEvent('cdf-chat-input-blur', {
      detail: { value: '' },
    }));
    setShowSkillSelector(false);
    setReferencedSessions([]);
    setPendingAttachments([]);

    // chat 模式一次性执行后清除；hybrid/nav 模式保留技能状态
    if (effectiveSkill && effectiveSkill.executionMode === 'chat') {
      setSelectedSkill(null);
    }
  };
  handleSendRef.current = handleSend;

  // 清空对话
  const handleClearChat = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClearChat = useCallback(() => {
    if (session?.id) {
      setSelectedSkill(null);
      setReferencedSessions([]);
      setPendingAttachments([]);
      setInputValue('');
      if (editableRef.current) {
        editableRef.current.innerHTML = '';
      }
      window.dispatchEvent(new CustomEvent('cdf-chat-clear'));
      showToast('对话已清空', 'success', 2000);
    }
    setShowClearConfirm(false);
  }, [session?.id, showToast]);

  // 复制对话
  const handleCopyChat = useCallback(async () => {
    if (!session?.messages || session.messages.length === 0) {
      showToast('没有可复制的对话内容', 'info', 2000);
      return;
    }
    const text = session.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('对话已复制到剪贴板', 'success', 2000);
    } catch {
      showToast('复制失败，请手动复制', 'error', 2000);
    }
  }, [session?.messages, showToast]);

  // 导出对话
  const handleExportChat = useCallback(() => {
    if (!session?.messages || session.messages.length === 0) {
      showToast('没有可导出的对话内容', 'info', 2000);
      return;
    }
    const exportData = {
      title: session.title || '对话记录',
      exportTime: new Date().toISOString(),
      messages: session.messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title || '对话记录'}_${new Date().toLocaleDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('对话已导出', 'success', 2000);
  }, [session, showToast]);

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
    const justEndedComposition = compositionJustEndedRef.current;
    compositionJustEndedRef.current = false;

    // 斜杠命令选择器键盘导航
    if (showSlashCommands && filteredSlashCommands.length > 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashCommands(false);
        setSlashCommandFocusIndex(0);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashCommandFocusIndex(prev => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashCommandFocusIndex(prev => prev <= 0 ? filteredSlashCommands.length - 1 : prev - 1);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !isComposing(e) && !justEndedComposition)) {
        e.preventDefault();
        const cmd = filteredSlashCommands[slashCommandFocusIndex];
        if (cmd) {
          handleSlashCommandSelect(cmd);
        }
        return;
      }
    }

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
      if (e.key === 'Enter' && !isComposing(e) && !justEndedComposition) {
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
    if (e.key === 'Enter' && !e.shiftKey && !isComposing(e) && !justEndedComposition) {
      isComposingRef.current = false;
      compositionTextInsertedRef.current = false;
      e.preventDefault();
      handleSend();
    }
  };

  // ---- Render ----

  const isCardVariant = variant === 'card';

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        pr: 1.25,
        ...(isCardVariant && {
          pr: 0,
          borderRadius: '24px',
          bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(232,232,232,0.6)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: '2px 2px 2px 2px',
          border: 'none',
          boxShadow: isDark
            ? '0 4px 20px rgba(0,0,0,0.3)'
            : '0 4px 20px rgba(0,0,0,0.06)',
        }),
      }}
    >
      <Paper
        elevation={0}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        sx={{
          width: '100%',
          borderRadius: variant === 'cardless' ? 0 : (isCardVariant ? '20px' : '16px'),
          border: variant === 'cardless' || isCardVariant ? 'none' : `1px solid ${isInputFocused ? (isDark ? 'rgba(255, 255, 255, 0.5)' : '#000000') : gs.border}`,
          bgcolor: variant === 'cardless' ? 'transparent' : '#FFFFFF',
          boxShadow: variant === 'cardless' ? 'none' : (isInputFocused
            ? 'inset 0 2px 8px rgba(0,0,0,0.06), 0 0 0 3px rgba(0, 0, 0, 0.08)'
            : 'inset 0 2px 6px rgba(0,0,0,0.04)'),
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'hidden',
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
        }}
      >
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
                    borderRadius: '6px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    border: '1px solid',
                    borderColor: gs.border,
                    bgcolor: isDark ? '#0F172A' : '#F1F5F9',
                  }}
                >
                  <img
                    src={att.url}
                    alt={att.fileName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '6px', bgcolor: getFileTypeColor(att.mimeType, att.fileName) + '18', flexShrink: 0 }}>
                  {React.createElement(getFileTypeIconPreview(att.mimeType, att.fileName), { sx: { fontSize: 22, color: getFileTypeColor(att.mimeType, att.fileName) } })}
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
            padding: inputExpanded ? '8px 16px' : '8px 16px',
            minHeight: inputExpanded ? 48 : 32,
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
          {/* v3.2: WKWebView兼容 — contenteditable始终可见，用绝对定位实现placeholder效果 */}
          <Box sx={{ position: 'relative', width: '100%', minHeight: inputExpanded ? 32 : 32, display: 'flex', alignItems: inputExpanded ? 'flex-start' : 'center', gap: 0.75 }}>
            {/* Selected skill tag inside input */}
            {selectedSkill && (
              <Chip
                icon={
                  <Box
                    component="span"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#2563EB',
                      '& .MuiSvgIcon-root': { fontSize: '12px' },
                    }}
                  >
                    {ICON_MAP[selectedSkill.icon] || <AutoFixHighIcon sx={{ fontSize: 12 }} />}
                  </Box>
                }
                label={selectedSkill.name}
                onDelete={() => { setSelectedSkill(null); }}
                size="small"
                sx={{
                  height: 26,
                  fontSize: 12,
                  bgcolor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#2563EB',
                  fontWeight: 500,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  '& .MuiChip-label': { px: 1, py: 0 },
                  '& .MuiChip-deleteIcon': { fontSize: 14, color: '#64748b', opacity: 0, transition: 'opacity 0.2s' },
                  '&:hover': {
                    bgcolor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE',
                  },
                  '&:hover .MuiChip-deleteIcon': { opacity: 1 },
                  flexShrink: 0,
                  mt: inputExpanded ? '4px' : 0,
                  transition: 'all 0.15s ease',
                }}
              />
            )}
            {/* Input content container */}
            <Box sx={{ flex: 1, position: 'relative', minHeight: inputExpanded ? 32 : 28 }}>
              {/* placeholder层：输入框为空时显示（始终保持展开高度，静态占位，不随光标移动） */}
              {!inputValue.trim() && (
                <Typography
                  sx={{
                    position: 'absolute',
                    top: 3,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    fontSize: 14,
                    color: gs.textMuted,
                    lineHeight: 1.5,
                    pointerEvents: 'none',
                    pt: inputExpanded ? '3px' : 0,
                  }}
                >
                  今天帮你做些什么？ <Box component="span" sx={{ color: gs.textDisabled, ml: 0.5 }}>@ 引用对话文件，/ 调用技能与指令</Box>
                </Typography>
              )}
              <div
                ref={editableRef}
                contentEditable
                suppressContentEditableWarning
                onBeforeInput={handleBeforeInput}
                onInput={handleInputWithComposition}
                onKeyDown={handleKeyDown}
                onKeyUp={updateCaretPos}
                onClick={updateCaretPos}
                onFocus={() => {
                  setIsInputFocused(true);
                  updateCaretPos();
                }}
                onBlur={() => {
                  setIsInputFocused(false);
                  const text = editableRef.current?.innerText || '';
                  window.dispatchEvent(new CustomEvent('cdf-chat-input-blur', {
                    detail: { value: text },
                  }));
                }}
                onCompositionStart={() => { isComposingRef.current = true; compositionJustEndedRef.current = false; }}
                onCompositionEnd={() => {
                  const wasComposing = isComposingRef.current;
                  isComposingRef.current = false;
                  compositionTextInsertedRef.current = false;
                  if (wasComposing) {
                    compositionJustEndedRef.current = true;
                  }
                }}
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  minHeight: inputExpanded ? 32 : 28,
                  outline: 'none',
                  color: gs.textPrimary,
                  width: '100%',
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                  position: 'relative',
                  paddingTop: inputExpanded ? '6px' : '3px',
                }}
              />
            </Box>
          </Box>
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
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={setThinkingLevel}
          thinkingLevels={getAvailableThinkingLevels.map(l => ({
            value: l.value,
            label: l.value === 'off' ? '关闭思考' : `${l.label}思考`,
            desc: l.value === 'off' ? '直接输出结果，不进行深度推理' :
                  l.value === 'low' ? '轻量推理，响应更快' :
                  l.value === 'medium' ? '平衡推理深度和速度' :
                  '更深入的推理分析',
          }))}
          onVoiceInput={handleVoiceInput}
          isRecording={isRecording}
          onNewChat={handleNewChat}
          onClearChat={handleClearChat}
          onCopyChat={handleCopyChat}
          onExportChat={handleExportChat}
        />
      </Paper>

      {/* v2.3.0: 文件夹选择区域 — Paper 外部，与外层灰色融为一体 */}
      <Collapse in={isEmpty} timeout={300}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 0.75,
            mt: isCardVariant ? 0 : -1,
            bgcolor: isCardVariant ? 'transparent' : gs.bgPage,
            borderBottomLeftRadius: isCardVariant ? '22px' : (variant === 'default' ? '12px' : 0),
            borderBottomRightRadius: isCardVariant ? '22px' : (variant === 'default' ? '12px' : 0),
            borderLeft: variant === 'default' && !isCardVariant ? `1px solid ${gs.border}` : 'none',
            borderRight: variant === 'default' && !isCardVariant ? `1px solid ${gs.border}` : 'none',
            borderBottom: variant === 'default' && !isCardVariant ? `1px solid ${gs.border}` : 'none',
          }}
        >
            {/* 选择文件夹 */}
            <Box
              onClick={selectedFolder ? undefined : handleSelectFolder}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: '10px',
                cursor: selectedFolder ? 'default' : 'pointer',
                color: selectedFolder ? '#6366f1' : gs.textMuted,
                fontSize: 13,
                bgcolor: selectedFolder
                  ? (isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.06)')
                  : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                border: `1px solid ${selectedFolder ? 'rgba(99,102,241,0.3)' : gs.border}`,
                maxWidth: 320,
                transition: 'all 0.2s ease',
                boxShadow: selectedFolder ? '0 1px 3px rgba(99,102,241,0.1)' : 'none',
                '&:hover': selectedFolder
                  ? { borderColor: 'rgba(99,102,241,0.5)' }
                  : {
                      bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                    },
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 20,
                  height: 20,
                  borderRadius: '6px',
                  bgcolor: selectedFolder
                    ? (isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)')
                    : 'transparent',
                  flexShrink: 0,
                }}
              >
                <FolderOpenIcon sx={{ fontSize: 14, color: selectedFolder ? '#6366f1' : 'inherit' }} />
              </Box>
              {selectedFolder ? (
                <>
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: '#6366f1',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 200,
                    }}
                  >
                    {selectedFolder}
                  </Typography>
                  <Tooltip title="清除文件夹">
                    <Box
                      component="span"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearFolder();
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        ml: 0.25,
                        width: 18,
                        height: 18,
                        borderRadius: '4px',
                        color: gs.textMuted,
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          color: '#ef4444',
                          bgcolor: 'rgba(239,68,68,0.1)',
                        },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </Box>
                  </Tooltip>
                </>
              ) : (
                <>
                  <Typography sx={{ fontSize: 13, color: gs.textMuted, fontWeight: 400 }}>
                    选择文件夹
                  </Typography>
                  <KeyboardArrowDownIcon
                    sx={{
                      fontSize: 16,
                      color: gs.textDisabled,
                      transition: 'transform 0.2s ease',
                    }}
                  />
                  <Tooltip title="选择项目文件夹后，AI 将自动读取文件夹内的代码文件作为上下文，支持 .ts/.tsx/.js/.jsx/.py/.go/.rs/.java/.md 等格式" placement="top">
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ml: 0.25,
                        width: 18,
                        height: 18,
                        borderRadius: '4px',
                        color: gs.textDisabled,
                        cursor: 'help',
                        transition: 'all 0.15s ease',
                        '&:hover': {
                          color: gs.textMuted,
                          bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                        },
                      }}
                    >
                      <InfoOutlinedIcon sx={{ fontSize: 13 }} />
                    </Box>
                  </Tooltip>
                </>
              )}
            </Box>
            {/* 隐藏的文件夹选择 input（Web 回退方案） */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore - webkitdirectory 是非标准属性
              webkitdirectory=""
              directory=""
              multiple
              style={{ display: 'none' }}
              onChange={handleFolderInputChange}
            />
          </Box>
        </Collapse>

      {/* 清空对话确认对话框 */}
      <Dialog
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
            清空对话
          </Typography>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
            确定要清空当前对话的所有消息吗？此操作不可撤销。
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2 }}>
          <Button
            onClick={() => setShowClearConfirm(false)}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontSize: '0.875rem',
              color: gs.textMuted,
              '&:hover': { bgcolor: gs.bgHover },
            }}
          >
            取消
          </Button>
          <Button
            onClick={confirmClearChat}
            variant="contained"
            color="error"
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontSize: '0.875rem',
              px: 2,
              boxShadow: 'none',
              '&:hover': { boxShadow: 'none' },
            }}
          >
            确认清空
          </Button>
        </DialogActions>
      </Dialog>

      {/* AI 设置弹窗（模型管理） */}
      <Suspense fallback={null}>
        <AISettingsDialog
          open={showAISettings}
          onClose={() => setShowAISettings(false)}
        />
      </Suspense>

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

      {/* Slash command selector — / 斜杠命令触发 */}
      {showSlashCommands && (
        <SlashCommandSelector
          anchorEl={containerRef.current}
          commands={filteredSlashCommands}
          selectedIndex={slashCommandFocusIndex}
          onSelect={handleSlashCommandSelect}
          onClose={() => { setShowSlashCommands(false); setSlashCommandFocusIndex(0); }}
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
