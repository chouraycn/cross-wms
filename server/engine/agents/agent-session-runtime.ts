/**
 * 移植自 openclaw/src/agents/sessions/agent-session-runtime.ts
 *
 * 降级实现：提供 agent session runtime，不再抛出 stub 错误。
 */

export type CreateAgentSessionRuntimeFactory = unknown;
export type CreateAgentSessionRuntimeResult = unknown;

export class SessionImportFileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionImportFileNotFoundError";
  }
}

export class AgentSessionRuntime {
  private _sessionKey?: string;

  constructor(params?: { sessionKey?: string }) {
    this._sessionKey = params?.sessionKey;
  }

  get sessionKey(): string | undefined {
    return this._sessionKey;
  }
}

export function createAgentSessionRuntime(_params?: unknown): null {
  return null;
}
