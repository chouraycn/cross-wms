/**
 * 内容去重与折叠工具
 *
 * 功能：
 * 1. 基于 thinkingSignature 的重复思考块检测
 * 2. 基于 textSignature 的重复文本块检测
 * 3. 折叠 UI 状态管理
 * 4. 历史消息去重（多轮对话场景）
 *
 * 参考：OpenClaw thinking.ts stripInvalidThinkingSignatures + dropThinkingBlocks
 */

import type {
  ContentBlock,
  ThinkingContentBlock,
  TextContentBlock,
} from '../types/content-blocks';

/** 折叠状态 */
export interface CollapseState {
  /** 是否已折叠 */
  collapsed: boolean;
  /** 折叠原因 */
  reason: 'duplicate' | 'redacted' | 'context_overflow' | 'user_hidden';
  /** 折叠后的摘要文本 */
  summary?: string;
  /** 原始内容长度（字符数） */
  originalLength?: number;
  /** 折叠比例（压缩后/原始） */
  compressionRatio?: number;
}

/** 折叠块元数据 */
export interface CollapsedBlockMetadata {
  /** 原始块的索引 */
  originalIndex: number;
  /** 折叠后的占位符文本 */
  placeholder: string;
  /** 折叠状态 */
  state: CollapseState;
}

/** 去重检测结果 */
export interface DeduplicationResult {
  /** 去重后的内容块数组 */
  deduplicatedBlocks: ContentBlock[];
  /** 被折叠的块元数据 */
  collapsedMetadata: CollapsedBlockMetadata[];
  /** 去重统计 */
  stats: {
    /** 原始块数 */
    originalCount: number;
    /** 去重后块数 */
    deduplicatedCount: number;
    /** 重复块数 */
    duplicateCount: number;
    /** 红色块数 */
    redactedCount: number;
    /** 总字符数 */
    totalCharacters: number;
    /** 节省字符数 */
    savedCharacters: number;
  };
}

/**
 * 判断两个签名是否相同（用于去重）
 *
 * 本地实现（不依赖后端 thinkingSignatureManager）
 */
