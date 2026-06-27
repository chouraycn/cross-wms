/**
 * EventTimeline — 事件时间线查看器
 *
 * 用于查看会话的事件历史，支持：
 * - 按事件类型筛选
 * - 按时间倒序/顺序显示
 * - 事件详情展开
 * - 工具调用审计
 */

import React, { useState, useEffect, useCallback } from 'react';
import { eventLedgerApi } from '../../services/eventLedgerApi';

// ==================== 类型定义 ====================

interface LedgerEvent {
  id: string;
  seq: number;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  runId?: string;
  actor?: string;
  version: number;
}

interface SessionMeta {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  lastEventSeq: number;
  eventCount: number;
  status: 'active' | 'archived' | 'incomplete' | 'deleted';
  lastEventType?: string;
  metadata: Record<string, unknown>;
}

interface EventTimelineProps {
  sessionId: string;
  onClose?: () => void;
}

// ==================== 事件类型配置 ====================

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  'session.created': { label: '会话创建', color: '#4CAF50', icon: '📝' },
  'session.updated': { label: '会话更新', color: '#8BC34A', icon: '✏️' },
  'session.archived': { label: '会话归档', color: '#9E9E9E', icon: '📦' },
  'session.deleted': { label: '会话删除', color: '#F44336', icon: '🗑️' },
  'message.created': { label: '消息创建', color: '#2196F3', icon: '💬' },
  'message.updated': { label: '消息更新', color: '#03A9F4', icon: '📝' },
  'message.deleted': { label: '消息删除', color: '#FF9800', icon: '❌' },
  'turn.started': { label: '回合开始', color: '#9C27B0', icon: '▶️' },
  'turn.completed': { label: '回合完成', color: '#4CAF50', icon: '✅' },
  'turn.failed': { label: '回合失败', color: '#F44336', icon: '❌' },
  'tool.call.started': { label: '工具调用开始', color: '#FF5722', icon: '🔧' },
  'tool.call.completed': { label: '工具调用完成', color: '#8BC34A', icon: '⚙️' },
  'tool.call.failed': { label: '工具调用失败', color: '#F44336', icon: '⚠️' },
  'model.stream.start': { label: '流式开始', color: '#00BCD4', icon: '🌊' },
  'model.stream.end': { label: '流式结束', color: '#009688', icon: '🏁' },
  'memory.added': { label: '记忆添加', color: '#E91E63', icon: '🧠' },
  'memory.deleted': { label: '记忆删除', color: '#795548', icon: '🗑️' },
  'system.error': { label: '系统错误', color: '#F44336', icon: '🚨' },
  'custom': { label: '自定义', color: '#607D8B', icon: '📌' },
};

function getEventConfig(type: string) {
  return EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG['custom'];
}

