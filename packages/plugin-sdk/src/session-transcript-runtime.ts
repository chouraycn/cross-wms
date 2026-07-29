// 会话 transcript 运行时：按身份追加消息、读取事件、发布更新。
// openclaw 原始实现从 ../config/sessions/session-accessor.js、
// transcript-append.js、transcript-stream.js、transcript.js、../config/types.openclaw.js、
// ../routing/session-key.js、./session-transcript-memory-hit.js 导入。
// 此处提供最小可用类型与桩函数，待依赖子系统移植后接入。

/** 会话 transcript 身份。 */
export type SessionTranscriptIdentity = {
  agentId: string;
  memoryKey: string;
  sessionId: string;
  sessionKey: string;
};

/** 会话 transcript 记忆命中身份。 */
export type SessionTranscriptMemoryHitIdentity = SessionTranscriptIdentity;

/** 会话 transcript 记忆命中键。 */
export type SessionTranscriptMemoryHitKey = string;

/** 会话 transcript 记忆命中键参数。 */
export type SessionTranscriptMemoryHitKeyParams = {
  agentId: string;
  sessionId: string;
};

/** 解析会话 transcript 记忆命中键参数。 */
export type ResolveSessionTranscriptMemoryHitKeyParams = SessionTranscriptMemoryHitKeyParams;

/** 会话 transcript 读取参数。 */
export type SessionTranscriptReadParams = {
  agentId?: string;
  sessionKey: string;
  sessionId?: string;
  storePath?: string;
};

/** 会话 transcript 目标参数。 */
export type SessionTranscriptTargetParams = SessionTranscriptReadParams & {
  /**
   * @deprecated 优先使用 `{ agentId, sessionKey, sessionId }`。仅在适配已
   * 接收活动 transcript 工件并需在同一工件上操作的代码时传入。
   */
  sessionFile?: string;
};

/** 会话 transcript 目标。 */
export type SessionTranscriptTarget = SessionTranscriptIdentity & {
  targetKind: "active-session-file" | "runtime-session";
};

/** 遗留文件目标。 */
export type SessionTranscriptLegacyFileTarget = SessionTranscriptTarget & {
  sessionFile: string;
};

/** 会话 transcript 事件。 */
export type SessionTranscriptEvent = unknown;

/** transcript 消息追加选项。 */
export type TranscriptMessageAppendOptions<TMessage> = {
  message: TMessage;
  config?: unknown;
  sessionId?: string;
};

/** transcript 消息追加结果。 */
export type TranscriptMessageAppendResult<TMessage> = {
  appended: boolean;
  message?: TMessage;
};

/** transcript 更新负载。 */
export type TranscriptUpdatePayload = {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  text?: string;
  mediaUrls?: string[];
};

/** 最近助手 transcript 文本。 */
export type LatestAssistantTranscriptText = {
  text: string;
  messageId?: string;
};

/** 会话 transcript 追加结果。 */
export type SessionTranscriptAppendResult = {
  appended: boolean;
};

/** 会话 transcript 投递镜像。 */
export type SessionTranscriptDeliveryMirror = {
  idempotencyKey?: string;
  text?: string;
};

/** 会话 transcript 更新模式。 */
export type SessionTranscriptUpdateMode = "append" | "replace";

/** 助手镜像追加参数。 */
export type SessionTranscriptAssistantMirrorAppendParams = SessionTranscriptReadParams & {
  config?: unknown;
  deliveryMirror?: SessionTranscriptDeliveryMirror;
  idempotencyKey?: string;
  mediaUrls?: string[];
  text?: string;
  updateMode?: SessionTranscriptUpdateMode;
};

/** 追加消息参数。 */
export type SessionTranscriptAppendMessageParams<TMessage> = SessionTranscriptTargetParams &
  TranscriptMessageAppendOptions<TMessage>;

/** 写锁参数。 */
export type SessionTranscriptWriteLockParams = SessionTranscriptTargetParams & {
  config?: unknown;
};

/** 写锁上下文。 */
export type SessionTranscriptWriteLockContext = {
  appendMessage: <TMessage>(
    options: Omit<TranscriptMessageAppendOptions<TMessage>, "config">,
  ) => Promise<TranscriptMessageAppendResult<TMessage> | undefined>;
  publishUpdate: (update?: TranscriptUpdatePayload) => Promise<void>;
  readEvents: () => Promise<SessionTranscriptEvent[]>;
  target: SessionTranscriptTarget;
};

