import React, { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Chip, Typography, Popover, useTheme, IconButton, Collapse, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, CircularProgress,
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
import type { IntentCategory, SkillChain } from '../../types/skill';
import type { Attachment } from '../../types/chat';
import { getAllSkills } from '../../stores/skillStore';
import { SkillSelector } from './SkillSelector';
import { PermissionPreset, type PermissionLevel } from './PermissionPreset';
import { ContextMeter } from './ContextMeter';
import { useModels } from '../../contexts/ModelsContext';
import { useToast } from '../../contexts/ToastContext';
import { useChatSession } from '../../contexts/ChatContext';
import ChatToolbar, { type ModelOption } from './ChatToolbar';
const AISettingsDialog = React.lazy(() => import('../Layout/AISettingsDialog'));
import { SessionReferenceSelector } from './SessionReferenceSelector';
import type { SendAgentMessageOptions } from '../../hooks/useAgentChat';
import { uploadFile, executeSkillChain } from '../../services/api';
import { API_BASE_URL } from '../../constants/api';
import { useAiEngineSettings } from '../../contexts/AppSettingsContext';
import { SLASH_COMMANDS, SlashCommand } from '../../hooks/useSlashCommands';
import { handleFloatingListKeyDown } from '../../hooks/useFloatingListNavigation';
import { SlashCommandSelector } from './SlashCommandSelector';
import { useI18n } from '../../components/staff/i18n/index.js';
import { CdfEvents } from '../../events/events.js';


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
  const { t } = useI18n();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const gs = useMemo(() => getGrayScale(isDark), [isDark]);
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { models: modelList, isLoading: modelsLoading, ensureInitialized, defaultModelId } = useModels();

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
  // R2b-4：初始/外部传入的技能若已被停用（status != active），则不自动绑定（避免 URL 注入停用技能）
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(() => {
    if (initialSkill && initialSkill.status === 'active') return initialSkill;
    return null;
  });
  const [inputValue, setInputValue] = useState('');
  const [skillFocusIndex, setSkillFocusIndex] = useState(-1);

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
  // selectedFolder: 用于 UI 显示（路径或"文件夹名（N 个文件）"）
  // folderContext: 用于传递给后端的上下文（原生=绝对路径；Web=拼接好的内容字符串）
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [folderContext, setFolderContext] = useState<string | null>(null);
  const [isSelectingFolder, setIsSelectingFolder] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // 语音输入状态
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 输入框聚焦状态 — 用 ref 保存，避免每次 onFocus/onBlur 触发整组件重渲染导致打断输入
  const isInputFocusedRef = useRef(false);

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
      showToast(t('当前浏览器不支持语音识别，请使用 Chrome'), 'error', 3000);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    let finalText = '';
    const initialText = editableRef.current?.value || '';

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
        editableRef.current.value = displayText;
        setInputValue(initialText + finalText);
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        showToast(t('无法访问麦克风，请检查权限设置'), 'error', 3000);
      } else if (event.error === 'no-speech') {
        showToast(t('未检测到语音输入'), 'info', 2000);
      } else {
        showToast(t('语音识别错误: {error}', { error: event.error }), 'error', 2000);
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (editableRef.current) {
        const combined = initialText + finalText;
        editableRef.current.value = combined;
        setInputValue(combined);

        // textarea: 将光标移至末尾
        const len = combined.length;
        editableRef.current.selectionStart = len;
        editableRef.current.selectionEnd = len;
        safeFocusEditable();

        handleInputChangeRef.current();
      }
      if (finalText) {
        showToast(t('语音输入完成'), 'success', 1500);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    showToast(t('开始录音，再次点击停止'), 'info', 2000);
  }, [isRecording, showToast, t]);

  // 思考级别基础列表
  const BASE_THINKING_LEVELS = [
    { value: 'off', label: t('关闭') },
    { value: 'low', label: t('快速') },
    { value: 'medium', label: t('标准') },
    { value: 'high', label: t('深度') },
  ];

  // v10.0: 根据模型配置动态获取可用思考级别
  const getAvailableThinkingLevels = useMemo(() => {
    if (!session?.model) return BASE_THINKING_LEVELS;
    const modelConfig = modelList.find(m => m.id === session.model);
    if (!modelConfig) return BASE_THINKING_LEVELS;

    // 检查模型是否支持思考能力
    const supportsThinking = modelConfig.capabilities?.includes('reasoning');
    if (!supportsThinking) {
      return [{ value: 'off', label: t('关闭') }];
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
  }, [session?.model, modelList, t]);

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
  // R2b-4：若外部传入的技能已被停用（status != active），则忽略（配合前端 toasts 可加提示）
  useEffect(() => {
    if (initialSkill && initialSkill.status === 'active') setSelectedSkill(initialSkill);
  }, [initialSkill]);

  // v1.7.0: 技能切换时清理意图分类状态
  useEffect(() => {
    setIntentAnchorEl(null);
    setExpandedIntent(null);
  }, [selectedSkill?.id]);

  const handleSendRef = useRef<() => void>(() => {});

  /**
   * 安全聚焦到输入框：
   * - 若输入框已经持有焦点 → 绝不调用 focus()（会打断中文输入法/正在输入的用户）
   * - 若别处已有用户输入焦点（INPUT/TEXTAREA/contenteditable）→ 不抢焦点
   * - 用户正在中文拼写（IME/composition）→ 不抢焦点
   */
  const safeFocusEditable = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    const ae = document.activeElement as HTMLElement | null;
    if (ae) {
      const tag = ae.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || ae.isContentEditable) return;
    }
    if (isComposingRef.current) return;
    el.focus();
  }, []);

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
    // @ts-expect-error FIXME: cdfAppNative 是宿主注入的非标准全局对象，应在 src/global.d.ts 补类型声明
    const native = window.cdfAppNative;
    if (native && typeof native.pickFolder === 'function') {
      setIsSelectingFolder(true);
      try {
        const folderPath = await native.pickFolder();
        if (folderPath) {
          setSelectedFolder(folderPath);
          setFolderContext(folderPath);
        }
      } catch {
        folderInputRef.current?.click();
      } finally {
        setIsSelectingFolder(false);
      }
    } else {
      folderInputRef.current?.click();
    }
  }, []);

  // input[webkitdirectory] change 事件处理（Web 回退方案）
  // Web 环境下浏览器无法访问真实文件系统路径，所以前端直接读取所有文本文件内容
  // 并组装成 folderContext 字符串，后端识别为内容直接注入（非路径）
  const handleFolderInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      e.target.value = '';
      return;
    }

    setIsSelectingFolder(true);
    try {
    // webkitRelativePath 是非标准 File 属性，TS 新版本内置 DOM lib 已声明
    const relPath: string = files[0].webkitRelativePath || '';
    const folderName = relPath.split('/')[0] || 'folder';
    const fileCount = files.length;

    // 支持文本读取的扩展名白名单
    const TEXT_EXTS = new Set([
      'txt', 'csv', 'json', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs',
      'cpp', 'c', 'h', 'hpp', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm',
      'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1',
      'css', 'scss', 'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm', 'log', 'tsv',
      'html', 'htm',
    ]);
    const MAX_FILE_SIZE = 100_000; // 单文件 100KB 上限
    const MAX_TOTAL_SIZE = 800_000; // 总内容 800KB 上限
    const MAX_FILES_TO_READ = 100; // 最多读取 100 个文件

    // 先过滤出可读文件，再并行读取
    const readableFiles: Array<{ file: File; relativePath: string; ext: string }> = [];
    const skippedFiles: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath: string = file.webkitRelativePath || file.name;
      const ext = (relativePath.split('.').pop() || '').toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;
      if (file.size > MAX_FILE_SIZE) {
        skippedFiles.push(`\n--- ${relativePath} (文件过大: ${(file.size / 1024).toFixed(1)}KB，已跳过) ---`);
        continue;
      }
      readableFiles.push({ file, relativePath, ext });
      if (readableFiles.length >= MAX_FILES_TO_READ) break;
    }

    // 并行读取所有文件内容
    const readResults = await Promise.all(
      readableFiles.map(async ({ file, relativePath, ext }) => {
        try {
          const content = await file.text();
          return { relativePath, ext, content, ok: true };
        } catch {
          return { relativePath, ext, content: '', ok: false };
        }
      })
    );

    const parts: string[] = [`【文件夹】${folderName}（共 ${fileCount} 个文件）`];
    parts.push(...skippedFiles);

    let totalSize = 0;
    let readCount = 0;

    for (const result of readResults) {
      if (totalSize >= MAX_TOTAL_SIZE) break;
      if (!result.ok) {
        parts.push(`\n--- ${result.relativePath} (读取失败) ---`);
        continue;
      }
      const truncatedContent = totalSize + result.content.length > MAX_TOTAL_SIZE
        ? result.content.slice(0, MAX_TOTAL_SIZE - totalSize)
        : result.content;
      parts.push(`\n--- ${result.relativePath} ---\n\`\`\`${result.ext}\n${truncatedContent}\n\`\`\``);
      totalSize += truncatedContent.length;
      readCount++;
    }

    if (readCount === 0 && skippedFiles.length === 0) {
      parts.push('\n（未发现可读取的文本文件）');
    } else if (readCount < fileCount) {
      parts.push(`\n（已读取 ${readCount} / ${fileCount} 个文本文件，其余被跳过）`);
    }

    // Web 场景下 folderContext 直接是内容字符串，后端会识别并直接注入
    // 通过特殊前缀标记这是内容字符串而非路径
    const contextStr = `FOLDER_CONTENT_INLINE\n${parts.join('\n')}`;
    setSelectedFolder(`${folderName}（${fileCount} 个文件）`);
    setFolderContext(contextStr);
    } finally {
      setIsSelectingFolder(false);
    }

    // 重置 input value 以便重复选择同一文件夹
    e.target.value = '';
  }, []);

  // 清除选中的文件夹
  const handleClearFolder = useCallback(() => {
    setSelectedFolder(null);
    setFolderContext(null);
  }, []);

  const handleInputChangeRef = useRef<() => void>(() => {});

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

  // 从 ModelsContext 中读取模型列表，Auto 作为首选项
  // RC-3 修复：不再过滤 enabled=false 的模型，改为保留并标记 enabled 字段供 UI 灰显
  // 原行为：filter(m => m.enabled) 会导致用户看到"模型没了"
  const MODEL_OPTIONS: ModelOption[] = [
    { id: 'auto', name: 'Auto', provider: 'auto', description: t('根据任务自动选择最合适的模型') },
    ...modelList.map((m) => ({
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
  const [selectedPermission, setSelectedPermission] = useState(t('默认权限'));
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>('query');
  const [showAISettings, setShowAISettings] = useState(false);

  // v1.7.162: 跟踪用户是否主动选择了 Auto，防止 useEffect 覆盖
  const userSelectedAutoRef = useRef(false);

  // 附件状态
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 模型加载完成后，若当前选中仍为默认 'Auto' 但后端有别的 defaultModelId，
  // 同步 selectedModel 为真实模型名，避免重新安装后模型选择器长时间显示灰色"加载中..."
  useEffect(() => {
    if (modelsLoading) return;
    if (!defaultModelId || defaultModelId === 'auto') return;
    if (selectedModelId !== 'auto') return; // 用户已主动选择其他模型，不覆盖
    if (userSelectedAutoRef.current) return; // 用户主动选择了 Auto，不覆盖
    const found = modelList.find(m => m.id === defaultModelId);
    if (found && selectedModel === 'Auto') {
      setSelectedModel(found.name);
      setSelectedModelId(found.id);
    }
  }, [modelsLoading, defaultModelId, modelList, selectedModel, selectedModelId]);

  /** 模型切换：Auto 模式发送 "auto"，其他按名称匹配 ID */
  const handleModelChange = useCallback((name: string) => {
    setSelectedModel(name);
    if (name === 'Auto') {
      userSelectedAutoRef.current = true;
      setSelectedModelId('auto');
      updateSessionModel('auto');
    } else {
      userSelectedAutoRef.current = false;
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
        showToast(t('文件 "{name}" 超过 10MB 限制', { name: file.name }), 'error', 3000);
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isImage = file.type.startsWith('image/');
      if (!isImage && !ALLOWED_EXTENSIONS.has(ext)) {
        showToast(t('不支持的文件类型: .{ext}', { ext }), 'error', 3000);
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
        showToast(t('文件上传失败: {name}', { name: file.name }), 'error', 3000);
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

  const editableRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // inputValue 的 ref 镜像 — 用于 handleClickOutside 闭包，避免 [inputValue] 依赖导致
  // 每次按键都重建 mousedown 监听器（WKWebView 中频繁 add/remove listener 可能干扰焦点）
  const inputValueRef = useRef('');
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);
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
  // 依赖空数组 — 使用 inputValueRef 读取最新值，避免每次按键重建监听器
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSkills(false);
        setShowSkillSelector(false);
        setShowSessionReference(false);
        if (!inputValueRef.current.trim()) {
          if (editableRef.current) {
            editableRef.current.value = '';
          }
        } else {
          // 有输入内容时，派发失焦事件以更新预览
          const text = editableRef.current?.value || '';
          window.dispatchEvent(new CustomEvent('cdf-chat-input-blur', {
            detail: { value: text },
          }));
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 预填聊天输入框：从其他页面（如库存页）注入查询文本
  // 两种触发方式：sessionStorage（跨页面导航）+ CHAT_PREFILL 事件（同页面）
  useEffect(() => {
    const fillText = (text: string) => {
      if (!text) return;
      if (editableRef.current) {
        editableRef.current.value = text;
        const len = text.length;
        editableRef.current.selectionStart = len;
        editableRef.current.selectionEnd = len;
        safeFocusEditable();
      }
      setInputValue(text);
    };

    // 挂载时检查 sessionStorage（跨页面导航场景）
    try {
      const stored = sessionStorage.getItem('cdf-chat-prefill');
      if (stored) {
        sessionStorage.removeItem('cdf-chat-prefill');
        // 延迟一帧确保 textarea 已渲染（WKWebView 中 rAF 可能被节流，用 setTimeout(≈16ms 一帧) 更稳定）
        setTimeout(() => fillText(stored), 16);
      }
    } catch { /* ignore */ }

    // 监听同页面事件
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) fillText(detail.text);
    };
    window.addEventListener(CdfEvents.CHAT_PREFILL, handler);
    return () => window.removeEventListener(CdfEvents.CHAT_PREFILL, handler);
  }, []);

  // caretPos 不再需要（textarea 使用 selectionStart/End），保留空函数以兼容事件绑定
  const updateCaretPos = useCallback(() => {}, []);

  const handleInputChange = useCallback((e?: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e?.target?.value ?? editableRef.current?.value ?? '';
    setInputValue(text);
    updateCaretPos();

    // textarea 自动高度：随内容增长，上限后内部滚动
    const el = editableRef.current;
    if (el) {
      el.style.height = 'auto';
      const maxHeight = 200; // 上限约 10 行
      el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }

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
  handleInputChangeRef.current = () => handleInputChange();

  const handleInputClick = (e: React.MouseEvent) => {
    // 若点击落在 textarea / input / contenteditable 自身或其内部，不做任何事
    // 使用 contains() 而非 tagName 检查 — WKWebView 中 e.target 可能不是预期元素
    const target = e.target as HTMLElement;
    if (editableRef.current && (editableRef.current === target || editableRef.current.contains(target))) return;
    if (target.tagName === 'INPUT' || target.isContentEditable) return;
    // v2.3.1-fix: 点击输入框时清除 composition 残留标记，防止回车被误判
    compositionJustEndedRef.current = false;
    // 只有当目前焦点不在输入框时，才手动聚焦
    if (document.activeElement !== editableRef.current) {
      editableRef.current?.focus();
    }
  };

  const handleSkillSelect = (skill: Skill) => {
    // R2b-4：选择技能前最终检查状态（active 才可绑定）；SkillSelector 已过滤 activeOnly，这里是兜底
    if (skill.status !== 'active') {
      showToast(`技能「${skill.name}」已被停用，请到「技能 → 内置」页面启用后再选择`, 'info');
      return;
    }
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
        editableRef.current.value = lines.join('\n');
      }
      setInputValue(editableRef.current.value);
      setTimeout(() => {
        if (editableRef.current) {
          const len = editableRef.current.value.length;
          editableRef.current.selectionStart = len;
          editableRef.current.selectionEnd = len;
          safeFocusEditable();
        }
      }, 0);
    }
  };

  // 选择技能链后立即触发执行
  const handleChainSelect = useCallback((chain: SkillChain) => {
    showToast(t('正在执行技能链: {name}', { name: chain.name }), 'info', 2000);
    executeSkillChain(chain.id)
      .then((result) => {
        const execId = (result as { executionId?: string })?.executionId;
        showToast(t('技能链已启动：{name}（执行 ID: {execId}）', { name: chain.name, execId: execId || '-' }), 'success', 3000);
      })
      .catch((err: Error) => {
        showToast(t('执行技能链失败：{error}', { error: err.message }), 'error', 3000);
      });
  }, [showToast, t]);

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
      editableRef.current.value = lines.join('\n');
      setInputValue(editableRef.current.value);
      setTimeout(() => {
        if (editableRef.current) {
          const len = editableRef.current.value.length;
          editableRef.current.selectionStart = len;
          editableRef.current.selectionEnd = len;
          safeFocusEditable();
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
    setTimeout(() => safeFocusEditable(), 0);
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
      editableRef.current.value = '';
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
      folderContext: folderContext || undefined,
    });
    if (editableRef.current) {
      editableRef.current.value = '';
      // 重置 textarea 高度
      editableRef.current.style.height = 'auto';
      editableRef.current.style.overflowY = 'hidden';
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
        editableRef.current.value = '';
      }
      window.dispatchEvent(new CustomEvent('cdf-chat-clear'));
      showToast(t('对话已清空'), 'success', 2000);
    }
    setShowClearConfirm(false);
  }, [session?.id, showToast, t]);

  // 复制对话
  const handleCopyChat = useCallback(async () => {
    if (!session?.messages || session.messages.length === 0) {
      showToast(t('没有可复制的对话内容'), 'info', 2000);
      return;
    }
    const text = session.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role === 'user' ? t('用户') : 'AI'}: ${m.content}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('对话已复制到剪贴板'), 'success', 2000);
    } catch {
      showToast(t('复制失败，请手动复制'), 'error', 2000);
    }
  }, [session?.messages, showToast, t]);

  // 导出对话
  const handleExportChat = useCallback(() => {
    if (!session?.messages || session.messages.length === 0) {
      showToast(t('没有可导出的对话内容'), 'info', 2000);
      return;
    }
    const exportData = {
      title: session.title || t('对话记录'),
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
    a.download = `${session.title || t('对话记录')}_${new Date().toLocaleDateString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('对话已导出'), 'success', 2000);
  }, [session, showToast, t]);

  /**
   * v1.5.73: compositionend 后标记 — 解决 WKWebView 中 compositionend 先于 keydown 触发的问题
   *
   * WKWebView 事件顺序（中文输入法按 Enter 确认选字时）：
   *   compositionend → keydown(Enter)
   *
   * compositionend 会重置 isComposingRef，
   * 导致后续 keydown(Enter) 检测失败，消息被误发送。
   *
   * 此 ref 在 compositionend 中设为 true，在 keydown(Enter) 中检测并清除，
   * 确保 IME 确认用的 Enter 不会被当作发送快捷键。
   */
  const compositionJustEndedRef = useRef(false);

  /**
   * 检测当前是否处于 IME 组合状态
   *
   * textarea 原生支持 IME，检测简化为：
   * 1. nativeEvent.isComposing（标准浏览器最可靠）
   * 2. isComposingRef（onCompositionStart/End 维护）
   * 3. compositionJustEndedRef（compositionend → keydown 之间的过渡期）
   */
  const isComposing = (e: React.KeyboardEvent | React.CompositionEvent): boolean => {
    // @ts-expect-error nativeEvent 类型兼容
    const nativeIsComposing = e.nativeEvent?.isComposing;
    if (typeof nativeIsComposing === 'boolean') {
      return nativeIsComposing || isComposingRef.current || compositionJustEndedRef.current;
    }
    return isComposingRef.current || compositionJustEndedRef.current;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const justEndedComposition = compositionJustEndedRef.current;
    compositionJustEndedRef.current = false;
    const composing = isComposing(e);

    // 斜杠命令选择器键盘导航
    if (handleFloatingListKeyDown(e, composing, justEndedComposition, {
      isOpen: showSlashCommands,
      itemCount: filteredSlashCommands.length,
      focusIndex: slashCommandFocusIndex,
      setFocusIndex: setSlashCommandFocusIndex,
      onSelect: (idx) => {
        const cmd = filteredSlashCommands[idx];
        if (cmd) handleSlashCommandSelect(cmd);
      },
      onClose: () => { setShowSlashCommands(false); setSlashCommandFocusIndex(0); },
      allowTabSelect: true,
    })) return;

    // 技能选择器键盘导航
    if (handleFloatingListKeyDown(e, composing, justEndedComposition, {
      isOpen: showSkillSelector,
      itemCount: slashFilteredCount,
      focusIndex: skillFocusIndex,
      setFocusIndex: setSkillFocusIndex,
      onSelect: (idx) => {
        if (idx >= 0 && idx < slashFilteredCount) {
          if (slashFilteredSkills[idx]) handleSkillSelect(slashFilteredSkills[idx]);
        } else {
          handleSend();
        }
      },
      onClose: () => { setShowSkillSelector(false); },
    })) return;

    if (e.key === 'Enter' && !e.shiftKey && !composing && !justEndedComposition) {
      isComposingRef.current = false;
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
          border: variant === 'cardless' || isCardVariant ? 'none' : `1px solid ${gs.border}`,
          bgcolor: 'transparent',
          boxShadow: 'none',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(70vh - 60px)',
          overflow: 'hidden',
          transition: 'border-color 0.25s ease, box-shadow 0.25s ease',
        }}
      >
        {/* v1.7.0: 意图分类 Chips 行 — 仅当选中技能有 intentCategories 时展示 */}
        {selectedSkill?.intentCategories && selectedSkill.intentCategories.length > 0 && (
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 11, color: gs.textMuted, fontWeight: 500, mr: 0.25, flexShrink: 0 }}>
              {t('查询意图')}
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
          <Box sx={{ px: 1.5, py: 0.5, borderBottom: `1px solid ${gs.border}`, display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
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
          <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
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
                {t('上传中...')}
              </Typography>
            )}
          </Box>
        )}
        {/* C-5: 上下文计量表（无边框，不产生分隔线） */}
        {(() => {
          if (!session?.messages || session.messages.length === 0) return null;
          const totalTokens = session.messages.reduce((sum, m) => sum + (m.usage?.totalTokens || 0), 0);
          const modelConfig = modelList.find(m => m.id === session.model);
          const maxTokens = modelConfig?.contextWindow || 128000;
          return (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              px: 1.5,
              py: 0.25,
              minHeight: 20,
            }}>
              <ContextMeter usedTokens={totalTokens} maxTokens={maxTokens} showLabel />
            </Box>
          );
        })()}
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
                  mt: 0,
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
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    fontSize: 14,
                    color: gs.textMuted,
                    lineHeight: 1.5,
                    pointerEvents: 'none',
                    pt: 0,
                  }}
                >
                  {t('今天帮你做些什么？')} <Box component="span" sx={{ color: gs.textDisabled, ml: 0.5 }}>{t('@ 引用对话文件，/ 调用技能与指令')}</Box>
                </Typography>
              )}
              <textarea
                ref={editableRef}
                data-testid="chat-input"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onKeyUp={updateCaretPos}
                onClick={updateCaretPos}
                onMouseDown={(e) => e.stopPropagation()}
                onFocus={() => {
                  isInputFocusedRef.current = true;
                  updateCaretPos();
                }}
                onBlur={() => {
                  isInputFocusedRef.current = false;
                  const text = editableRef.current?.value || '';
                  window.dispatchEvent(new CustomEvent('cdf-chat-input-blur', {
                    detail: { value: text },
                  }));
                }}
                onCompositionStart={() => { isComposingRef.current = true; compositionJustEndedRef.current = false; }}
                onCompositionEnd={() => {
                  const wasComposing = isComposingRef.current;
                  isComposingRef.current = false;
                  if (wasComposing) {
                    compositionJustEndedRef.current = true;
                  }
                }}
                rows={1}
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
                  paddingTop: 0,
                  resize: 'none',
                  border: 'none',
                  backgroundColor: 'transparent',
                  fontFamily: 'inherit',
                  overflow: 'hidden',
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Toolbar */}
        <ChatToolbar
          selectedModel={modelsLoading ? t('加载中...') : selectedModel}
          onModelChange={handleModelChange}
          selectedPermission={selectedPermission}
          onPermissionChange={setSelectedPermission}
          isLoading={isLoading}
          inputValue={inputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          onSkillSelect={handleSkillSelect}
          onChainSelect={handleChainSelect}
          modelOptions={MODEL_OPTIONS}
          onOpenAISettings={() => setShowAISettings(true)}
          modelsLoading={modelsLoading}
          onAttachClick={() => fileInputRef.current?.click()}
          hasAttachments={pendingAttachments.length > 0}
          thinkingLevel={thinkingLevel}
          onThinkingLevelChange={setThinkingLevel}
          thinkingLevels={getAvailableThinkingLevels.map(l => ({
            value: l.value,
            label: l.value === 'off' ? t('关闭思考') :
                   l.value === 'low' ? t('快速思考') :
                   l.value === 'medium' ? t('标准思考') :
                   t('深度思考'),
            desc: l.value === 'off' ? t('直接输出结果，不进行深度推理') :
                  l.value === 'low' ? t('轻量推理，响应更快') :
                  l.value === 'medium' ? t('平衡推理深度和速度') :
                  t('更深入的推理分析'),
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
              onClick={selectedFolder || isSelectingFolder ? undefined : handleSelectFolder}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: '10px',
                cursor: selectedFolder || isSelectingFolder ? 'default' : 'pointer',
                color: selectedFolder ? '#6366f1' : gs.textMuted,
                fontSize: 13,
                bgcolor: 'transparent',
                border: 'none',
                maxWidth: 320,
                transition: 'all 0.2s ease',
                '&:hover': selectedFolder || isSelectingFolder
                  ? {}
                  : {
                      bgcolor: 'transparent',
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
                {isSelectingFolder ? (
                  <CircularProgress size={14} sx={{ color: gs.textMuted }} />
                ) : (
                  <FolderOpenIcon sx={{ fontSize: 14, color: selectedFolder ? '#6366f1' : 'inherit' }} />
                )}
              </Box>
              {isSelectingFolder ? (
                <Typography sx={{ fontSize: 13, color: gs.textMuted }}>
                  {t('读取中...')}
                </Typography>
              ) : selectedFolder ? (
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
                  <Tooltip title={t('清除文件夹')}>
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
                    {t('选择文件夹')}
                  </Typography>
                  <KeyboardArrowDownIcon
                    sx={{
                      fontSize: 16,
                      color: gs.textDisabled,
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </>
              )}
            </Box>
            {/* 隐藏的文件夹选择 input（Web 回退方案） */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error FIXME: webkitdirectory 是非标准 HTML 属性，TS lib.dom 未声明，生产环境所有主流浏览器均支持
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
            {t('清空对话')}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: '0.875rem', color: gs.textMuted }}>
            {t('确定要清空当前对话的所有消息吗？此操作不可撤销。')}
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
            {t('取消')}
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
            {t('确认清空')}
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

      {/* Skill selector dropdown — @ 触发；R2b-4：只列出 active 状态（用户未停用）的技能 */}
      {showSkills && (
        <SkillSelector
          anchorEl={containerRef.current}
          onSelect={handleSkillSelect}
          onClose={() => setShowSkills(false)}
          activeOnly
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
                {t('点击示例快速查询')}
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
