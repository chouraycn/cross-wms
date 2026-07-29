import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ApiError,
  SHOW_DEBUG,
  TENANT_ID,
  api,
  isAuthError,
  streamChatTurn,
} from '../../../components/staff/api/client.js';
import {
  clearEnterpriseAuthSession,
  getEnterpriseAuthSession,
} from '../../../components/staff/auth.js';
import {
  emitAgentScopeChange,
  persistSharedAgentScope,
  sessionFilterStorageKey,
} from '../../../components/staff/lib/agent-scope-storage.js';
import { getClientTimeZone } from '../../../components/staff/lib/timezone.js';
import {
  agentResourceCount,
  employeeDisplayName,
  employeeProfile,
} from '../../../components/staff/employee.js';
import { notify } from '../../../components/staff/ui/app-toast.js';
import type {
  AgentProfileRead,
  ChatAttachmentRead,
  ChatMessage,
  ChatTurnResponse,
  HumanHandoffRead,
  KnowledgeCitation,
  ModelConfigRead,
  ScheduledTaskDraftRead,
  ScheduledTaskRead,
  UIConfigRead,
} from '../../../components/staff/types/index.js';

import {
  SELECTED_AGENT_STORAGE_KEY,
  loadSessionReadTimes,
  persistSessionReadTimes,
  sessionReadStorageKey,
} from './chatHelpers.js';
import {
  clipboardContainsComposerImage,
  computeMergedMessages,
  effectiveMessageTurnId,
  extractPastedComposerFiles,
} from './chatHelpers.js';
import {
  createEmptySlot,
  createStreamSlot,
  createTurnTrace,
  type ComposerAttachment,
  type ComposerInteractionMode,
  type SessionSlot,
  type StreamSlot,
  type TurnTrace,
} from './chatTypes.js';
import type { ChatSession } from './chatTypes.js';
import {
  chatQueueStorageKey,
  readQueuedChatTurns,
  writeQueuedChatTurns,
  type PreparedChatTurn,
} from './chatQueueStorage.js';

const CHAT_BASE_PATH = '/staff/chat';
const ENTERPRISE_SIDEBAR_STORAGE_KEY = 'ultrarag_enterprise_sidebar_expanded';

export type UseChatSessionOptions = {
  /**
   * Anonymous mode for the public site embed: never redirect to login on a
   * missing/expired session.
   */
  anonymous?: boolean;
};

