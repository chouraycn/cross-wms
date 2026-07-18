// 移植自 openclaw/src/gateway/server-methods/talk-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function canUseTalkDirectTools(...args: unknown[]): unknown {
  throw new Error("not implemented: canUseTalkDirectTools");
}

export function broadcastTalkRoomEvents(...args: unknown[]): unknown {
  throw new Error("not implemented: broadcastTalkRoomEvents");
}

export function talkHandoffErrorCode(...args: unknown[]): unknown {
  throw new Error("not implemented: talkHandoffErrorCode");
}

export function getVoiceCallStreamingConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: getVoiceCallStreamingConfig");
}

export function buildTalkRealtimeConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTalkRealtimeConfig");
}

export function buildTalkTranscriptionConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTalkTranscriptionConfig");
}

export function configuredOrFalse(...args: unknown[]): unknown {
  throw new Error("not implemented: configuredOrFalse");
}

export function resolveConfiguredRealtimeTranscriptionProvider(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredRealtimeTranscriptionProvider");
}

export function buildRealtimeInstructions(...args: unknown[]): unknown {
  throw new Error("not implemented: buildRealtimeInstructions");
}

export function buildRealtimeVoiceLaunchOptions(...args: unknown[]): unknown {
  throw new Error("not implemented: buildRealtimeVoiceLaunchOptions");
}

export function withRealtimeBrowserOverrides(...args: unknown[]): unknown {
  throw new Error("not implemented: withRealtimeBrowserOverrides");
}

export function isUnsupportedBrowserWebRtcSession(...args: unknown[]): unknown {
  throw new Error("not implemented: isUnsupportedBrowserWebRtcSession");
}
