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
    <div className="flex h-full flex-col bg-[#f7f8fa]">
      <AppHeader
        title={agent ? `与「${agent.name}」对话` : '数字员工对话'}
        showBack
        onBack={() => navigate('/enterprise/agents')}
      />
      {sessionId ? (
        <div className="flex items-center justify-end bg-[#f7f8fa] px-4 pt-2">
          <button
            type="button"
            onClick={() => void openTrace()}
            className="rounded-full border border-[#e0e3e8] bg-white px-3 py-1 text-[12px] text-[#4b5563] hover:border-[#2f6bff] hover:text-[#2f6bff]"
          >
            执行痕迹
          </button>
        </div>
      ) : null}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          {messages.length === 0 && (
            <div className="mt-10 text-center text-[13px] text-[#9aa0aa]">
              向「{agent?.name ?? '数字员工'}」提问，它将基于自身角色设定、绑定 SOP 与知识库作答。
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {m.thinking ? (
                <details open className="max-w-[90%] rounded-[10px] bg-[#eef0f4] px-3 py-2 text-[12px] leading-relaxed text-[#6b7280]">
                  <summary className="mb-1 cursor-pointer select-none font-medium text-[#9aa0aa]">
                    思考{m.streaming ? '中…' : '过程'}
                  </summary>
                  <div className="whitespace-pre-wrap">{m.thinking}</div>
                </details>
              ) : null}
              <div
                className={`max-w-[90%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[#2f6bff] text-white'
                    : 'border border-[#eaecef] bg-white text-[#1f2329]'
                }`}
              >
                {m.content || (m.streaming ? '思考中…' : '')}
                {m.mock ? <span className="ml-2 text-[11px] text-[#b0b6bf]">（演示模式）</span> : null}
              </div>
              {m.tools && m.tools.length > 0 ? (
                <div className="flex max-w-[92%] flex-col gap-1.5">
                  {m.tools.map((t, i) => (
                    <details
                      key={i}
                      className="overflow-hidden rounded-[10px] border border-[#e6e8ec] bg-white text-[12px]"
                    >
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[#4b5563]">
                        <span>🛠</span>
                        <span className="font-medium text-[#1f2329]">{t.name}</span>
                        <span className="ml-auto rounded-full bg-[#eef2ff] px-2 py-0.5 text-[10px] text-[#2f6bff]">
                          已调用
                        </span>
                      </summary>
                      <div className="border-t border-[#f0f1f4] px-3 py-2">
                        {t.args ? (
                          <div className="mb-2">
                            <div className="mb-1 text-[11px] font-medium text-[#9aa0aa]">参数</div>
                            <CodeBlock code={t.args} language="json" />
                          </div>
                        ) : null}
                        {t.result ? (
                          <div>
                            <div className="mb-1 text-[11px] font-medium text-[#9aa0aa]">返回</div>
                            <CodeBlock code={t.result} language="json" />
                          </div>
                        ) : null}
                      </div>
                    </details>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-[#eaecef] bg-white px-4 py-3">
        <div className="mx-auto flex max-w-[760px] items-end gap-2">
          <textarea
            className="max-h-[140px] min-h-[42px] flex-1 resize-none rounded-[10px] border border-[#e0e3e8] px-3 py-2 text-[13.5px] outline-none focus:border-[#2f6bff]"
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
          />
          {busy ? (
            <UIButton onClick={stop} className="shrink-0">停止</UIButton>
          ) : (
            <UIButton onClick={() => void send()} className="shrink-0">发送</UIButton>
          )}
        </div>
      </div>
      {showTrace ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowTrace(false)} />
          <div className="relative h-full w-[380px] overflow-y-auto bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#eaecef] px-4 py-3">
              <span className="font-medium text-[#1f2329]">执行痕迹</span>
              <button
                type="button"
                onClick={() => setShowTrace(false)}
                className="text-[13px] text-[#9aa0aa] hover:text-[#1f2329]"
              >
                关闭
              </button>
            </div>
            <div className="p-3">
              {traceLoading ? (
                <div className="py-10 text-center text-[12px] text-[#9aa0aa]">加载中…</div>
              ) : traceEvents.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[#9aa0aa]">暂无执行记录</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {traceEvents.map((e) => (
                    <div key={e.id} className="rounded-[10px] border border-[#eaecef] p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-[#eef2ff] px-1.5 py-0.5 text-[10px] text-[#2f6bff]">
                          {e.event_type}
                        </span>
                        <span className="text-[11px] text-[#9aa0aa]">{fmtTraceTime(e.created_at)}</span>
                      </div>
                      <pre className="mt-1.5 max-h-[180px] overflow-auto whitespace-pre-wrap break-all text-[11px] leading-relaxed text-[#4b5563]">
                        {summarizePayload(e.payload)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
