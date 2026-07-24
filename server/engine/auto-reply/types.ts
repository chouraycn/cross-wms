export type ThinkLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type VerboseLevel = 'off' | 'on';
export type TraceLevel = 'off' | 'on' | 'detailed';
export type ElevatedLevel = 'off' | 'on';
export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'max';
export type FastMode = 'off' | 'fast' | 'faster';

export type GetReplyOptions = {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
  workspaceDir?: string;
  modelOverride?: string;
  timeoutMs?: number;
  verbose?: boolean;
  thinkLevel?: ThinkLevel;
  traceLevel?: TraceLevel;
  reasoningLevel?: ReasoningLevel;
};

export type ReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  trustedLocalMedia?: boolean;
  sensitiveMedia?: boolean;
  presentation?: unknown;
  delivery?: unknown;
  interactive?: unknown;
  channelData?: Record<string, unknown>;
  sessionId?: string;
  modelUsed?: string;
  usage?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: {
      input: number;
      output: number;
      total: number;
    };
  };
  error?: string;
  aborted?: boolean;
};
