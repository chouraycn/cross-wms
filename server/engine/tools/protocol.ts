import { logger } from '../../logger.js';

export const TOOL_PROTOCOL_VERSION = '1.0';

export type ToolProtocolMessageType =
  | 'tool_call'
  | 'tool_result'
  | 'tool_error'
  | 'tool_progress'
  | 'tool_cancel'
  | 'tool_approval_request'
  | 'tool_approval_response';

export interface ToolProtocolMessage {
  id: string;
  type: ToolProtocolMessageType;
  toolName: string;
  timestamp: number;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ToolProtocolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ToolProtocol {
  static serialize(message: ToolProtocolMessage): string {
    return JSON.stringify(message);
  }

  static deserialize(data: string): ToolProtocolMessage | null {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.id || !parsed.type || !parsed.toolName) {
        return null;
      }
      return parsed as ToolProtocolMessage;
    } catch {
      return null;
    }
  }

  static createToolCall(toolName: string, args: Record<string, unknown>): ToolProtocolMessage {
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'tool_call',
      toolName,
      timestamp: Date.now(),
      payload: args,
    };
  }

  static createToolResult(toolName: string, result: unknown, messageId: string): ToolProtocolMessage {
    return {
      id: messageId,
      type: 'tool_result',
      toolName,
      timestamp: Date.now(),
      payload: result,
    };
  }

  static createToolError(toolName: string, error: ToolProtocolError, messageId: string): ToolProtocolMessage {
    return {
      id: messageId,
      type: 'tool_error',
      toolName,
      timestamp: Date.now(),
      payload: error,
    };
  }

  static createProgress(toolName: string, progress: number, messageId: string): ToolProtocolMessage {
    return {
      id: messageId,
      type: 'tool_progress',
      toolName,
      timestamp: Date.now(),
      payload: { progress },
    };
  }

  static createCancel(toolName: string, messageId: string): ToolProtocolMessage {
    return {
      id: messageId,
      type: 'tool_cancel',
      toolName,
      timestamp: Date.now(),
    };
  }

  static validate(message: ToolProtocolMessage): boolean {
    if (!message.id) {
      logger.warn('[Tools:Protocol] Missing message id');
      return false;
    }
    if (!message.type) {
      logger.warn('[Tools:Protocol] Missing message type');
      return false;
    }
    if (!message.toolName) {
      logger.warn('[Tools:Protocol] Missing tool name');
      return false;
    }
    return true;
  }
}