function areSignaturesEqual(
  signature1: string | undefined,
  signature2: string | undefined,
): boolean {
  if (!signature1 || !signature2) {
    return false;
  }

  // 精确匹配
  if (signature1 === signature2) {
    return true;
  }

  // JSON 签名：解析后比较关键字段
  if (signature1.startsWith('{') && signature2.startsWith('{')) {
    try {
      const parsed1 = JSON.parse(signature1) as Record<string, unknown>;
      const parsed2 = JSON.parse(signature2) as Record<string, unknown>;

      // 比较 id 和 encrypted_content
      return (
        parsed1.id === parsed2.id &&
        parsed1.encrypted_content === parsed2.encrypted_content
      );
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 检测两个思考块是否重复
 *
 * 规则：
 * 1. 签名相同 → 重复
 * 2. 内容完全相同 → 重复
 * 3. 签名不同但内容相似度 > 95% → 重复
 */
export function areThinkingBlocksDuplicate(
  block1: ThinkingContentBlock,
  block2: ThinkingContentBlock,
): boolean {
  // 规则 1：签名相同
  if (areSignaturesEqual(block1.thinkingSignature, block2.thinkingSignature)) {
    return true;
  }

  // 规则 2：内容完全相同
  if (block1.thinking === block2.thinking) {
    return true;
  }

  // 规则 3：内容相似度检测（简化版：前 100 字符匹配）
  const prefix1 = block1.thinking.slice(0, 100);
  const prefix2 = block2.thinking.slice(0, 100);
  if (prefix1 === prefix2 && prefix1.length > 50) {
    return true;
  }

  return false;
}

/**
 * 检测两个文本块是否重复
 *
 * 规则：
 * 1. textSignature 相同 → 重复
 * 2. 内容完全相同 → 重复
 */
export function areTextBlocksDuplicate(
  block1: TextContentBlock,
  block2: TextContentBlock,
): boolean {
  // 规则 1：textSignature 相同
  if (
    block1.textSignature &&
    block2.textSignature &&
    block1.textSignature.id === block2.textSignature.id
  ) {
    return true;
  }

  // 规则 2：内容完全相同
  if (block1.text === block2.text) {
    return true;
  }

  return false;
}

/**
 * 对内容块数组进行去重
 *
 * 策略：
 * 1. 首次出现的块保留
 * 2. 重复块标记为折叠状态
 * 3. redacted 块默认折叠（不显示加密内容）
 *
 * @param blocks 原始内容块数组
 * @param options 去重选项
 */
export function deduplicateContentBlocks(
  blocks: ContentBlock[],
  options?: {
    /** 是否折叠 redacted 块 */
    collapseRedacted?: boolean;
    /** 是否折叠重复块 */
    collapseDuplicates?: boolean;
    /** 是否保留历史签名（用于多轮对话连续性） */
    preserveSignatures?: boolean;
  },
): DeduplicationResult {
  const collapseRedacted = options?.collapseRedacted ?? true;
  const collapseDuplicates = options?.collapseDuplicates ?? true;
  const preserveSignatures = options?.preserveSignatures ?? true;

  const deduplicatedBlocks: ContentBlock[] = [];
  const collapsedMetadata: CollapsedBlockMetadata[] = [];
  const seenThinkingBlocks: ThinkingContentBlock[] = [];
  const seenTextBlocks: TextContentBlock[] = [];

  let duplicateCount = 0;
  let redactedCount = 0;
  let savedCharacters = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];

    switch (block.type) {
      case 'thinking': {
        const thinkingBlock = block as ThinkingContentBlock;

        // redacted 块处理
        if (thinkingBlock.redacted && collapseRedacted) {
          redactedCount++;
          savedCharacters += thinkingBlock.thinking.length;

          // 保留签名但不显示内容
          if (preserveSignatures && thinkingBlock.thinkingSignature) {
            deduplicatedBlocks.push({
              type: 'thinking',
              thinking: '[assistant reasoning omitted]',
              thinkingSignature: thinkingBlock.thinkingSignature,
              redacted: true,
            } as ThinkingContentBlock);
          } else {
            collapsedMetadata.push({
              originalIndex: i,
              placeholder: '[思考内容已折叠]',
              state: {
                collapsed: true,
                reason: 'redacted',
                summary: '加密思考内容（安全脱敏）',
                originalLength: thinkingBlock.thinking.length,
              },
            });
          }
          continue;
        }

        // 重复检测
        if (collapseDuplicates) {
          const isDuplicate = seenThinkingBlocks.some((seen) =>
            areThinkingBlocksDuplicate(seen, thinkingBlock),
          );

          if (isDuplicate) {
            duplicateCount++;
            savedCharacters += thinkingBlock.thinking.length;

            collapsedMetadata.push({
              originalIndex: i,
              placeholder: '[重复思考内容已折叠]',
              state: {
                collapsed: true,
                reason: 'duplicate',
                summary: `与之前的思考块相同（签名: ${thinkingBlock.thinkingSignature?.slice(0, 20) ?? '无'}）`,
                originalLength: thinkingBlock.thinking.length,
              },
            });
            continue;
          }
        }

        // 非重复、非 redacted：保留
        seenThinkingBlocks.push(thinkingBlock);
        deduplicatedBlocks.push(thinkingBlock);
        break;
      }

      case 'text': {
        const textBlock = block as TextContentBlock;

        // 重复检测
        if (collapseDuplicates) {
          const isDuplicate = seenTextBlocks.some((seen) =>
            areTextBlocksDuplicate(seen, textBlock),
          );

          if (isDuplicate) {
            duplicateCount++;
            savedCharacters += textBlock.text.length;

            collapsedMetadata.push({
              originalIndex: i,
              placeholder: '[重复文本已折叠]',
              state: {
                collapsed: true,
                reason: 'duplicate',
                summary: `与之前的文本块相同（ID: ${textBlock.textSignature?.id ?? '无'}）`,
                originalLength: textBlock.text.length,
              },
            });
            continue;
          }
        }

        // 非重复：保留
        seenTextBlocks.push(textBlock);
        deduplicatedBlocks.push(textBlock);
        break;
      }

      default:
        // 其他类型（toolCall/toolResult/image/audio/video/file/canvas）：直接保留
        deduplicatedBlocks.push(block);
        break;
    }
  }

  // 统计
  const totalCharacters = blocks.reduce((sum, block) => {
    if (block.type === 'thinking') return sum + (block as ThinkingContentBlock).thinking.length;
    if (block.type === 'text') return sum + (block as TextContentBlock).text.length;
    return sum;
  }, 0);

  return {
    deduplicatedBlocks,
    collapsedMetadata,
    stats: {
      originalCount: blocks.length,
      deduplicatedCount: deduplicatedBlocks.length,
      duplicateCount,
      redactedCount,
      totalCharacters,
      savedCharacters,
    },
  };
}

/**
 * 从历史消息中提取签名并构建回传列表
 *
 * 用于多轮对话：将上一轮的签名回传给 API，保证上下文连续性。
 * 同时，签名相同的思考块会被标记为可折叠。
 *
 * 参考：OpenClaw extractReplayableSignaturesFromHistory
 */
export function buildSignatureReplayList(
  historyBlocks: ContentBlock[],
): {
  /** 可回传的签名列表 */
  replayableSignatures: string[];
  /** 签名到块索引的映射 */
  signatureToBlockIndex: Map<string, number>;
} {
  const replayableSignatures: string[] = [];
  const signatureToBlockIndex = new Map<string, number>();

  for (let i = 0; i < historyBlocks.length; i++) {
    const block = historyBlocks[i];
    if (block.type === 'thinking') {
      const thinkingBlock = block as ThinkingContentBlock;
      if (thinkingBlock.thinkingSignature) {
        replayableSignatures.push(thinkingBlock.thinkingSignature);
        signatureToBlockIndex.set(thinkingBlock.thinkingSignature, i);
      }
    }
  }

  return { replayableSignatures, signatureToBlockIndex };
}

/**
 * 判断块是否应该被折叠
 *
 * 折叠条件：
 * 1. redacted=true → 折叠（安全脱敏）
 * 2. 签名重复 → 折叠（去重）
 * 3. 内容过长 + 用户设置 → 折叠（节省空间）
 */
export function shouldCollapseBlock(
  block: ContentBlock,
  options?: {
    /** 是否折叠 redacted */
    collapseRedacted?: boolean;
    /** 已见过的签名列表 */
    seenSignatures?: string[];
    /** 最大显示长度（超过则折叠） */
    maxLength?: number;
  },
): CollapseState | null {
  const collapseRedacted = options?.collapseRedacted ?? true;
  const seenSignatures = options?.seenSignatures ?? [];
  const maxLength = options?.maxLength ?? 5000;

  if (block.type === 'thinking') {
    const thinkingBlock = block as ThinkingContentBlock;

    // redacted 折叠
    if (thinkingBlock.redacted && collapseRedacted) {
      return {
        collapsed: true,
        reason: 'redacted',
        summary: '加密思考内容（安全脱敏）',
        originalLength: thinkingBlock.thinking.length,
      };
    }

    // 签名重复折叠
    if (
      thinkingBlock.thinkingSignature &&
      seenSignatures.includes(thinkingBlock.thinkingSignature)
    ) {
      return {
        collapsed: true,
        reason: 'duplicate',
        summary: `与之前的思考块签名相同`,
        originalLength: thinkingBlock.thinking.length,
      };
    }

    // 长度折叠
    if (thinkingBlock.thinking.length > maxLength) {
      return {
        collapsed: true,
        reason: 'context_overflow',
        summary: `思考内容过长（${thinkingBlock.thinking.length} 字符）`,
        originalLength: thinkingBlock.thinking.length,
        compressionRatio: maxLength / thinkingBlock.thinking.length,
      };
    }
  }

  if (block.type === 'text') {
    const textBlock = block as TextContentBlock;

    // textSignature 重复折叠
    if (
      textBlock.textSignature &&
      seenSignatures.includes(textBlock.textSignature.id)
    ) {
      return {
        collapsed: true,
        reason: 'duplicate',
        summary: `与之前的文本块 ID 相同`,
        originalLength: textBlock.text.length,
      };
    }

    // 长度折叠
    if (textBlock.text.length > maxLength) {
      return {
        collapsed: true,
        reason: 'context_overflow',
        summary: `文本内容过长（${textBlock.text.length} 字符）`,
        originalLength: textBlock.text.length,
        compressionRatio: maxLength / textBlock.text.length,
      };
    }
  }

  return null;
}

/**
 * 构建折叠块的占位符文本
 *
 * 根据折叠原因生成不同的占位符：
 * - redacted: "[assistant reasoning omitted]"（OpenClaw 标准）
 * - duplicate: "[重复内容已折叠]"
 * - context_overflow: "[内容过长已折叠]"
 */
export function buildCollapsedPlaceholder(state: CollapseState): string {
  switch (state.reason) {
    case 'redacted':
      return '[assistant reasoning omitted]';
    case 'duplicate':
      return `[重复内容已折叠] ${state.summary ?? ''}`;
    case 'context_overflow':
      return `[内容过长已折叠] ${state.summary ?? ''}`;
    case 'user_hidden':
      return '[用户已隐藏此内容]';
    default:
      return '[内容已折叠]';
  }
}

/**
 * 统计折叠节省的渲染开销
 *
 * 用于评估去重效果和内存优化。
 */
export function estimateCollapseSavings(
  collapsedMetadata: CollapsedBlockMetadata[],
): {
  /** 节省的字符数 */
  savedCharacters: number;
  /** 节省的渲染节点数 */
  savedNodes: number;
  /** 节省的内存估算（字节） */
  savedMemoryBytes: number;
} {
  let savedCharacters = 0;
  let savedNodes = 0;

  for (const meta of collapsedMetadata) {
    const originalLength = meta.state.originalLength ?? 0;
    savedCharacters += originalLength;
    // 简化估算：每 50 字符 ≈ 1 个渲染节点
    savedNodes += Math.ceil(originalLength / 50);
  }

  // 内存估算：每字符 ≈ 2 字节（UTF-16）
  const savedMemoryBytes = savedCharacters * 2;

  return { savedCharacters, savedNodes, savedMemoryBytes };
}