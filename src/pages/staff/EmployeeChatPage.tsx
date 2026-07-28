/**
 * EmployeeChatPage — 数字员工真实对话页（消费入口）
 *
 * 替代原先「点对话却跳到员工管理页」的断裂路由。
 * 直接对接已接通真实引擎的后端 /api/staffdeck/chat/stream：
 *   - 后端把 agent 的 persona + 绑定 SOP + 检索到的知识库上下文 注入 system prompt
 *   - 无 API Key 时后端走 mock 兜底（离线可验证）
 * SSE 采用规范格式 event:<type>\ndata:<json>，本页自行解析。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import AppHeader from '../../components/staff/AppHeader.js';
import { Button as UIButton } from '../../components/staff/ui/button.js';
import { notify } from '../../components/staff/ui/app-toast.js';
import { api, TENANT_ID } from '../../components/staff/api/client.js';
import type { AgentProfileRead } from '../../components/staff/types/index.js';
import CodeBlock from '../../components/staff/CodeBlock.js';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
  tools?: Array<{ name: string; args: string; result: string }>;
  mock?: boolean;
  streaming?: boolean;
}

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

/** 解析后端 SSE 流（规范 event:/data: 双行格式） */
async function readStaffStream(
  body: Record<string, unknown>,
  signal: AbortSignal,
  onEvent: (ev: SseEvent) => void,
): Promise<void> {
  const response = await fetch('/api/staffdeck/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('当前浏览器不支持流式响应');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() || '';
    for (const block of blocks) {
      const ev = parseSseBlock(block);
      if (ev) onEvent(ev);
    }
  }
  const tail = parseSseBlock(buffer);
  if (tail) onEvent(tail);
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n').map((l) => l.trimEnd());
  const eventLine = lines.find((l) => l.startsWith('event:'));
  const dataLines = lines.filter((l) => l.startsWith('data:'));
  if (!eventLine || dataLines.length === 0) return null;
  const type = eventLine.replace(/^event:\s*/, '').trim();
  const raw = dataLines.map((l) => l.replace(/^data:\s*/, '')).join('\n');
  try {
    return { type, data: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { type, data: { raw } };
  }
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function EmployeeChatPage(): JSX.Element {
  const { agentId = '' } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<AgentProfileRead | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 执行痕迹（Trace）抽屉状态
  const [showTrace, setShowTrace] = useState(false);
  const [traceEvents, setTraceEvents] = useState<
    Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: number }>
  >([]);
  const [traceLoading, setTraceLoading] = useState(false);

  const openTrace = useCallback(async () => {
    if (!sessionId) return;
    setShowTrace(true);
    setTraceLoading(true);
    try {
      const events = await api.get<
        Array<{ id: string; event_type: string; payload: Record<string, unknown>; created_at: number }>
      >(`/chat/sessions/${sessionId}/events?tenant_id=${TENANT_ID}`);
      setTraceEvents(events);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : '加载执行痕迹失败');
    } finally {
      setTraceLoading(false);
    }
  }, [sessionId]);

  const fmtTraceTime = (ts: number): string => {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    return new Date(ts * 1000).toLocaleString();
  };
  const summarizePayload = (payload: Record<string, unknown>): string => {
    try {
      const s = JSON.stringify(payload, null, 2);
      return s.length > 400 ? `${s.slice(0, 400)}…` : s;
    } catch {
      return String(payload);
    }
  };

  // 加载员工资料 + 恢复最近会话
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await api.get<AgentProfileRead>(`/agents/${agentId}?tenant_id=${TENANT_ID}`);
        if (!cancelled) setAgent(a);
      } catch {
        /* 忽略 */
      }
      // 恢复最近会话
      try {
        const sessions = await api.get<Array<{ id: string; agent_id: string }>>(
          `/chat/sessions?tenant_id=${TENANT_ID}&agent_id=${agentId}`,
        );
        const latest = sessions.find((s) => s.agent_id === agentId);
        if (latest && !cancelled) {
          setSessionId(latest.id);
          const msgs = await api.get<{ messages: Array<{ role: string; content: string; metadata?: Record<string, unknown> }> }>(
            `/chat/sessions/${latest.id}/messages?tenant_id=${TENANT_ID}`,
          );
          const mapped: ChatMsg[] = msgs.messages.map((m) => ({
            id: uid(),
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
            thinking: (m.metadata?.thinking as string) || undefined,
            mock: Boolean(m.metadata?.mock),
          }));
          setMessages(mapped);
        }
      } catch {
        /* 忽略 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const userMsg: ChatMsg = { id: uid(), role: 'user', content: text };
    const assistantId = uid();
    const assistantMsg: ChatMsg = { id: assistantId, role: 'assistant', content: '', thinking: '', tools: [], streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // 确保会话
    let sid = sessionId;
    if (!sid) {
      try {
        const created = await api.post<{ id: string }>(`/chat/sessions?tenant_id=${TENANT_ID}`, {
          agent_id: agentId,
          title: text.slice(0, 50),
        });
        sid = created.id;
        setSessionId(sid);
      } catch (err) {
        notify.error(err instanceof Error ? err.message : '创建会话失败');
        setBusy(false);
        return;
      }
    }

    let accText = '';
    let accThink = '';
    const accTools: Array<{ name: string; args: string; result: string }> = [];

    try {
      await readStaffStream(
        { tenant_id: TENANT_ID, agent_id: agentId, session_id: sid, message: text },
        controller.signal,
        (ev) => {
          const d = ev.data;
          if (ev.type === 'text.delta') {
            accText += (d.text as string) || '';
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: accText } : m)),
            );
          } else if (ev.type === 'thinking.delta') {
            accThink += (d.text as string) || '';
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, thinking: accThink } : m)),
            );
          } else if (ev.type === 'tool.call') {
            accTools.push({
              name: (d.toolName as string) || 'tool',
              args: (d.args as string) || '',
              result: (d.result as string) || '',
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, tools: [...accTools] } : m)),
            );
          } else if (ev.type === 'error') {
            notify.error((d.message as string) || '对话出错');
          }
        },
      );
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        notify.error(err instanceof Error ? err.message : '对话失败');
      }
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, content: accText } : m)),
      );
      setBusy(false);
      abortRef.current = null;
    }
  }, [input, busy, sessionId, agentId]);

  const stop = useCallback(() => {
    if (sessionId && abortRef.current) {
      api.post(`/chat/sessions/${sessionId}/cancel`, {}).catch(() => {});
      abortRef.current.abort();
    }
  }, [sessionId]);

  return (
    <Box sx={{ display: 'flex', height: '100%', flexDirection: 'column', bgcolor: '#f7f8fa' }}>
      <AppHeader
        title={agent ? `与「${agent.name}」对话` : '数字员工对话'}
        showBack
        onBack={() => navigate('/enterprise/agents')}
      />
      {sessionId ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', bgcolor: '#f7f8fa', px: '16px', pt: '8px' }}>
          <Box
            component="button"
            type="button"
            onClick={() => void openTrace()}
            sx={{
              borderRadius: '9999px',
              border: '1px solid #e0e3e8',
              bgcolor: 'background.paper',
              px: '12px',
              py: '4px',
              fontSize: '12px',
              color: '#4b5563',
              '&:hover': { borderColor: '#2f6bff', color: '#2f6bff' },
            }}
          >
            执行痕迹
          </Box>
        </Box>
      ) : null}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: '16px', py: '20px' }}>
        <Box sx={{ mx: 'auto', display: 'flex', maxWidth: '760px', flexDirection: 'column', gap: '16px' }}>
          {messages.length === 0 && (
            <Box sx={{ mt: '40px', textAlign: 'center', fontSize: '13px', color: '#9aa0aa' }}>
              向「{agent?.name ?? '数字员工'}」提问，它将基于自身角色设定、绑定 SOP 与知识库作答。
            </Box>
          )}
          {messages.map((m) => (
            <Box
              key={m.id}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                ...(m.role === 'user' ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }),
              }}
            >
              {m.thinking ? (
                <Box
                  component="details"
                  open
                  sx={{
                    maxWidth: '90%',
                    borderRadius: '10px',
                    bgcolor: '#eef0f4',
                    px: '12px',
                    py: '8px',
                    fontSize: '12px',
                    lineHeight: '1.625',
                    color: '#6b7280',
                  }}
                >
                  <Box component="summary" sx={{ mb: '4px', cursor: 'pointer', userSelect: 'none', fontWeight: 500, color: '#9aa0aa' }}>
                    思考{m.streaming ? '中…' : '过程'}
                  </Box>
                  <Box component="div" sx={{ whiteSpace: 'pre-wrap' }}>{m.thinking}</Box>
                </Box>
              ) : null}
              <Box
                sx={{
                  maxWidth: '90%',
                  whiteSpace: 'pre-wrap',
                  borderRadius: '12px',
                  px: '14px',
                  py: '10px',
                  fontSize: '13.5px',
                  lineHeight: '1.625',
                  ...(m.role === 'user'
                    ? { bgcolor: '#2f6bff', color: '#fff' }
                    : { border: '1px solid #eaecef', bgcolor: 'background.paper', color: '#1f2329' }),
                }}
              >
                {m.content || (m.streaming ? '思考中…' : '')}
                {m.mock ? <Box component="span" sx={{ ml: '8px', fontSize: '11px', color: '#b0b6bf' }}>（演示模式）</Box> : null}
              </Box>
              {m.tools && m.tools.length > 0 ? (
                <Box sx={{ display: 'flex', maxWidth: '92%', flexDirection: 'column', gap: '6px' }}>
                  {m.tools.map((t, i) => (
                    <Box
                      component="details"
                      key={i}
                      sx={{ overflow: 'hidden', borderRadius: '10px', border: '1px solid #e6e8ec', bgcolor: 'background.paper', fontSize: '12px' }}
                    >
                      <Box component="summary" sx={{ display: 'flex', cursor: 'pointer', alignItems: 'center', gap: '8px', px: '12px', py: '8px', color: '#4b5563' }}>
                        <span>🛠</span>
                        <Box component="span" sx={{ fontWeight: 500, color: '#1f2329' }}>{t.name}</Box>
                        <Box component="span" sx={{ ml: 'auto', borderRadius: '9999px', bgcolor: '#eef2ff', px: '8px', py: '2px', fontSize: '10px', color: '#2f6bff' }}>
                          已调用
                        </Box>
                      </Box>
                      <Box sx={{ borderTop: '1px solid #f0f1f4', px: '12px', py: '8px' }}>
                        {t.args ? (
                          <Box sx={{ mb: '8px' }}>
                            <Box sx={{ mb: '4px', fontSize: '11px', fontWeight: 500, color: '#9aa0aa' }}>参数</Box>
                            <CodeBlock code={t.args} language="json" />
                          </Box>
                        ) : null}
                        {t.result ? (
                          <Box>
                            <Box sx={{ mb: '4px', fontSize: '11px', fontWeight: 500, color: '#9aa0aa' }}>返回</Box>
                            <CodeBlock code={t.result} language="json" />
                          </Box>
                        ) : null}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : null}
            </Box>
          ))}
        </Box>
      </Box>
      <Box sx={{ borderTop: '1px solid #eaecef', bgcolor: 'background.paper', px: '16px', py: '12px' }}>
        <Box sx={{ mx: 'auto', display: 'flex', maxWidth: '760px', alignItems: 'flex-end', gap: '8px' }}>
          <Box
            component="textarea"
            placeholder="输入消息，Enter 发送，Shift+Enter 换行"
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            sx={{
              maxHeight: '140px',
              minHeight: '42px',
              flex: 1,
              resize: 'none',
              borderRadius: '10px',
              border: '1px solid #e0e3e8',
              px: '12px',
              py: '8px',
              fontSize: '13.5px',
              outline: 'none',
              '&:focus': { borderColor: '#2f6bff' },
            }}
          />
          {busy ? (
            <UIButton onClick={stop} sx={{ flexShrink: 0 }}>停止</UIButton>
          ) : (
            <UIButton onClick={() => void send()} sx={{ flexShrink: 0 }}>发送</UIButton>
          )}
        </Box>
      </Box>
      {showTrace ? (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(0,0,0,0.3)' }} onClick={() => setShowTrace(false)} />
          <Box sx={{ position: 'relative', height: '100%', width: '380px', overflowY: 'auto', bgcolor: 'background.paper', boxShadow: '0 20px 25px rgba(0,0,0,0.1)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eaecef', px: '16px', py: '12px' }}>
              <Box component="span" sx={{ fontWeight: 500, color: '#1f2329' }}>执行痕迹</Box>
              <Box
                component="button"
                type="button"
                onClick={() => setShowTrace(false)}
                sx={{ fontSize: '13px', color: '#9aa0aa', '&:hover': { color: '#1f2329' } }}
              >
                关闭
              </Box>
            </Box>
            <Box sx={{ p: '12px' }}>
              {traceLoading ? (
                <Box sx={{ py: '40px', textAlign: 'center', fontSize: '12px', color: '#9aa0aa' }}>加载中…</Box>
              ) : traceEvents.length === 0 ? (
                <Box sx={{ py: '40px', textAlign: 'center', fontSize: '12px', color: '#9aa0aa' }}>暂无执行记录</Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {traceEvents.map((e) => (
                    <Box key={e.id} sx={{ borderRadius: '10px', border: '1px solid #eaecef', p: '10px' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Box component="span" sx={{ borderRadius: '4px', bgcolor: '#eef2ff', px: '6px', py: '2px', fontSize: '10px', color: '#2f6bff' }}>
                          {e.event_type}
                        </Box>
                        <Box component="span" sx={{ fontSize: '11px', color: '#9aa0aa' }}>{fmtTraceTime(e.created_at)}</Box>
                      </Box>
                      <Box
                        component="pre"
                        sx={{ mt: '6px', maxHeight: '180px', overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '11px', lineHeight: '1.625', color: '#4b5563' }}
                      >
                        {summarizePayload(e.payload)}
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