// ==================== 时间格式化 ====================

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  if (isToday) {
    return timeStr;
  }

  const dateStr = date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
  });

  return `${dateStr} ${timeStr}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ==================== 组件 ====================

export const EventTimeline: React.FC<EventTimelineProps> = ({ sessionId, onClose }) => {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [reverseOrder, setReverseOrder] = useState(true);
  const [meta, setMeta] = useState<SessionMeta | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await eventLedgerApi.getEvents(sessionId);
      if (res.ok) {
        setEvents(res.data || []);
      } else {
        setError(res.error || '获取事件失败');
      }

      const metaRes = await eventLedgerApi.getSessionMeta(sessionId);
      if (metaRes.ok && metaRes.data) {
        setMeta(metaRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const filteredEvents = events.filter((e) => {
    if (filterType === 'all') return true;
    if (filterType === 'messages') return e.type.startsWith('message.');
    if (filterType === 'turns') return e.type.startsWith('turn.');
    if (filterType === 'tools') return e.type.startsWith('tool.');
    if (filterType === 'errors') return e.type === 'system.error' || e.type === 'turn.failed';
    return e.type === filterType;
  });

  const displayEvents = reverseOrder ? [...filteredEvents].reverse() : filteredEvents;

  const eventTypes = [...new Set(events.map((e) => e.type))].sort();

  return (
    <div style={styles.container}>
      {/* 头部 */}
      <div style={styles.header}>
        <div style={styles.title}>
          <span style={styles.icon}>📊</span>
          事件时间线
        </div>
        {meta && (
          <div style={styles.meta}>
            <span>共 {meta.eventCount} 个事件</span>
            {meta.status === 'incomplete' && (
              <span style={styles.badgeError}>不完整</span>
            )}
          </div>
        )}
        <button style={styles.closeBtn} onClick={onClose}>
          ✕
        </button>
      </div>

      {/* 工具栏 */}
      <div style={styles.toolbar}>
        <select
          style={styles.select}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">全部事件</option>
          <option value="messages">消息</option>
          <option value="turns">回合</option>
          <option value="tools">工具调用</option>
          <option value="errors">错误</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {getEventConfig(t).label}
            </option>
          ))}
        </select>
        <label style={styles.checkbox}>
          <input
            type="checkbox"
            checked={reverseOrder}
            onChange={(e) => setReverseOrder(e.target.checked)}
          />
          倒序
        </label>
        <button style={styles.refreshBtn} onClick={fetchEvents} disabled={loading}>
          {loading ? '加载中...' : '🔄'}
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* 事件列表 */}
      <div style={styles.eventList}>
        {displayEvents.length === 0 && !loading && (
          <div style={styles.empty}>暂无事件</div>
        )}
        {displayEvents.map((event) => {
          const config = getEventConfig(event.type);
          const isExpanded = expandedEvent === event.id;

          return (
            <div key={event.id} style={styles.eventItem}>
              {/* 时间线 */}
              <div style={styles.timeline}>
                <div
                  style={{
                    ...styles.timelineDot,
                    backgroundColor: config.color,
                  }}
                />
                <div style={styles.timelineLine} />
              </div>

              {/* 内容 */}
              <div style={styles.eventContent}>
                <div style={styles.eventHeader}>
                  <span style={{ ...styles.eventType, color: config.color }}>
                    {config.icon} {config.label}
                  </span>
                  <span style={styles.eventSeq}>#{event.seq}</span>
                  <span style={styles.eventTime}>{formatTimestamp(event.timestamp)}</span>
                  <button
                    style={styles.expandBtn}
                    onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                </div>

                {/* 详情 */}
                {isExpanded && (
                  <div style={styles.eventDetails}>
                    <div style={styles.detailRow}>
                      <span style={styles.detailLabel}>Event ID:</span>
                      <span style={styles.detailValue}>{event.id}</span>
                    </div>
                    {event.runId && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Run ID:</span>
                        <span style={styles.detailValue}>{event.runId}</span>
                      </div>
                    )}
                    {event.actor && (
                      <div style={styles.detailRow}>
                        <span style={styles.detailLabel}>Actor:</span>
                        <span style={styles.detailValue}>{event.actor}</span>
                      </div>
                    )}
                    {event.payload && Object.keys(event.payload).length > 0 && (
                      <div style={styles.payloadSection}>
                        <div style={styles.payloadTitle}>Payload:</div>
                        <pre style={styles.payload}>
                          {JSON.stringify(event.payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* 快捷预览 */}
                {!isExpanded && (
                  <div style={styles.eventPreview}>
                    {renderPreview(event)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==================== 预览渲染 ====================

function renderPreview(event: LedgerEvent): React.ReactNode {
  const { type, payload } = event;

  switch (type) {
    case 'turn.started':
      return (
        <span style={styles.preview}>
          模型: {payload.model as string}
          {!!payload.executionMode && `, 模式: ${payload.executionMode as string}`}
        </span>
      );

    case 'turn.completed':
      return (
        <span style={styles.preview}>
          模型: {payload.model as string}
          {payload.toolCallsCount !== undefined && `, 工具调用: ${payload.toolCallsCount} 次`}
          {!!payload.thinkingDuration && `, 思考时间: ${formatDuration(payload.thinkingDuration as number)}`}
        </span>
      );

    case 'turn.failed':
      return (
        <span style={{ ...styles.preview, color: '#F44336' }}>
          错误: {(payload.error as string)?.slice(0, 50)}
        </span>
      );

    case 'message.created':
      return (
        <span style={styles.preview}>
          {payload.role as string}: {String(payload.content || '').slice(0, 30)}...
        </span>
      );

    case 'tool.call.started':
      return (
        <span style={styles.preview}>
          工具: {payload.toolName as string}
        </span>
      );

    case 'tool.call.completed':
      return (
        <span style={styles.preview}>
          工具: {payload.toolName as string}
          {!!payload.duration && `, 耗时: ${formatDuration(payload.duration as number)}`}
        </span>
      );

    case 'tool.call.failed':
      return (
        <span style={{ ...styles.preview, color: '#F44336' }}>
          工具: {payload.toolName as string}, 错误: {(payload.error as string)?.slice(0, 30)}
        </span>
      );

    case 'memory.added':
      return (
        <span style={styles.preview}>
          {String(payload.content || '').slice(0, 40)}...
        </span>
      );

    case 'system.error':
      return (
        <span style={{ ...styles.preview, color: '#F44336' }}>
          {(payload.error as string)?.slice(0, 50)}
        </span>
      );

    default:
      return <span style={styles.preview}>{Object.keys(payload).join(', ') || '无数据'}</span>;
  }
}

// ==================== 样式 ====================

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: '480px',
    height: '100vh',
    backgroundColor: '#fff',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  icon: {
    fontSize: '18px',
  },
  meta: {
    fontSize: '13px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  badgeError: {
    backgroundColor: '#F44336',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    color: '#666',
    padding: '4px 8px',
  },
  toolbar: {
    padding: '12px 20px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#fafafa',
  },
  select: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '13px',
    flex: 1,
  },
  checkbox: {
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  error: {
    padding: '12px 20px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    fontSize: '13px',
  },
  eventList: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 20px',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    padding: '40px 0',
  },
  eventItem: {
    display: 'flex',
    marginBottom: '8px',
  },
  timeline: {
    width: '24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    marginTop: '4px',
  },
  timelineLine: {
    width: '2px',
    flex: 1,
    backgroundColor: '#e0e0e0',
    marginTop: '4px',
  },
  eventContent: {
    flex: 1,
    marginLeft: '12px',
    paddingBottom: '8px',
  },
  eventHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
  },
  eventType: {
    fontWeight: 500,
  },
  eventSeq: {
    color: '#999',
    fontSize: '12px',
  },
  eventTime: {
    color: '#999',
    fontSize: '12px',
    marginLeft: 'auto',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '10px',
    color: '#999',
    padding: '2px 4px',
  },
  eventPreview: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  preview: {
    fontSize: '12px',
    color: '#666',
  },
  eventDetails: {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    fontSize: '12px',
  },
  detailRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '4px',
  },
  detailLabel: {
    color: '#666',
    minWidth: '60px',
  },
  detailValue: {
    color: '#333',
    wordBreak: 'break-all',
  },
  payloadSection: {
    marginTop: '8px',
  },
  payloadTitle: {
    color: '#666',
    marginBottom: '4px',
  },
  payload: {
    backgroundColor: '#fff',
    padding: '8px',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '200px',
    fontSize: '11px',
    margin: 0,
  },
};