export function useChatSession(options: UseChatSessionOptions = {}) {
  const { anonymous = false } = options;
  const { sessionId, draftAgentId } = useParams<{ sessionId?: string; draftAgentId?: string }>();
  const navigate = useNavigate();
  const [auth] = useState(() => getEnterpriseAuthSession());
  const tenantId = auth?.user.tenant_id || TENANT_ID;
  const userId = auth?.user.id || '';
  const queueStorageKey = chatQueueStorageKey(tenantId, userId);
  const [restoredQueuedTurns] = useState(() => (
    readQueuedChatTurns(window.sessionStorage, queueStorageKey)
  ));

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionReadTimes, setSessionReadTimes] = useState<Record<string, string>>(() => loadSessionReadTimes(userId));
  const [agents, setAgents] = useState<AgentProfileRead[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState(() => window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY) || '');
  const [sessionAgentFilter, setSessionAgentFilter] = useState(() => (
    window.localStorage.getItem(sessionFilterStorageKey(userId))
    || window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY)
    || 'all'
  ));
  const [modelConfigs, setModelConfigs] = useState<ModelConfigRead[]>([]);
  const [selectedModelConfigId, setSelectedModelConfigId] = useState(
    () => window.localStorage.getItem(`${'skill_agent_selected_model_config'}:${tenantId}`) || '',
  );
  const [modelConfigsLoading, setModelConfigsLoading] = useState(Boolean(auth));
  const [modelConfigsLoadError, setModelConfigsLoadError] = useState('');
  const [modelSetupOpen, setModelSetupOpen] = useState(false);
  const [input, setInput] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachment[]>([]);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [composerPlusOpen, setComposerPlusOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState<Exclude<ComposerInteractionMode, 'normal'> | null>(null);
  const [lastTurn, setLastTurn] = useState<ChatTurnResponse | null>(null);
  const [renameSession, setRenameSession] = useState<ChatSession | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const [storeTick, setStoreTick] = useState(0);
  const [streamTick, setStreamTick] = useState(0);
  const [traceTick, setTraceTick] = useState(0);
  const [feedbackTick, setFeedbackTick] = useState(0);
  const [queuedTurnsTick, setQueuedTurnsTick] = useState(0);
  const [expandedTraceIds, setExpandedTraceIds] = useState<string[]>([]);
  const [collapsedTraceIds, setCollapsedTraceIds] = useState<string[]>([]);
  const [scheduledDrafts, setScheduledDrafts] = useState<Record<string, ScheduledTaskDraftRead>>({});
  const [createdScheduledTasks, setCreatedScheduledTasks] = useState<Record<string, ScheduledTaskRead>>({});
  const [dismissedDraftMessageIds, setDismissedDraftMessageIds] = useState<string[]>([]);
  const [activeCitation, setActiveCitation] = useState<KnowledgeCitation | null>(null);
  const [handoffs, setHandoffs] = useState<HumanHandoffRead[]>([]);
  const [handoffsLoading, setHandoffsLoading] = useState(false);
  const [showHandoffInbox, setShowHandoffInbox] = useState(false);
  const [handoffReplies, setHandoffReplies] = useState<Record<string, string>>({});
  const [isComposing, setIsComposing] = useState(false);
  const [runningTurn, setRunningTurn] = useState<{ sessionId: string; turnId: string } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    window.localStorage.getItem(ENTERPRISE_SIDEBAR_STORAGE_KEY) === '0'
  ));
  const [uiConfig, setUiConfig] = useState<UIConfigRead>({
    tenant_id: tenantId,
    show_thinking_trace: true,
    show_skill_trace: true,
    show_tool_trace: true,
    reflection_max_rounds: 1,
    agent_loop_max_actions: 6,
    updated_at: '',
  });

  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isChatProgrammaticScrollRef = useRef(false);
  const isChatStickyToBottomRef = useRef(true);
  const lastActiveConversationIdRef = useRef<string | null>(null);
  const lastDisplayedMessageCountRef = useRef(0);
  const storeRef = useRef(new Map<string, SessionSlot>());
  const streamRef = useRef(new Map<string, StreamSlot>());
  const turnTraceRef = useRef(new Map<string, TurnTrace>());
  const queuedTurnsRef = useRef<PreparedChatTurn[]>(restoredQueuedTurns);

  const notifyStore = useCallback(() => setStoreTick((value) => value + 1), []);
  const notifyStream = useCallback(() => setStreamTick((value) => value + 1), []);
  const notifyTrace = useCallback(() => setTraceTick((value) => value + 1), []);
  const notifyFeedback = useCallback(() => setFeedbackTick((value) => value + 1), []);
  const _notifyQueue = useCallback(() => setQueuedTurnsTick((value) => value + 1), []);

  const redirectToLogin = useCallback(() => {
    if (anonymous) return;
    clearEnterpriseAuthSession();
    window.location.href = '/';
  }, [anonymous]);

  const persistChatSessionAgentFilter = useCallback((value: string) => {
    const next = value || 'all';
    setSessionAgentFilter(next);
    window.localStorage.setItem(sessionFilterStorageKey(userId), next);
  }, [userId]);

  // --- Session loading -----------------------------------------------------
  const loadSessions = useCallback(async () => {
    if (!auth) return;
    setSessionsLoading(true);
    try {
      const result = await api.get<ChatSession[]>(`/chat/sessions?tenant_id=${tenantId}`);
      setSessions(result);
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
    } finally {
      setSessionsLoading(false);
    }
  }, [auth, redirectToLogin, tenantId]);

  const loadAgents = useCallback(async () => {
    if (!auth) return;
    try {
      const result = await api.get<AgentProfileRead[]>(`/agents?tenant_id=${tenantId}`);
      setAgents(result);
      setAgentsLoaded(true);
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
    }
  }, [auth, redirectToLogin, tenantId]);

  const loadMessages = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const result = await api.get<{ messages: ChatMessage[] }>(`/chat/sessions/${id}/messages?tenant_id=${tenantId}`);
      const slot = storeRef.current.get(id) || createEmptySlot();
      slot.serverMessages = result.messages || [];
      storeRef.current.set(id, slot);
      notifyStore();
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
      else notify.error(error instanceof Error ? error.message : '加载会话失败');
    }
  }, [notifyStore, redirectToLogin, tenantId]);

  const loadHandoffs = useCallback(async () => {
    if (!auth) return;
    setHandoffsLoading(true);
    try {
      const result = await api.get<HumanHandoffRead[]>(`/chat/handoffs?tenant_id=${tenantId}`);
      setHandoffs(result);
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
    } finally {
      setHandoffsLoading(false);
    }
  }, [auth, redirectToLogin, tenantId]);

  // --- Model configs -------------------------------------------------------
  const loadModelConfigs = useCallback(async () => {
    if (!auth) return;
    setModelConfigsLoading(true);
    setModelConfigsLoadError('');
    try {
      const result = await api.get<ModelConfigRead[]>(`/model-configs?tenant_id=${tenantId}`);
      setModelConfigs(result);
    } catch (error) {
      if (isAuthError(error)) {
        redirectToLogin();
        return;
      }
      setModelConfigsLoadError(error instanceof Error ? error.message : '加载模型配置失败');
    } finally {
      setModelConfigsLoading(false);
    }
  }, [auth, redirectToLogin, tenantId]);

  const changeModelConfig = useCallback((value: string) => {
    setSelectedModelConfigId(value);
    window.localStorage.setItem(`${'skill_agent_selected_model_config'}:${tenantId}`, value);
    window.dispatchEvent(new CustomEvent('ultrarag-enterprise-model-configs-updated'));
  }, [tenantId]);

  // --- Derived state -------------------------------------------------------
  const activeConversationId = sessionId || '';
  const currentSession = useMemo(
    () => sessions.find((session) => session.id === activeConversationId) || null,
    [sessions, activeConversationId],
  );
  const displayedAgent = useMemo(() => {
    if (draftAgentId) return agents.find((agent) => agent.id === draftAgentId) || null;
    const agentId = currentSession?.agent_id || selectedAgentId;
    return agents.find((agent) => agent.id === agentId) || null;
  }, [agents, currentSession, draftAgentId, selectedAgentId]);

  const displayedProfile = useMemo(
    () => (displayedAgent ? employeeProfile(displayedAgent) : null),
    [displayedAgent],
  );

  const sessionFilterOptions = useMemo(() => {
    const options = [{ label: '全部员工', value: 'all' }];
    agents.forEach((agent) => options.push({ label: employeeDisplayName(agent), value: agent.id }));
    return options;
  }, [agents]);

  const visibleSidebarSessions = useMemo(() => {
    if (sessionAgentFilter === 'all') return sessions;
    return sessions.filter((session) => session.agent_id === sessionAgentFilter);
  }, [sessionAgentFilter, sessions]);

  const enabledModelConfigs = useMemo(
    () => modelConfigs.filter((config) => config.enabled),
    [modelConfigs],
  );
  const selectedModelConfig = useMemo(
    () => enabledModelConfigs.find((config) => config.id === selectedModelConfigId)
      || enabledModelConfigs.find((config) => config.is_default)
      || enabledModelConfigs[0]
      || null,
    [enabledModelConfigs, selectedModelConfigId],
  );

  const canConfigureModels = Boolean(auth?.user);

  const emptyRoleSummary = useMemo(() => {
    if (!displayedAgent) return '准备好开始对话了吗？';
    return displayedAgent.description || `${employeeDisplayName(displayedAgent)} 在这里等你`;
  }, [displayedAgent]);

  const emptyProfileTags = useMemo(() => {
    return displayedProfile?.workStyles.length
      ? displayedProfile.workStyles.slice(0, 3)
      : ['结构化整理', '可追溯', '可追溯'];
  }, [displayedProfile]);

  const emptyStats = useMemo(() => {
    return displayedAgent
      ? [
        { label: '资料', value: agentResourceCount(displayedAgent, 'knowledge_base') },
        { label: '技能', value: agentResourceCount(displayedAgent, 'general_skill') },
        { label: 'SOP', value: agentResourceCount(displayedAgent, 'skill') },
      ]
      : [
        { label: '资料', value: 0 },
        { label: '技能', value: 0 },
        { label: 'SOP', value: 0 },
      ];
  }, [displayedAgent]);

  // --- Messages merge ------------------------------------------------------
  const displayedMessages = useMemo(() => {
    void storeTick;
    void feedbackTick;
    void streamTick;
    void traceTick;
    void queuedTurnsTick;
    const slot = storeRef.current.get(activeConversationId) || createEmptySlot();
    void streamRef;
    void runningTurn;
    return computeMergedMessages(slot, runningTurn?.turnId);
  }, [activeConversationId, feedbackTick, queuedTurnsTick, runningTurn, storeTick, streamTick, traceTick]);

  const currentStream = useMemo(() => {
    void streamTick;
    return streamRef.current.get(activeConversationId) || createStreamSlot();
  }, [activeConversationId, streamTick]);

  const currentSessionRunning = Boolean(runningTurn && runningTurn.sessionId === activeConversationId);

  const toggleTrace = useCallback((turnId: string, isExpanded: boolean) => {
    if (isExpanded) {
      setExpandedTraceIds((prev) => prev.filter((id) => id !== turnId));
      setCollapsedTraceIds((prev) => prev.includes(turnId) ? prev : [...prev, turnId]);
    } else {
      setCollapsedTraceIds((prev) => prev.filter((id) => id !== turnId));
      setExpandedTraceIds((prev) => prev.includes(turnId) ? prev : [...prev, turnId]);
    }
    notifyTrace();
  }, [notifyTrace]);

  const isCurrentStreamingTrace = useCallback((_turnId: string, _item: ChatMessage) => false, []);

  // --- Scheduled drafts ----------------------------------------------------
  const currentScheduledDraft = useMemo(() => {
    void traceTick;
    return Object.values(scheduledDrafts)[0] || null;
  }, [scheduledDrafts, traceTick]);

  const hasVisibleMessageScheduledDraft = useMemo(() => {
    return displayedMessages.some((message) => Boolean(message.metadata?.scheduled_task_draft));
  }, [displayedMessages]);

  const confirmScheduledTask = useCallback(async (draft: ScheduledTaskDraftRead, _messageId?: string) => {
    try {
      const payload = {
        tenant_id: tenantId,
        agent_id: draft.agent_id,
        title: draft.title,
        prompt: draft.prompt,
        description: draft.description || undefined,
        schedule_type: draft.schedule_type,
        schedule: draft.schedule,
        timezone: getClientTimeZone(),
        status: 'active',
        concurrency_policy: 'forbid',
        misfire_policy: 'coalesce',
      };
      const created = await api.post<ScheduledTaskRead>('/scheduled-tasks', payload);
      notify.success('定时任务已创建');
      if (_messageId) {
        setCreatedScheduledTasks((prev) => ({ ...prev, [_messageId]: created }));
      }
      setScheduledDrafts({});
    } catch (error) {
      notify.error(error instanceof Error ? error.message : '创建定时任务失败');
    }
  }, [tenantId]);

  const dismissScheduledTaskDraft = useCallback((_messageId?: string) => {
    if (_messageId) {
      setDismissedDraftMessageIds((prev) => prev.includes(_messageId) ? prev : [...prev, _messageId]);
    }
    setScheduledDrafts({});
  }, []);

  // --- Send ----------------------------------------------------------------
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !auth) return;
    const targetSessionId = activeConversationId;
    const agentId = displayedAgent?.id || selectedAgentId;
    if (!agentId) {
      notify.error('请先选择员工');
      return;
    }
    const turnId = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const userMessage: ChatMessage = {
      id: turnId,
      turnId,
      role: 'user',
      content: text,
      metadata: composerIntent === 'scheduled_task' ? { interaction_mode: 'scheduled_task' } : {},
      created_at: new Date().toISOString(),
    };
    const slot = storeRef.current.get(targetSessionId) || createEmptySlot();
    slot.realtimeMessages = [...slot.realtimeMessages, userMessage];
    storeRef.current.set(targetSessionId, slot);
    notifyStore();
    setInput('');
    setComposerIntent(null);

    setRunningTurn({ sessionId: targetSessionId, turnId });
    const streamSlot = createStreamSlot();
    streamSlot.loading = true;
    streamSlot.turnId = turnId;
    streamSlot.abortController = new AbortController();
    streamRef.current.set(targetSessionId, streamSlot);
    notifyStream();

    const attachments = composerAttachments
      .filter((attachment) => attachment.uploadStatus === 'ready')
      .map((attachment) => {
        const { uploadStatus: _uploadStatus, uploadKey: _uploadKey, ...rest } = attachment;
        void _uploadStatus;
        void _uploadKey;
        return rest;
      });
    setComposerAttachments([]);

    const body = {
      tenant_id: tenantId,
      session_id: targetSessionId || undefined,
      agent_id: agentId,
      message: text,
      turn_id: turnId,
      model_config_id: selectedModelConfig?.id,
      attachments,
      interaction_mode: composerIntent === 'scheduled_task' ? 'scheduled_task' : 'normal',
      timezone: getClientTimeZone(),
    };

    let replyText = '';
    let replySessionId = targetSessionId;
    const trace = turnTraceRef.current.get(turnId) || createTurnTrace();
    turnTraceRef.current.set(turnId, trace);
    const thinkingLineId = 'thinking';
    try {
      await streamChatTurn(
        body,
        (event) => {
          switch (event.event) {
            // 后端实际事件：text.delta 携带回复增量（兼兼容旧 token/stream_delta）
            case 'text.delta':
            case 'token':
            case 'stream_delta': {
              const delta = typeof event.data.text === 'string' ? event.data.text : '';
              replyText += delta;
              const currentSlot = streamRef.current.get(replySessionId);
              if (currentSlot) {
                currentSlot.accumulated = replyText;
                notifyStream();
              }
              break;
            }
            case 'thinking.delta': {
              const delta = typeof event.data.text === 'string' ? event.data.text : '';
              const existing = trace.lines.find((l) => l.id === thinkingLineId);
              if (existing) {
                existing.text += delta;
              } else {
                trace.lines.push({ id: thinkingLineId, kind: 'thinking', text: delta, state: 'running', icon: 'judge' });
              }
              notifyStream();
              break;
            }
            case 'thinking.end': {
              const existing = trace.lines.find((l) => l.id === thinkingLineId);
              if (existing) existing.state = 'completed';
              notifyStream();
              break;
            }
            case 'tool.call': {
              const toolName = String(event.data.toolName ?? '工具调用');
              const args = (() => {
                try { return event.data.args != null ? JSON.stringify(event.data.args, null, 2) : ''; }
                catch { return String(event.data.args); }
              })();
              const result = (() => {
                try { return event.data.result != null ? JSON.stringify(event.data.result, null, 2) : ''; }
                catch { return String(event.data.result); }
              })();
              trace.lines.push({
                id: `tool_${trace.lines.length}_${Date.now()}`,
                kind: 'tool',
                text: toolName,
                detail: args || undefined,
                output: result || undefined,
                state: 'completed',
                icon: 'tool',
                collapsible: true,
              });
              notifyStream();
              break;
            }
            case 'session.created': {
              const sid = typeof event.data.session_id === 'string' ? event.data.session_id : '';
              if (sid && !targetSessionId) replySessionId = sid;
              break;
            }
            case 'error': {
              const msg = typeof event.data.message === 'string' ? event.data.message : '对话执行失败';
              trace.lines.push({ id: `error_${Date.now()}`, kind: 'decision', text: msg, state: 'failed', icon: 'judge' });
              trace.completedAt = Date.now();
              notifyStream();
              break;
            }
            case 'done': {
              trace.completedAt = Date.now();
              notifyStream();
              break;
            }
            default:
              break;
          }
        },
        streamSlot.abortController?.signal,
      );

      const assistantMessage: ChatMessage = {
        id: `assistant_${turnId}`,
        turnId,
        role: 'assistant',
        content: replyText,
        created_at: new Date().toISOString(),
        isStreaming: false,
      };
      const finalSlot = storeRef.current.get(replySessionId) || createEmptySlot();
      finalSlot.realtimeMessages = [...finalSlot.realtimeMessages, assistantMessage];
      storeRef.current.set(replySessionId, finalSlot);
      notifyStore();
    } catch (error) {
      if (isAuthError(error)) {
        redirectToLogin();
        return;
      }
      const errorMessage: ChatMessage = {
        id: `error_${turnId}`,
        turnId,
        role: 'assistant',
        content: error instanceof Error ? error.message : '请求失败',
        created_at: new Date().toISOString(),
        isError: true,
        isStreaming: false,
      };
      const errorSlot = storeRef.current.get(replySessionId) || createEmptySlot();
      errorSlot.realtimeMessages = [...errorSlot.realtimeMessages, errorMessage];
      storeRef.current.set(replySessionId, errorSlot);
      notifyStore();
    } finally {
      const cleanupSlot = streamRef.current.get(replySessionId);
      if (cleanupSlot) {
        cleanupSlot.loading = false;
        cleanupSlot.abortController = null;
      }
      setRunningTurn(null);
      notifyStream();
      void loadSessions();
    }
  }, [activeConversationId, auth, composerAttachments, composerIntent, displayedAgent, input, loadSessions, notifyStore, notifyStream, redirectToLogin, selectedAgentId, selectedModelConfig, tenantId]);

  const abortStream = useCallback(() => {
    const streamSlot = streamRef.current.get(activeConversationId);
    if (streamSlot?.abortController) {
      streamSlot.abortController.abort();
      streamSlot.abortController = null;
      streamSlot.loading = false;
      setRunningTurn(null);
      notifyStream();
    }
  }, [activeConversationId, notifyStream]);

  // --- Feedback ------------------------------------------------------------
  const rateMessage = useCallback(async (message: ChatMessage, rating: 'up' | 'down') => {
    if (!auth || !activeConversationId) return;
    const next = message.feedback_rating === rating ? null : rating;
    try {
      await api.post(`/chat/sessions/${activeConversationId}/messages/${message.id}/feedback`, {
        tenant_id: tenantId,
        rating: next,
      });
      const slot = storeRef.current.get(activeConversationId);
      if (slot) {
        const update = (list: ChatMessage[]) => list.map((item) => (
          item.id === message.id ? { ...item, feedback_rating: next } : item
        ));
        slot.serverMessages = update(slot.serverMessages);
        slot.realtimeMessages = update(slot.realtimeMessages);
        storeRef.current.set(activeConversationId, slot);
      }
      notifyFeedback();
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
      else notify.error(error instanceof Error ? error.message : '反馈失败');
    }
  }, [activeConversationId, auth, notifyFeedback, redirectToLogin, tenantId]);

  // --- Sidebar / navigation ------------------------------------------------
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(ENTERPRISE_SIDEBAR_STORAGE_KEY, next ? '0' : '1');
      return next;
    });
  }, []);

  const openSession = useCallback((id: string) => {
    navigate(`${CHAT_BASE_PATH}/${id}`);
  }, [navigate]);

  const openDraftForAgent = useCallback((agentId: string) => {
    if (!agentId) return;
    setSelectedAgentId(agentId);
    persistChatSessionAgentFilter(agentId);
    persistSharedAgentScope(agentId, userId);
    emitAgentScopeChange(agentId);
    navigate(`${CHAT_BASE_PATH}/draft/${encodeURIComponent(agentId)}`);
  }, [navigate, persistChatSessionAgentFilter, userId]);

  const openGallery = useCallback(() => {
    navigate('/staff/gallery');
  }, [navigate]);

  const changeSessionAgentFilter = useCallback((value: string) => {
    const next = value || 'all';
    persistChatSessionAgentFilter(next);
    if (next !== 'all') {
      setSelectedAgentId(next);
      persistSharedAgentScope(next, userId);
      emitAgentScopeChange(next);
    }
  }, [persistChatSessionAgentFilter, userId]);

  const openRename = useCallback((session: ChatSession) => {
    setRenameSession(session);
    setRenameTitle(session.title || '');
  }, []);

  const saveRename = useCallback(async () => {
    if (!renameSession) return;
    try {
      const updated = await api.put<ChatSession>(`/chat/sessions/${renameSession.id}`, {
        tenant_id: tenantId,
        title: renameTitle.trim(),
      });
      setSessions((prev) => prev.map((session) => (session.id === updated.id ? { ...session, ...updated } : session)));
      setRenameSession(null);
      setRenameTitle('');
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
      else notify.error(error instanceof Error ? error.message : '重命名失败');
    }
  }, [redirectToLogin, renameSession, renameTitle, tenantId]);

  const requestDelete = useCallback((session: ChatSession) => {
    setPendingDelete(session);
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!pendingDelete) return;
    try {
      await api.delete(`/chat/sessions/${pendingDelete.id}?tenant_id=${tenantId}`);
      setSessions((prev) => prev.filter((session) => session.id !== pendingDelete.id));
      if (activeConversationId === pendingDelete.id) {
        navigate(CHAT_BASE_PATH);
      }
      setPendingDelete(null);
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
      else notify.error(error instanceof Error ? error.message : '删除失败');
    }
  }, [activeConversationId, navigate, pendingDelete, redirectToLogin, tenantId]);

  // --- Handoffs ------------------------------------------------------------
  const openHandoffInbox = useCallback(() => {
    setShowHandoffInbox(true);
    void loadHandoffs();
  }, [loadHandoffs]);

  const submitHandoffReply = useCallback(async (handoff: HumanHandoffRead) => {
    const reply = handoffReplies[handoff.id]?.trim();
    if (!reply) return;
    try {
      await api.post(`/chat/handoffs/${handoff.id}/reply`, {
        tenant_id: tenantId,
        reply,
      });
      setHandoffReplies((prev) => {
        const next = { ...prev };
        delete next[handoff.id];
        return next;
      });
      notify.success('已回复');
      void loadHandoffs();
    } catch (error) {
      if (isAuthError(error)) redirectToLogin();
      else notify.error(error instanceof Error ? error.message : '回复失败');
    }
  }, [handoffReplies, loadHandoffs, redirectToLogin, tenantId]);

  // --- Composer helpers ----------------------------------------------------
  const uploadComposerFiles = useCallback(async (files: File[]) => {
    if (!files.length || !auth) return;
    for (const file of files) {
      const uploadKey = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const attachment: ComposerAttachment = {
        id: uploadKey,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        kind: file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : file.type.startsWith('text/') ? 'text' : 'binary',
        uploadStatus: 'uploading',
        uploadKey,
      };
      setComposerAttachments((prev) => [...prev, attachment]);
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('tenant_id', tenantId);
        const result = await api.post<ChatAttachmentRead>('/chat/attachments', formData);
        setComposerAttachments((prev) => prev.map((item) => (
          item.uploadKey === uploadKey ? { ...item, ...result, uploadStatus: 'ready' } : item
        )));
      } catch (error) {
        setComposerAttachments((prev) => prev.map((item) => (
          item.uploadKey === uploadKey ? { ...item, uploadStatus: 'error', error: error instanceof Error ? error.message : '上传失败' } : item
        )));
      }
    }
  }, [auth, tenantId]);

  const removeComposerAttachment = useCallback((uploadKey: string) => {
    setComposerAttachments((prev) => prev.filter((item) => item.uploadKey !== uploadKey));
  }, []);

  const handleComposerFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length) void uploadComposerFiles(files);
    event.target.value = '';
  }, [uploadComposerFiles]);

  const handleComposerDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setComposerDragActive(true);
  }, []);

  const handleComposerDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  const handleComposerDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setComposerDragActive(false);
  }, []);

  const handleComposerDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setComposerDragActive(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length) void uploadComposerFiles(files);
  }, [uploadComposerFiles]);

  const handleComposerPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData || !clipboardContainsComposerImage(clipboardData)) return;
    event.preventDefault();
    void extractPastedComposerFiles(clipboardData).then((files) => {
      if (files.length) uploadComposerFiles(files);
    });
  }, [uploadComposerFiles]);

  const handleComposerPlusAction = useCallback((action: 'upload' | 'scheduled_task') => {
    setComposerPlusOpen(false);
    if (action === 'upload') {
      fileInputRef.current?.click();
      return;
    }
    setComposerIntent('scheduled_task');
  }, []);

  const updateChatStickiness = useCallback(() => {
    const element = chatMessagesRef.current;
    if (!element) return;
    const remainingScroll = element.scrollHeight - element.clientHeight - element.scrollTop;
    isChatStickyToBottomRef.current = remainingScroll <= 96;
  }, []);

  const finishProgrammaticChatScroll = useCallback(() => {
    window.requestAnimationFrame(() => {
      updateChatStickiness();
      isChatProgrammaticScrollRef.current = false;
    });
  }, [updateChatStickiness]);

  const scrollChatToBottom = useCallback((options?: { preserveShortContentTop?: boolean; force?: boolean }) => {
    const element = chatMessagesRef.current;
    if (!element) return;
    if (!options?.force && !isChatStickyToBottomRef.current) return;
    const targetScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    const shortContentGuard = Math.min(520, element.clientHeight * 0.72);
    isChatProgrammaticScrollRef.current = true;
    if (options?.preserveShortContentTop && targetScrollTop <= shortContentGuard) {
      element.scrollTop = 0;
      finishProgrammaticChatScroll();
      return;
    }
    window.requestAnimationFrame(() => {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      window.requestAnimationFrame(() => {
        element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
        finishProgrammaticChatScroll();
      });
    });
  }, [finishProgrammaticChatScroll]);

  const handleChatMessagesScroll = useCallback(() => {
    if (isChatProgrammaticScrollRef.current) return;
    updateChatStickiness();
  }, [updateChatStickiness]);

  // --- Effects -------------------------------------------------------------
  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadModelConfigs();
  }, [loadModelConfigs]);

  useEffect(() => {
    if (sessionId) {
      void loadMessages(sessionId);
    }
  }, [sessionId, loadMessages]);

  useEffect(() => {
    if (auth && draftAgentId && agentsLoaded) {
      const exists = agents.some((agent) => agent.id === draftAgentId);
      if (exists) {
        setSelectedAgentId(draftAgentId);
        persistSharedAgentScope(draftAgentId, userId);
        emitAgentScopeChange(draftAgentId);
      }
    }
  }, [agents, agentsLoaded, auth, draftAgentId, userId]);

  useEffect(() => {
    if (!activeConversationId || !auth) return;
    const readTimes = { ...sessionReadTimes };
    readTimes[activeConversationId] = new Date().toISOString();
    setSessionReadTimes(readTimes);
    persistSessionReadTimes(userId, readTimes);
  }, [activeConversationId, auth, sessionReadTimes, userId]);

  useLayoutEffect(() => {
    const conversationChanged = activeConversationId !== lastActiveConversationIdRef.current;
    lastActiveConversationIdRef.current = activeConversationId;
    const messageCountChanged = displayedMessages.length !== lastDisplayedMessageCountRef.current;
    lastDisplayedMessageCountRef.current = displayedMessages.length;
    if (conversationChanged) {
      isChatStickyToBottomRef.current = true;
      scrollChatToBottom({ preserveShortContentTop: !currentSessionRunning, force: true });
      return;
    }
    if (messageCountChanged && isChatStickyToBottomRef.current) {
      scrollChatToBottom();
    }
  }, [activeConversationId, currentSessionRunning, displayedMessages.length, scrollChatToBottom]);

  useEffect(() => {
    if (!currentSessionRunning) return;
    if (!isChatStickyToBottomRef.current) return;
    scrollChatToBottom();
  }, [currentSessionRunning, scrollChatToBottom, streamTick, traceTick]);

  const readyComposerAttachments = useMemo(
    () => composerAttachments.filter((attachment) => attachment.uploadStatus === 'ready'),
    [composerAttachments],
  );
  const uploadingComposerAttachment = useMemo(
    () => composerAttachments.some((attachment) => attachment.uploadStatus === 'uploading'),
    [composerAttachments],
  );
  const composerActive = Boolean(input.trim() || readyComposerAttachments.length);
  const showComposerAvatar = Boolean(displayedAgent);

  const showModelSetupNotice = Boolean(modelConfigsLoadError);
  const modelSetupNoticeText = modelConfigsLoadError;

  const completeModelSetup = useCallback(() => {
    setModelSetupOpen(false);
    void loadModelConfigs();
  }, [loadModelConfigs]);

  void setUiConfig;
  void setHandoffsLoading;
  void setHandoffs;
  void setScheduledDrafts;
  void setLastTurn;
  void ApiError;
  void createTurnTrace;
  void effectiveMessageTurnId;
  void queuedTurnsRef;
  void writeQueuedChatTurns;
  void restoredQueuedTurns;
  void sessionReadStorageKey;
  void setShowHandoffInbox;
  void SHOW_DEBUG;

  return {
    auth,
    SHOW_DEBUG,
    lastTurn,
    // sessions + agents
    sessions,
    sessionsLoading,
    visibleSidebarSessions,
    agents,
    sessionId: activeConversationId,
    sessionReadTimes,
    sessionAgentFilter,
    setSessionAgentFilter: changeSessionAgentFilter,
    sessionFilterOptions,
    // active state
    activeConversationId,
    displayedAgent,
    displayedProfile,
    currentSession,
    emptyProfileTags,
    emptyRoleSummary,
    emptyStats,
    // messages / trace
    displayedMessages,
    turnTraceRef,
    uiConfig,
    expandedTraceIds,
    collapsedTraceIds,
    toggleTrace,
    currentStream,
    runningTurn,
    currentSessionRunning,
    isCurrentStreamingTrace,
    // scheduled
    scheduledDrafts,
    createdScheduledTasks,
    dismissedDraftMessageIds,
    currentScheduledDraft,
    hasVisibleMessageScheduledDraft,
    confirmScheduledTask,
    dismissScheduledTaskDraft,
    // composer
    input,
    setInput,
    composerAttachments,
    composerDragActive,
    composerPlusOpen,
    setComposerPlusOpen,
    composerIntent,
    setComposerIntent,
    readyComposerAttachments,
    uploadingComposerAttachment,
    composerActive,
    showComposerAvatar,
    isComposing,
    setIsComposing,
    enabledModelConfigs,
    selectedModelConfig,
    changeModelConfig,
    showModelSetupNotice,
    modelSetupNoticeText,
    tenantId,
    canConfigureModels,
    modelConfigsLoading,
    modelSetupOpen,
    setModelSetupOpen,
    completeModelSetup,
    // refs
    chatMessagesRef,
    fileInputRef,
    // handlers
    handleChatMessagesScroll,
    send,
    abortStream,
    rateMessage,
    setActiveCitation,
    activeCitation,
    // sidebar
    sidebarCollapsed,
    toggleSidebar,
    openSession,
    refreshAgents: loadAgents,
    openDraftForAgent,
    openGallery,
    openRename,
    requestDelete,
    logout: redirectToLogin,
    openAdmin: () => navigate('/staff/dashboard'),
    // rename dialog
    renameSession,
    setRenameSession,
    renameTitle,
    setRenameTitle,
    saveRename,
    // delete dialog
    pendingDelete,
    setPendingDelete,
    confirmDeleteSession,
    // handoff
    handoffs,
    handoffsLoading,
    showHandoffInbox,
    setShowHandoffInbox,
    openHandoffInbox,
    handoffReplies,
    setHandoffReplies,
    submitHandoffReply,
    // composer actions
    handleComposerFileChange,
    handleComposerDragEnter,
    handleComposerDragOver,
    handleComposerDragLeave,
    handleComposerDrop,
    handleComposerPaste,
    removeComposerAttachment,
    handleComposerPlusAction,
    uploadComposerFiles,
    navigate,
  };
}

export type UseChatSession = ReturnType<typeof useChatSession>;
