/**
 * Content Block 类型定义 — 基于 OpenClaw Content Block 模型
 *
 * 核心设计：
 * - 消息内容由结构化的内容块数组组成，而非扁平字符串
 * - 每个内容块有明确的 type 字段，与 LLM API 原生格式对齐
 * - 支持多模态扩展（图片、音频、视频、Canvas 等）
 * - 双轨并行：同时支持扁平字段和 Content Block 数组
 */

// ===================== 文本签名 =====================

/** 文本签名 V1 — 标记文本块的元数据和阶段 */
export interface TextSignatureV1 {
  id: string;
  phase: 'commentary' | 'final_answer';
}

// ===================== 内容块类型 =====================

/** 文本内容块 */
export interface TextContentBlock {
  type: 'text';
  text: string;
  textSignature?: TextSignatureV1;
}

/** 思考/推理内容块 */
export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
  thinkingType?: 'deep' | 'local';
  thinkingDuration?: number;
  /** 安全脱敏标记 */
  redacted?: boolean;
  /** 加密签名（可回传 API） */
  thinkingSignature?: string;
}

/** 工具调用内容块 */
export interface ToolCallContentBlock {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  startedAt?: number;
  completedAt?: number;
  /** 执行模式 */
  executionMode?: 'auto' | 'ask' | 'sandbox' | 'deny';
}

/** 工具结果内容块 */
export interface ToolResultContentBlock {
  type: 'toolResult';
  id: string;
  content: string;
  isError?: boolean;
  durationMs?: number;
}

/** 图片内容块 */
export interface ImageContentBlock {
  type: 'image';
  mimeType: string;
  data: string;
  alt?: string;
  width?: number;
  height?: number;
}

/** 音频来源 */
export type AudioSource =
  | { type: 'base64'; mimeType: string; data: string }
  | { type: 'url'; url: string; trusted?: boolean };

/** 音频内容块 */
export interface AudioContentBlock {
  type: 'audio';
  source: AudioSource;
  /** 语音消息标记 */
  isVoiceNote?: boolean;
  durationSeconds?: number;
  /** 语音转文字 */
  transcript?: string;
}

/** 视频来源 */
export type VideoSource =
  | { type: 'url'; url: string }
  | { type: 'attachment'; name: string; mimeType: string };

/** 视频内容块 */
export interface VideoContentBlock {
  type: 'video';
  source: VideoSource;
  thumbnail?: string;
  durationSeconds?: number;
}

/** 文件内容块 */
export interface FileContentBlock {
  type: 'file';
  name: string;
  mimeType: string;
  data: string;
  size?: number;
}

/** Canvas 交互预览内容块 */
export interface CanvasContentBlock {
  type: 'canvas';
  id: string;
  title: string;
  url: string;
  height?: number;
  /** 沙箱模式 */
  sandbox?: boolean;
}

// ===================== 联合类型 =====================

/** 内容块联合类型 */
export type ContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock
  | ToolResultContentBlock
  | ImageContentBlock
  | AudioContentBlock
  | VideoContentBlock
  | FileContentBlock
  | CanvasContentBlock;

/** 可渲染的内容块（排除内部类型） */
export type RenderableContentBlock =
  | TextContentBlock
  | ThinkingContentBlock
  | ToolCallContentBlock
  | ToolResultContentBlock
  | ImageContentBlock
  | AudioContentBlock
  | VideoContentBlock
  | FileContentBlock
  | CanvasContentBlock;

// ===================== 可规范化消息接口 =====================

/** 可规范化的消息结构（避免循环依赖 Message 类型） */
export interface NormalizableMessage {
  content: string;
  thinking?: string;
  thinkingType?: 'deep' | 'local';
  thinkingDuration?: number;
  toolCalls?: Array<{
    id?: string;
    name: string;
    arguments: string;
    result: string;
  }>;
  attachments?: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    url: string;
    type: 'image' | 'file';
  }>;
}

/** 扁平字段输出（反向转换结果） */
export interface FlatMessageFields {
  content: string;
  thinking?: string;
  thinkingType?: 'deep' | 'local';
  thinkingDuration?: number;
  toolCalls?: Array<{
    id?: string;
    name: string;
    arguments: string;
    result: string;
  }>;
}

