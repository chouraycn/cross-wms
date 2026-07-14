import { getWebSocketHub, type TaskMonitorEvent, type TaskMonitorEventType } from '../gateway/webSocketHub.js';

export function publishTaskMonitorEvent(sessionId: string, type: TaskMonitorEventType, payload: unknown): void {
  const hub = getWebSocketHub();
  if (!hub) return;

  const event: TaskMonitorEvent = {
    type,
    sessionId,
    payload,
    timestamp: Date.now(),
  };

  hub.publishTaskMonitorEvent(event);
}

export function publishTodoCreated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'todo_created', payload);
}

export function publishTodoUpdated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'todo_updated', payload);
}

export function publishTodoDeleted(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'todo_deleted', payload);
}

export function publishArtifactCreated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'artifact_created', payload);
}

export function publishArtifactDeleted(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'artifact_deleted', payload);
}

export function publishToolCallCreated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'tool_call_created', payload);
}

export function publishToolCallUpdated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'tool_call_updated', payload);
}

export function publishTrajectoryEventCreated(sessionId: string, payload: unknown): void {
  publishTaskMonitorEvent(sessionId, 'trajectory_event_created', payload);
}