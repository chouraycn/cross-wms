/**
 * AI 助手浮动面板 — 右下角 FAB 按钮 + 右侧侧滑聊天面板
 * 极简黑白灰调性，与 CrossWMS 设计一致
 */

import React, { useState, useCallback, useRef, useEffect, createContext, useContext } from 'react';
import {
  Box,
  IconButton,
  Slide,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  CircularProgress,
  Paper,
  Tooltip,
  Chip,
  Snackbar,
  Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import StopOutlinedIcon from '@mui/icons-material/StopOutlined';
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';

import { Message, Session, Model, PermissionRequest, PermissionMode, ToolCall, ContentBlock } from './types';
import * as api from './api';

// ==================== Context ====================

interface AIAssistantState {
  isOpen: boolean;
  sessions: Session[];
  currentSessionId: string | null;
  models: Model[];
  selectedModel: string;
  isLoading: boolean;
  isConnected: boolean;
  permissionRequest: PermissionRequest | null;
  permissionMode: PermissionMode;
}

interface AIAssistantContextType extends AIAssistantState {
  currentSession: Session | undefined;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  sendMessage: (content: string) => void;
  stopGeneration: () => void;
  selectSession: (sessionId: string) => void;
  createNewSession: () => void;
  deleteSession: (sessionId: string) => void;
  setSelectedModel: (modelId: string) => void;
  handlePermissionAllow: () => void;
  handlePermissionDeny: () => void;
  setPermissionMode: (mode: PermissionMode) => void;
}

const AIAssistantContext = createContext<AIAssistantContextType | null>(null);

export function useAIAssistant() {
  const ctx = useContext(AIAssistantContext);
  if (!ctx) throw new Error('useAIAssistant must be used within AIAssistantProvider');
  return ctx;
}

// ==================== Provider ====================

export const AIAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModelState] = useState('claude-sonnet-4');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'error',
  });

  // 保存当前 SSE 请求的 AbortController 引用
  const abortControllerRef = useRef<AbortController | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  // 显示错误提示
  const showError = useCallback((message: string) => {
    setSnackbar({ open: true, message, severity: 'error' });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar(prev => ({ ...prev, open: false }));
  }, []);

  // 初始化：检查后端连接 + 获取模型列表（带自动重试）
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;

    const tryConnect = async () => {
      while (!cancelled && attempts < MAX_ATTEMPTS) {
        try {
          await api.healthCheck();
          if (cancelled) return;
          setIsConnected(true);

          const modelsData = await api.getModels();
          if (!cancelled && modelsData.models?.length > 0) {
            setModels(modelsData.models);
            if (!selectedModel || !modelsData.models.some(m => m.modelId === selectedModel)) {
              setSelectedModelState(modelsData.defaultModel || modelsData.models[0].modelId);
            }
          }

          // 加载历史会话
          const sessionsData = await api.getSessions();
          if (!cancelled && sessionsData.sessions) {
            const loaded: Session[] = sessionsData.sessions.map((s: any) => ({
              id: s.id,
              title: s.title,
              model: s.model,
              sdkSessionId: s.sdk_session_id,
              createdAt: new Date(s.created_at),
              updatedAt: new Date(s.updated_at),
              messages: [],
            }));
            setSessions(loaded);
          }
          return; // 连接成功
        } catch {
          attempts++;
          if (!cancelled && attempts < MAX_ATTEMPTS) {
            await new Promise(r => setTimeout(r, 1500));
          }
        }
      }
      if (!cancelled) {
        setIsConnected(false);
      }
    };
    tryConnect();
    return () => { cancelled = true; };
  }, []);

  const togglePanel = useCallback(() => setIsOpen(prev => !prev), []);
  const openPanel = useCallback(() => setIsOpen(true), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  // 发送消息
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    let sessionId = currentSessionId;

    // 如果没有当前会话，创建新的
    if (!sessionId) {
      const newSession: Session = {
        id: crypto.randomUUID(),
        title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
        model: selectedModel,
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
    }

    // 添加用户消息
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // 添加空的助手消息（占位）
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      model: selectedModel,
      timestamp: new Date(),
      isStreaming: true,
      contentBlocks: [],
    };

    setSessions(prev => prev.map(s => {
      if (s.id === sessionId) {
        return {
          ...s,
          title: s.messages.length === 0 ? content.slice(0, 30) + (content.length > 30 ? '...' : '') : s.title,
          messages: [...s.messages, userMessage, assistantMessage],
        };
      }
      return s;
    }));

    setIsLoading(true);

    let fullContent = '';
    let currentToolCalls: ToolCall[] = [];
    let contentBlocks: ContentBlock[] = [];
    let currentTextBlock = '';
    let realSessionId = sessionId;
    let realAssistantMessageId = assistantMessage.id;

    try {
      await api.sendChatMessage(
        {
          sessionId,
          message: content,
          model: selectedModel,
          permissionMode,
        },
        {
          onInit: (data) => {
            realSessionId = data.sessionId;
            realAssistantMessageId = data.assistantMessageId;

            if (data.sessionId !== sessionId) {
              setCurrentSessionId(data.sessionId);
              setSessions(prev => prev.map(s =>
                s.id === sessionId ? { ...s, id: data.sessionId } : s
              ));
              sessionId = data.sessionId;
            }
          },
          onText: (text) => {
            fullContent += text;
            currentTextBlock += text;

            const lastBlock = contentBlocks[contentBlocks.length - 1];
            if (lastBlock && lastBlock.type === 'text') {
              lastBlock.text = currentTextBlock;
            } else if (currentTextBlock) {
              contentBlocks.push({ type: 'text', text: currentTextBlock });
            }

            setSessions(prev => prev.map(s => {
              if (s.id === realSessionId) {
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === realAssistantMessageId
                      ? { ...m, content: fullContent, contentBlocks: [...contentBlocks] }
                      : m
                  ),
                };
              }
              return s;
            }));
          },
          onTool: (data) => {
            currentTextBlock = '';
            const toolCall: ToolCall = {
              id: data.id || crypto.randomUUID(),
              name: data.name,
              input: data.input,
              status: 'running',
            };
            currentToolCalls.push(toolCall);
            contentBlocks.push({ type: 'tool_use', toolCall });

            setSessions(prev => prev.map(s => {
              if (s.id === realSessionId) {
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === realAssistantMessageId
                      ? { ...m, toolCalls: [...currentToolCalls], contentBlocks: [...contentBlocks] }
                      : m
                  ),
                };
              }
              return s;
            }));
          },
          onToolResult: (data) => {
            const toolIndex = data.toolId
              ? currentToolCalls.findIndex(t => t.id === data.toolId)
              : currentToolCalls.length - 1;

            if (toolIndex >= 0) {
              currentToolCalls[toolIndex].status = data.isError ? 'error' : 'completed';
              currentToolCalls[toolIndex].isError = data.isError;
              currentToolCalls[toolIndex].result = data.content;

              const blockIndex = contentBlocks.findIndex(
                b => b.type === 'tool_use' && b.toolCall.id === currentToolCalls[toolIndex].id
              );
              if (blockIndex >= 0) {
                (contentBlocks[blockIndex] as { type: 'tool_use'; toolCall: ToolCall }).toolCall = {
                  ...currentToolCalls[toolIndex],
                };
              }

              setSessions(prev => prev.map(s => {
                if (s.id === realSessionId) {
                  return {
                    ...s,
                    messages: s.messages.map(m =>
                      m.id === realAssistantMessageId
                        ? { ...m, toolCalls: [...currentToolCalls], contentBlocks: [...contentBlocks] }
                        : m
                    ),
                  };
                }
                return s;
              }));
            }
          },
          onPermissionRequest: (data) => {
            setPermissionRequest(data);
          },
          onDone: () => {
            setSessions(prev => prev.map(s => {
              if (s.id === realSessionId) {
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === realAssistantMessageId
                      ? { ...m, isStreaming: false }
                      : m
                  ),
                };
              }
              return s;
            }));
          },
          onError: (message) => {
            showError(message);
            setSessions(prev => prev.map(s => {
              if (s.id === realSessionId) {
                return {
                  ...s,
                  messages: s.messages.map(m =>
                    m.id === realAssistantMessageId
                      ? { ...m, content: message, isStreaming: false }
                      : m
                  ),
                };
              }
              return s;
            }));
          },
          // 保存 AbortController 引用
          onAbortController: (controller) => {
            abortControllerRef.current = controller;
          },
        }
      );
    } catch (error: any) {
      const errorMsg = `错误: ${error?.message || '未知错误'}`;
      showError(errorMsg);
      setSessions(prev => prev.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: errorMsg, isStreaming: false }
                : m
            ),
          };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [currentSessionId, selectedModel, isLoading, permissionMode, showError]);

  const stopGeneration = useCallback(() => {
    // 中止当前的 SSE 请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const selectSession = useCallback(async (sessionId: string) => {
    setCurrentSessionId(sessionId);

    // 如果该会话还没有加载消息，从后端加载
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.messages.length === 0) {
      try {
        const data = await api.getSession(sessionId);
        if (data.messages) {
          const messages: Message[] = data.messages.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
            timestamp: new Date(m.created_at),
            toolCalls: m.tool_calls || undefined,
          }));
          setSessions(prev => prev.map(s =>
            s.id === sessionId ? { ...s, messages } : s
          ));
        }
      } catch (error) {
        // 使用 Snackbar 替代 console.error
        showError('加载会话消息失败');
      }
    }
  }, [sessions, showError]);

  const createNewSession = useCallback(() => {
    setCurrentSessionId(null);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      await api.deleteSession(sessionId);
    } catch {
      // 即使 API 失败，也本地删除
    }
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
    }
  }, [currentSessionId]);

  const handleModelChange = useCallback((modelId: string) => {
    setSelectedModelState(modelId);
  }, []);

  const handlePermissionAllow = useCallback(async () => {
    if (!permissionRequest) return;
    try {
      await api.sendPermissionResponse(permissionRequest.requestId, 'allow');
    } catch { /* ignore */ }
    setPermissionRequest(null);
  }, [permissionRequest]);

  const handlePermissionDeny = useCallback(async () => {
    if (!permissionRequest) return;
    try {
      await api.sendPermissionResponse(permissionRequest.requestId, 'deny', '用户拒绝了此操作');
    } catch { /* ignore */ }
    setPermissionRequest(null);
  }, [permissionRequest]);

  const contextValue: AIAssistantContextType = {
    isOpen,
    sessions,
    currentSessionId,
    currentSession,
    models,
    selectedModel,
    isLoading,
    isConnected,
    permissionRequest,
    permissionMode,
    togglePanel,
    openPanel,
    closePanel,
    sendMessage,
    stopGeneration,
    selectSession,
    createNewSession,
    deleteSession,
    setSelectedModel: handleModelChange,
    handlePermissionAllow,
    handlePermissionDeny,
    setPermissionMode,
  };

  return (
    <AIAssistantContext.Provider value={contextValue}>
      {children}
      {/* 错误提示 Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        sx={{ mb: 8 }}
      >
        <Alert onClose={hideSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </AIAssistantContext.Provider>
  );
};

// ==================== FAB 按钮 ====================

export const AIAssistantFab: React.FC = () => {
  const { isOpen, togglePanel, isConnected } = useAIAssistant();

  return (
    <Tooltip title={isConnected ? 'AI 助手' : 'AI 助手（未连接）'} arrow placement="left">
      <IconButton
        onClick={togglePanel}
        sx={{
          position: 'fixed',
          right: 24,
          bottom: 24,
          width: 48,
          height: 48,
          borderRadius: '50%',
          backgroundColor: isOpen ? '#374151' : '#111827',
          color: '#FFFFFF',
          boxShadow: isOpen
            ? '0 4px 12px rgba(0,0,0,0.15)'
            : '0 2px 8px rgba(0,0,0,0.2)',
          transition: 'all 0.2s ease',
          zIndex: 9998,
          '&:hover': {
            backgroundColor: isOpen ? '#4B5563' : '#1F2937',
            transform: 'scale(1.05)',
          },
          '&::after': !isConnected ? {
            content: '""',
            position: 'absolute',
            top: 2,
            right: 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: '#EF4444',
            border: '2px solid #FFFFFF',
          } : {},
        }}
      >
        <SmartToyOutlinedIcon sx={{ fontSize: 22 }} />
      </IconButton>
    </Tooltip>
  );
};

// ==================== 侧滑面板 ====================

export const AIAssistantPanel: React.FC = () => {
  const {
    isOpen,
    closePanel,
    sessions,
    currentSessionId,
    currentSession,
    models,
    selectedModel,
    isLoading,
    isConnected,
    permissionRequest,
    sendMessage,
    stopGeneration,
    selectSession,
    createNewSession,
    deleteSession,
    setSelectedModel,
    handlePermissionAllow,
    handlePermissionDeny,
  } = useAIAssistant();

  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  // 面板打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (inputValue.trim()) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  }, [inputValue, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const messages = currentSession?.messages || [];

  return (
    <Slide direction="left" in={isOpen} mountOnEnter unmountOnExit>
      <Paper
        elevation={16}
        sx={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: 400,
          maxWidth: '100vw',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 0,
          borderLeft: '1px solid #E5E7EB',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* ===== 顶部标题栏 ===== */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: '1px solid #E5E7EB',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmartToyOutlinedIcon sx={{ fontSize: 20, color: '#111827' }} />
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827' }}>
              AI 助手
            </Typography>
            {!isConnected && (
              <Chip
                label="未连接"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6875rem',
                  backgroundColor: '#FEF2F2',
                  color: '#EF4444',
                }}
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {/* 模型选择器 */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!isConnected}
                sx={{
                  fontSize: '0.75rem',
                  height: 28,
                  '& .MuiSelect-select': {
                    py: 0.25,
                    pr: 3,
                  },
                }}
              >
                {models.map(model => (
                  <MenuItem key={model.modelId} value={model.modelId} sx={{ fontSize: '0.75rem' }}>
                    {model.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <IconButton size="small" onClick={closePanel} sx={{ color: '#6B7280' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* ===== 会话历史标签（可折叠） ===== */}
        {sessions.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.75,
              borderBottom: '1px solid #F3F4F6',
              overflowX: 'auto',
              flexShrink: 0,
              '&::-webkit-scrollbar': { height: 0 },
            }}
          >
            <IconButton
              size="small"
              onClick={createNewSession}
              sx={{ color: '#6B7280', mr: 0.5, flexShrink: 0 }}
            >
              <AddOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
            {sessions.slice(0, 8).map(session => (
              <Chip
                key={session.id}
                label={session.title}
                size="small"
                variant={currentSessionId === session.id ? 'filled' : 'outlined'}
                onClick={() => selectSession(session.id)}
                onDelete={() => deleteSession(session.id)}
                deleteIcon={<DeleteOutlineOutlinedIcon sx={{ fontSize: 14 }} />}
                sx={{
                  maxWidth: 120,
                  fontSize: '0.6875rem',
                  height: 24,
                  '& .MuiChip-label': {
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  },
                  ...(currentSessionId === session.id ? {
                    backgroundColor: '#111827',
                    color: '#FFFFFF',
                    '& .MuiChip-deleteIcon': { color: 'rgba(255,255,255,0.7)' },
                  } : {
                    borderColor: '#E5E7EB',
                    color: '#6B7280',
                  }),
                }}
              />
            ))}
          </Box>
        )}

        {/* ===== 消息区域 ===== */}
        <Box
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            px: 2,
            py: 2,
            backgroundColor: '#FAFBFC',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'rgba(0,0,0,0.1)',
              borderRadius: 2,
            },
          }}
        >
          {messages.length === 0 ? (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9CA3AF',
              }}
            >
              <ChatBubbleOutlineOutlinedIcon sx={{ fontSize: 40, mb: 1.5, opacity: 0.5 }} />
              <Typography sx={{ fontSize: '0.8125rem', mb: 0.5 }}>
                开始对话
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: '#D1D5DB' }}>
                问我任何问题，或让我帮你分析数据
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {messages.map((message: Message) => (
                <Box
                  key={message.id}
                  sx={{
                    display: 'flex',
                    flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                    gap: 1,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* 头像 */}
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      backgroundColor: message.role === 'user' ? '#111827' : '#F3F4F6',
                      color: message.role === 'user' ? '#FFFFFF' : '#6B7280',
                    }}
                  >
                    {message.role === 'user' ? (
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600 }}>U</Typography>
                    ) : (
                      <SmartToyOutlinedIcon sx={{ fontSize: 16 }} />
                    )}
                  </Box>

                  {/* 消息内容 */}
                  <Box
                    sx={{
                      maxWidth: '80%',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.5,
                      alignItems: message.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {/* 模型标签 */}
                    {message.role === 'assistant' && message.model && (
                      <Typography sx={{ fontSize: '0.625rem', color: '#9CA3AF' }}>
                        {message.model}
                      </Typography>
                    )}

                    {/* 内容块 */}
                    {message.role === 'user' ? (
                      <Box
                        sx={{
                          px: 2,
                          py: 1,
                          borderRadius: '12px 12px 2px 12px',
                          backgroundColor: '#111827',
                          color: '#FFFFFF',
                          fontSize: '0.8125rem',
                          lineHeight: 1.5,
                          wordBreak: 'break-word',
                        }}
                      >
                        {message.content}
                      </Box>
                    ) : (
                      <>
                        {message.contentBlocks && message.contentBlocks.length > 0 ? (
                          message.contentBlocks.map((block: ContentBlock, i: number) => {
                            if (block.type === 'text') {
                              return (
                                <Box
                                  key={`text-${i}`}
                                  sx={{
                                    px: 2,
                                    py: 1,
                                    borderRadius: '12px 12px 12px 2px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '0.8125rem',
                                    lineHeight: 1.6,
                                    color: '#1F2937',
                                    wordBreak: 'break-word',
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  {block.text}
                                  {message.isStreaming && i === (message.contentBlocks?.length ?? 0) - 1 && (
                                    <Box
                                      component="span"
                                      sx={{
                                        display: 'inline-block',
                                        width: 2,
                                        height: 14,
                                        backgroundColor: '#111827',
                                        ml: 0.5,
                                        animation: 'blink 1s step-end infinite',
                                        '@keyframes blink': {
                                          '50%': { opacity: 0 },
                                        },
                                      }}
                                    />
                                  )}
                                </Box>
                              );
                            } else if (block.type === 'tool_use') {
                              return (
                                <Box
                                  key={`tool-${block.toolCall.id}`}
                                  sx={{
                                    px: 1.5,
                                    py: 0.75,
                                    borderRadius: 1,
                                    backgroundColor: block.toolCall.status === 'running' ? '#FFFBEB' : block.toolCall.status === 'error' ? '#FEF2F2' : '#F0FDF4',
                                    border: `1px solid ${block.toolCall.status === 'running' ? '#FDE68A' : block.toolCall.status === 'error' ? '#FECACA' : '#BBF7D0'}`,
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    color: '#374151',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                  }}
                                >
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    {block.toolCall.status === 'running' && (
                                      <CircularProgress size={10} sx={{ color: '#D97706' }} />
                                    )}
                                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 500 }}>
                                      {block.toolCall.name}
                                    </Typography>
                                  </Box>
                                </Box>
                              );
                            }
                            return null;
                          })
                        ) : message.content ? (
                          <Box
                            sx={{
                              px: 2,
                              py: 1,
                              borderRadius: '12px 12px 12px 2px',
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E5E7EB',
                              fontSize: '0.8125rem',
                              lineHeight: 1.6,
                              color: '#1F2937',
                              wordBreak: 'break-word',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {message.content}
                          </Box>
                        ) : message.isStreaming ? (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              px: 2,
                              py: 1,
                              borderRadius: '12px 12px 12px 2px',
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E5E7EB',
                            }}
                          >
                            <CircularProgress size={14} />
                            <Typography sx={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>
                              思考中...
                            </Typography>
                          </Box>
                        ) : null}
                      </>
                    )}
                  </Box>
                </Box>
              ))}
              <div ref={messagesEndRef} />
            </Box>
          )}
        </Box>

        {/* ===== 权限请求 ===== */}
        {permissionRequest && (
          <Box
            sx={{
              px: 2,
              py: 1.5,
              backgroundColor: '#FFFBEB',
              borderTop: '1px solid #FDE68A',
              flexShrink: 0,
            }}
          >
            <Typography sx={{ fontSize: '0.8125rem', fontWeight: 500, mb: 0.5, color: '#92400E' }}>
              工具请求: {permissionRequest.toolName}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="contained"
                onClick={handlePermissionAllow}
                sx={{
                  backgroundColor: '#111827',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  '&:hover': { backgroundColor: '#1F2937' },
                }}
              >
                允许
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={handlePermissionDeny}
                sx={{
                  borderColor: '#D1D5DB',
                  color: '#6B7280',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                }}
              >
                拒绝
              </Button>
            </Box>
          </Box>
        )}

        {/* ===== 输入区域 ===== */}
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderTop: '1px solid #E5E7EB',
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              backgroundColor: '#F9FAFB',
              borderRadius: 2,
              border: '1px solid #E5E7EB',
              px: 1.5,
              py: 0.5,
              '&:focus-within': {
                borderColor: '#9CA3AF',
              },
            }}
          >
            <TextField
              inputRef={inputRef}
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isConnected ? '输入消息...' : 'AI 助手未连接'}
              disabled={!isConnected || isLoading}
              variant="standard"
              sx={{
                '& .MuiInput-root': {
                  fontSize: '0.8125rem',
                  lineHeight: 1.5,
                  '&:before': { display: 'none' },
                  '&:after': { display: 'none' },
                },
                '& .MuiInput-input': {
                  py: 0.75,
                },
              }}
            />
            <IconButton
              size="small"
              onClick={isLoading ? stopGeneration : handleSend}
              disabled={!isConnected || (!isLoading && !inputValue.trim())}
              sx={{
                color: isLoading ? '#EF4444' : '#111827',
                mb: 0.25,
              }}
            >
              {isLoading ? <StopOutlinedIcon fontSize="small" /> : <SendOutlinedIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      </Paper>
    </Slide>
  );
};

export default AIAssistantPanel;