/** 格式化会话 transcript 记忆命中键。 */
// TODO: 依赖模块未移植，暂用本地桩
export function formatSessionTranscriptMemoryHitKey(
  params: SessionTranscriptMemoryHitKeyParams,
): SessionTranscriptMemoryHitKey {
  return `${params.agentId}:${params.sessionId}`;
}

/** 解析会话 transcript 记忆命中键。 */
// TODO: 依赖模块未移植，暂用本地桩
export function parseSessionTranscriptMemoryHitKey(
  key: SessionTranscriptMemoryHitKey,
): SessionTranscriptMemoryHitKeyParams | undefined {
  const parts = key.split(":");
  if (parts.length < 2) return undefined;
  return { agentId: parts[0], sessionId: parts[1] };
}

/** 将会话 transcript 记忆命中键解析为会话键列表。 */
// TODO: 依赖模块未移植，暂用本地桩
export function resolveSessionTranscriptMemoryHitKeyToSessionKeys(
  _params: ResolveSessionTranscriptMemoryHitKeyParams,
): string[] {
  return [];
}

/** 解析 transcript 公共身份（不返回文件路径）。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function resolveSessionTranscriptIdentity(
  params: SessionTranscriptReadParams,
): Promise<SessionTranscriptIdentity> {
  const agentId = params.agentId ?? "default";
  return {
    agentId,
    memoryKey: formatSessionTranscriptMemoryHitKey({
      agentId,
      sessionId: params.sessionId ?? params.sessionKey,
    }),
    sessionId: params.sessionId ?? params.sessionKey,
    sessionKey: params.sessionKey,
  };
}

/** 解析 transcript 操作的公共目标（不暴露存储路径作为身份）。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function resolveSessionTranscriptTarget(
  params: SessionTranscriptTargetParams,
): Promise<SessionTranscriptTarget> {
  const identity = await resolveSessionTranscriptIdentity(params);
  return {
    ...identity,
    targetKind: params.sessionFile?.trim() ? "active-session-file" : "runtime-session",
  };
}

/** 解析并持久化遗留文件目标（仍需 sessionFile 的插件命令调用）。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function resolveSessionTranscriptLegacyFileTarget(
  params: SessionTranscriptTargetParams,
): Promise<SessionTranscriptLegacyFileTarget> {
  const target = await resolveSessionTranscriptTarget(params);
  return {
    ...target,
    sessionFile: params.sessionFile ?? "state/transcript.jsonl",
  };
}

/** 按公共会话身份读取 transcript 事件。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function readSessionTranscriptEvents(
  _params: SessionTranscriptTargetParams,
): Promise<SessionTranscriptEvent[]> {
  return [];
}

/** 按作用域身份读取最近可见助手文本。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function readLatestAssistantTextByIdentity(
  _params: SessionTranscriptTargetParams,
): Promise<LatestAssistantTranscriptText | undefined> {
  return undefined;
}

/** 通过守护会话追加门面追加投递镜像助手消息。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function appendAssistantMirrorMessageByIdentity(
  _params: SessionTranscriptAssistantMirrorAppendParams,
): Promise<SessionTranscriptAppendResult> {
  return { appended: false };
}

/** 按作用域 transcript 目标追加 transcript 消息。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function appendSessionTranscriptMessageByIdentity<TMessage>(
  _params: SessionTranscriptAppendMessageParams<TMessage>,
): Promise<TranscriptMessageAppendResult<TMessage> | undefined> {
  return undefined;
}

/** 按作用域 transcript 目标发布 transcript 更新。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function publishSessionTranscriptUpdateByIdentity(
  _params: SessionTranscriptTargetParams & { update?: TranscriptUpdatePayload },
): Promise<void> {
  // 待 config/sessions/transcript.js 移植后接入
}

/** 在写锁下运行 transcript 工作。 */
// TODO: 依赖模块未移植，暂用本地桩
export async function withSessionTranscriptWriteLock<T>(
  _params: SessionTranscriptWriteLockParams,
  run: (context: SessionTranscriptWriteLockContext) => Promise<T> | T,
): Promise<T> {
  const target: SessionTranscriptTarget = {
    agentId: _params.agentId ?? "default",
    memoryKey: formatSessionTranscriptMemoryHitKey({
      agentId: _params.agentId ?? "default",
      sessionId: _params.sessionId ?? _params.sessionKey,
    }),
    sessionId: _params.sessionId ?? _params.sessionKey,
    sessionKey: _params.sessionKey,
    targetKind: _params.sessionFile?.trim() ? "active-session-file" : "runtime-session",
  };
  return await run({
    target,
    readEvents: () => Promise.resolve([]),
    appendMessage: async () => undefined,
    publishUpdate: async () => {
      // 待依赖模块移植后接入
    },
  });
}