// ===================== 工具函数 =====================

/** 查找第一个文本内容块 */
export function findTextBlock(blocks: ContentBlock[]): TextContentBlock | undefined {
  return blocks.find((b): b is TextContentBlock => b.type === 'text');
}

/** 查找第一个思考内容块 */
export function findThinkingBlock(blocks: ContentBlock[]): ThinkingContentBlock | undefined {
  return blocks.find((b): b is ThinkingContentBlock => b.type === 'thinking');
}

/** 获取所有工具调用内容块 */
export function getToolCallBlocks(blocks: ContentBlock[]): ToolCallContentBlock[] {
  return blocks.filter((b): b is ToolCallContentBlock => b.type === 'toolCall');
}

/** 获取所有图片内容块 */
export function getImageBlocks(blocks: ContentBlock[]): ImageContentBlock[] {
  return blocks.filter((b): b is ImageContentBlock => b.type === 'image');
}

/** 获取所有音频内容块 */
export function getAudioBlocks(blocks: ContentBlock[]): AudioContentBlock[] {
  return blocks.filter((b): b is AudioContentBlock => b.type === 'audio');
}

/** 按类型筛选内容块 */
export function getContentBlocksByType<T extends ContentBlock['type']>(
  blocks: ContentBlock[],
  type: T,
): Extract<ContentBlock, { type: T }>[] {
  return blocks.filter((b): b is Extract<ContentBlock, { type: T }> => b.type === type);
}

// ===================== 消息规范化 =====================

/** 将扁平消息字段转换为 ContentBlock 数组 */
export function normalizeMessageToBlocks(msg: NormalizableMessage): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // 思考内容块
  if (msg.thinking) {
    blocks.push({
      type: 'thinking',
      thinking: msg.thinking,
      thinkingType: msg.thinkingType,
      thinkingDuration: msg.thinkingDuration,
    });
  }

  // 文本内容块
  if (msg.content) {
    blocks.push({
      type: 'text',
      text: msg.content,
    });
  }

  // 工具调用内容块
  if (msg.toolCalls?.length) {
    for (const tc of msg.toolCalls) {
      blocks.push({
        type: 'toolCall',
        id: tc.id || `tool_${Date.now().toString(36)}`,
        name: tc.name,
        arguments: tc.arguments,
        status: tc.result ? 'completed' : 'running',
        result: tc.result,
      });
    }
  }

  // 附件内容块
  if (msg.attachments?.length) {
    for (const att of msg.attachments) {
      if (att.type === 'image') {
        blocks.push({
          type: 'image',
          mimeType: att.mimeType || 'image/png',
          data: att.url,
          alt: att.fileName,
        });
      } else {
        blocks.push({
          type: 'file',
          name: att.fileName,
          mimeType: att.mimeType || 'application/octet-stream',
          data: att.url,
        });
      }
    }
  }

  return blocks;
}

/** 将 ContentBlock 数组转换回扁平字段 */
export function blocksToFlatFields(blocks: ContentBlock[]): FlatMessageFields {
  const fields: FlatMessageFields = {
    content: '',
  };

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        fields.content += block.text;
        break;
      case 'thinking':
        fields.thinking = (fields.thinking || '') + block.thinking;
        fields.thinkingType = block.thinkingType;
        fields.thinkingDuration = block.thinkingDuration;
        break;
      case 'toolCall': {
        if (!fields.toolCalls) fields.toolCalls = [];
        fields.toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.arguments,
          result: typeof block.result === 'string' ? block.result : JSON.stringify(block.result ?? ''),
        });
        break;
      }
      default:
        // 其他类型（image/audio/video/file/canvas）无法回写到扁平字段
        break;
    }
  }

  return fields;
}

/** 合并连续相同类型的文本块 */
export function collapseSequentialBlocks(blocks: ContentBlock[]): ContentBlock[] {
  if (blocks.length <= 1) return blocks;

  const result: ContentBlock[] = [];
  let current = blocks[0];

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i];

    if (current.type === 'text' && next.type === 'text') {
      // 合并连续文本块
      current = {
        ...current,
        text: current.text + next.text,
      };
    } else {
      result.push(current);
      current = next;
    }
  }

  result.push(current);
  return result;
}
