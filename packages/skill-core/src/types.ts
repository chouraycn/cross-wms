export type SkillType = 'declarative' | 'native' | 'hybrid';

export type SkillTriggerType =
  | 'keyword'
  | 'regex'
  | 'intent'
  | 'event'
  | 'command'
  | 'button'
  | 'manual'
  | 'schedule';

export type SkillStatus = 'registered' | 'enabled' | 'disabled' | 'error' | 'loading';

export type SkillScope = 'global' | 'workspace' | 'session' | 'user';

export interface SkillTrigger {
  type: SkillTriggerType;
  pattern?: string;
  keywords?: string[];
  intent?: string;
  event?: string;
  command?: string;
  schedule?: string;
}

/** 意图识别器输出的一条意图（由 server 端意图分类器提供） */
export interface DetectedIntent {
  intent: string;
  confidence?: number;
}

/** matchTriggers 的可选参数（用于注入意图识别结果等上下文） */
export interface MatchTriggersOptions {
  /** 意图识别结果，用于匹配 `intent` 类型触发器。可为字符串（意图名）或带置信度的对象 */
  intents?: Array<string | DetectedIntent>;
}

/** 定时触发器信息（供 server 端调度器消费） */
export interface ScheduleTriggerInfo {
  skillId: string;
  trigger: SkillTrigger;
  schedule: string;
}

export interface SkillPermission {
  name: string;
  description?: string;
  required?: boolean;
  scope?: SkillScope;
}

export interface SkillConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    default?: unknown;
    required?: boolean;
    enum?: unknown[];
  };
}

export interface SkillDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  type: SkillType;
  category?: string;
  tags?: string[];
  author?: string;
  homepage?: string;
  icon?: string;
  triggers: SkillTrigger[];
  permissions?: SkillPermission[];
  configSchema?: SkillConfigSchema;
  defaultConfig?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  dependencies?: string[];
  requires?: string[];
  maxConcurrency?: number;
  timeoutMs?: number;
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
  priority?: number;
  scopes?: SkillScope[];
  deprecated?: boolean;
  versionCompatibility?: string;
}

export interface SkillContext {
  skillId: string;
  sessionId: string;
  userId?: string;
  workspaceId?: string;
  agentId?: string;
  config: Record<string, unknown>;
  permissions: string[];
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  variables: Record<string, unknown>;
  invokeSkill: (skillId: string, params: Record<string, unknown>) => Promise<SkillResult>;
  getMemory: (key: string) => Promise<unknown>;
  setMemory: (key: string, value: unknown) => Promise<void>;
}

export interface SkillResult {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  nextSkills?: string[];
}

export type SkillHandler = (
  params: Record<string, unknown>,
  context: SkillContext,
) => Promise<SkillResult> | SkillResult;

export interface SkillLifecycle {
  onLoad?: (context: SkillContext) => Promise<void> | void;
  onUnload?: (context: SkillContext) => Promise<void> | void;
  onEnable?: (context: SkillContext) => Promise<void> | void;
  onDisable?: (context: SkillContext) => Promise<void> | void;
  onSchedule?: (context: SkillContext) => Promise<void> | void;
}

export interface RegisteredSkill {
  definition: SkillDefinition;
  handler: SkillHandler;
  lifecycle?: SkillLifecycle;
  status: SkillStatus;
  registeredAt: number;
  enabledAt?: number;
  source?: string;
  sourceId?: string;
  version: string;
  usageCount?: number;
  lastUsedAt?: number;
  errorMessage?: string;
}

export interface SkillExecutionRecord {
  id: string;
  skillId: string;
  sessionId: string;
  userId?: string;
  params: Record<string, unknown>;
  result?: SkillResult;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'success' | 'error' | 'cancelled';
  error?: string;
}

export interface SkillTriggerMatch {
  skillId: string;
  trigger: SkillTrigger;
  confidence: number;
  matchedText?: string;
  extractedParams?: Record<string, unknown>;
}
