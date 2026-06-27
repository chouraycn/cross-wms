/**
 * Gateway Server Types
 * Gateway 服务器类型定义
 */

export interface GatewayServerOptions {
  port?: number;
  host?: string;
  apiKey?: string;
  corsOrigins?: string[];
  maxPayloadSize?: string;
}

export interface GatewayMethodContext {
  sessionKey?: string;
  userId?: string;
  apiKey?: string;
  requestId: string;
  ip?: string;
  timestamp: number;
}

export interface GatewayMethodParams<P = unknown> {
  method: string;
  params: P;
  context: GatewayMethodContext;
}

export interface GatewayMethodResult<R = unknown> {
  ok: boolean;
  result?: R;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
}

export type GatewayMethodHandler = (
  params: unknown,
  context: GatewayMethodContext,
) => Promise<unknown>;

export interface GatewayServerInfo {
  version: string;
  name: string;
  startedAt: number;
  uptimeMs: number;
}

// ========== Session Types ==========

export interface GatewaySession {
  id: string;
  key: string;
  label?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessageAt?: number;
  meta?: Record<string, unknown>;
}

// ========== Chat Types ==========

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  attachments?: Array<{ type: string; content: string; mimeType?: string }>;
  model?: string;
  agent?: string;
  thinking?: string;
  mode?: "standard" | "fast";
}

export interface ChatSendResult {
  ok: true;
  runId: string;
  sessionKey: string;
}

// ========== Agents Types ==========

export interface GatewayAgent {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string;
  tools: string[];
  capabilities: string[];
  createdAt: number;
  updatedAt: number;
}

// ========== Models Types ==========

export interface GatewayModel {
  id: string;
  name: string;
  provider: string;
  type: "chat" | "completion" | "embedding";
  maxTokens: number;
  costPer1kTokens?: {
    input?: number;
    output?: number;
  };
  capabilities: string[];
}

// ========== Tools Types ==========

export interface GatewayTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  tags: string[];
  category: string;
}

// ========== Health Types ==========

export interface GatewayHealth {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  version: string;
  services: {
    database: boolean;
    llm: boolean;
    mcp?: boolean;
  };
}

// ========== Stats Types ==========

export interface GatewayStats {
  totalSessions: number;
  totalMessages: number;
  activeSessions: number;
  uptimeMs: number;
  avgResponseTimeMs: number;
}
