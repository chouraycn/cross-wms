export {
  extractThinkDirective,
  extractVerboseDirective,
  extractTraceDirective,
  extractElevatedDirective,
  extractReasoningDirective,
  extractStatusDirective,
  extractFastDirective,
} from './directives.js';
export { extractModelDirective } from './model.js';
export { getReplyFromConfig } from './get-reply.js';
export { extractExecDirective } from './exec.js';
export { extractQueueDirective, resolveQueueSettings } from './queue.js';
export { extractReplyToTag } from './reply-tags.js';
export { chunkText, chunkMarkdownText, chunkTextWithMode } from './chunk.js';
export type { ChunkMode, TextChunkProvider } from './chunk.js';
export type {
  GetReplyOptions,
  ReplyPayload,
  ThinkLevel,
  VerboseLevel,
  TraceLevel,
  ElevatedLevel,
  ReasoningLevel,
  FastMode,
} from './types.js';
export type { QueueMode, QueueDropPolicy, QueueDedupeMode, QueueSettings } from './queue.js';

export {
  registerCommand,
  unregisterCommand,
  getCommand,
  getCommandByName,
  listCommands,
  clearCommands,
  isCommandMessage,
  detectCommand,
  parseCommandArgs,
  serializeCommandArgs,
  buildCommandText,
  buildCommandTextFromArgs,
} from './commands-registry.js';
export type {
  ChatCommandDefinition,
  CommandArgDefinition,
  CommandArgValues,
  CommandArgs,
  CommandDetection,
} from './commands-registry.js';

export { COMMAND_ARG_FORMATTERS, formatCommandArgs } from './commands-args.js';

export {
  dispatchCommand,
  isSlashCommand,
  extractCommandName,
} from './commands.js';
export type { CommandDispatchContext, CommandDispatchResult } from './commands.js';

export {
  createReplyDispatcher,
  getActiveDispatchCount,
  incrementActiveDispatch,
  decrementActiveDispatch,
  dispatchReply,
  combineBeforeDeliverHooks,
} from './dispatch.js';
export type { ReplyDispatcher, BeforeDeliverHook, DispatchOptions } from './dispatch.js';

export {
  parseDirectives,
  hasDirective,
  extractAllDirectiveNames,
  normalizeThinkLevel,
  normalizeVerboseLevel,
  normalizeTraceLevel,
  normalizeFastMode,
} from './directive-handling.js';
export type {
  DirectiveLevels,
  DirectiveModel,
  DirectiveExec,
  ParsedDirectives,
  DirectiveParseOptions,
} from './directive-handling.js';

export {
  stripHeartbeatToken,
  isHeartbeatContentEffectivelyEmpty,
  parseHeartbeatTasks,
  resolveHeartbeatPrompt,
  resolveHeartbeatPromptForResponseTool,
  isTaskDue,
  HEARTBEAT_TOKEN,
  HEARTBEAT_PROMPT,
  HEARTBEAT_RESPONSE_TOOL_INSTRUCTIONS,
  HEARTBEAT_RESPONSE_TOOL_PROMPT,
  HEARTBEAT_TRANSCRIPT_PROMPT,
  DEFAULT_HEARTBEAT_EVERY,
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
} from './heartbeat.js';
export type { HeartbeatTask, StripHeartbeatResult } from './heartbeat.js';

export {
  isHeartbeatUserMessage,
  isHeartbeatOkResponse,
  filterHeartbeatTranscriptArtifacts,
} from './heartbeat-filter.js';

export {
  HEARTBEAT_RESPONSE_TOOL_NAME,
  HEARTBEAT_TOOL_OUTCOMES,
  HEARTBEAT_TOOL_PRIORITIES,
  normalizeHeartbeatToolResponse,
  getHeartbeatToolNotificationText,
  createHeartbeatToolResponsePayload,
  resolveHeartbeatToolResponseFromReplyResult,
} from './heartbeat-tool-response.js';
export type { HeartbeatToolResponse } from './heartbeat-tool-response.js';

export { resolveHeartbeatReplyPayload } from './heartbeat-reply-payload.js';

export {
  hasControlCommand,
  isControlCommandMessage,
  hasInlineCommandTokens,
  shouldComputeCommandAuthorized,
  normalizeCommandBody,
  stripInboundMetadata,
  isAbortTrigger,
  listDetectionCommands,
} from './command-detection.js';
export type {
  CommandNormalizeOptions,
  CommandDetectionConfig,
} from './command-detection.js';
export type {
  IsControlCommandMessage,
  ShouldComputeCommandAuthorized,
} from './command-detection.runtime-types.js';

export { parseSendPolicyCommand } from './send-policy.js';
export type { SendPolicyCommandResult } from './send-policy.js';

export { buildHierarchyReinforcementMessage } from './handoff-summarizer.js';
export type { AgentMessage, HandoffSnapshot } from './handoff-summarizer.js';

export {
  FAST_MODE_AUTO_PROGRESS_KIND,
  isFastModeAutoProgressPayload,
  appendReplyMediaFailureWarning,
  getReplyPayloadTtsSupplement,
  isReplyPayloadTtsSupplement,
  markReplyPayloadAsTtsSupplement,
  buildTtsSupplementMediaPayload,
  setReplyPayloadMetadata,
  getReplyPayloadMetadata,
  isReplyPayloadNonTerminalToolErrorWarning,
  copyReplyPayloadMetadata,
  markReplyPayloadForSourceSuppressionDelivery,
  markCommandReplyForDelivery,
  isReplyPayloadStatusNotice,
} from './reply-payload.js';
export type {
  ReplyPayload as RichReplyPayload,
  ReplyToMode,
  MessagePresentation,
  InteractiveReply,
  ReplyPayloadDelivery,
  ReplyPayloadTtsSupplement,
  ReplyDeliveryContext,
  ReplyPayloadMetadata,
} from './reply-payload.js';

export {
  queueInboundMessage,
  getNextQueuedMessage,
  getQueueSize,
  clearQueue,
  isProcessing,
  markProcessing,
  validateInboundMessage,
  normalizeInboundText,
  processInboundQueue,
} from './inbound.js';
export type {
  InboundMessage,
  InboundProcessOptions,
  InboundProcessResult,
  ProcessInboundCallback,
} from './inbound.js';

export { FollowupRunner, createFollowupRunner } from './followup-runner.js';
export type { FollowupTask, FollowupResult, FollowupRunnerOptions } from './followup-runner.js';

export {
  createBlockReplyPipeline,
  coalesceReplyPayloads,
} from './block-reply-pipeline.js';
export type {
  BlockReplyPipeline,
  BlockReplyPipelineOptions,
} from './block-reply-pipeline.js';

export {
  generateReply,
  createReplyPipeline,
} from './reply.js';
export type {
  ReplyContext,
  ReplyPipelineStage,
  ReplyHooks,
  GenerateReplyOptions,
} from './reply.js';

export {
  formatAgentEnvelope,
  formatInboundEnvelope,
  formatInboundFromLabel,
  formatEnvelopeTimestamp,
  resolveEnvelopeFormatOptions,
} from './envelope.js';
export type {
  EnvelopeFormatOptions,
  AgentEnvelopeParams,
  InboundEnvelopeParams,
  InboundFromLabelParams,
} from './envelope.js';

export {
  buildStatusMessage,
  buildCommandsMessage,
  buildHelpMessage,
  buildToolsMessage,
} from './status.js';
export type {
  ToolInventorySource,
  ToolInventoryEntry,
  ToolInventoryGroup,
  ToolInventoryResult,
  StatusMessageParams,
} from './status.js';

export { ThinkingModeController, hasReasoningContent } from './thinking.js';
export type {
  ThinkingParseResult,
  ThinkingChunk,
  ThinkingModeControllerOptions,
} from './thinking.js';

export { TokenCounter, countTokens } from './tokens.js';
export type {
  TokenStats,
  TokenCounterOptions,
  UsageInput,
} from './tokens.js';
