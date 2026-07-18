/**
 * 上下文窗口管理器
 *
 * 管理和优化模型的上下文窗口使用
 */

import type { ModelCapabilityRegistry } from './capability-registry.js';

/**
 * 消息接口
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

/**
 * Token 估算配置
 */
export interface TokenEstimationConfig {
  /** 每条消息的固定开销 */
  messageOverhead?: number;
  /** 每个角色的额外开销 */
  roleOverhead?: number;
}

/**
 * 上下文窗口管理器
 * 用于管理和优化模型的上下文窗口使用
 */
export class ContextWindowManager {
  private registry: ModelCapabilityRegistry;
  private config: TokenEstimationConfig;

  constructor(registry: ModelCapabilityRegistry, config?: TokenEstimationConfig) {
    this.registry = registry;
    this.config = {
      messageOverhead: 4, // 每条消息约4 token开销（<|message|>等标记）
      roleOverhead: 1, // 每个角色约1 token开销
      ...config,
    };
  }

  /**
   * 估算文本的 token 数
   * 使用简化估算方法（类似 tiktoken 的近似值）
   * @param text 文本内容
   * @returns token 数估算值
   */
  estimateTokens(text: string): number {
    if (!text) return 0;

    // 统计中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 统计英文单词数量
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    // 统计英文字符总数
    const englishChars = (text.match(/[a-zA-Z]/g) || []).length;
    // 统计数字数量
    const numberChars = (text.match(/\d/g) || []).length;
    // 其他字符（空格、标点等）
    const otherChars = text.length - chineseChars - englishChars - numberChars;

    // 中文：约 1.5 tokens/字符
    // 英文：约 0.25 token/字符（平均词长约 4 字符，约 1 token）
    // 数字：约 0.25 token/字符
    // 其他：约 0.5 token/字符
    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25 + numberChars * 0.25 + otherChars * 0.5);
  }

  /**
   * 估算消息列表的 token 数
   * @param messages 消息列表
   * @returns token 数估算值
   */
  estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      const contentTokens = this.estimateTokens(msg.content);
      const roleTokens = this.estimateTokens(msg.role);
      const nameTokens = msg.name ? this.estimateTokens(msg.name) : 0;
      const toolCallIdTokens = msg.toolCallId ? this.estimateTokens(msg.toolCallId) : 0;

      return (
        total +
        contentTokens +
        roleTokens +
        nameTokens +
        toolCallIdTokens +
        this.config.messageOverhead! +
        this.config.roleOverhead!
      );
    }, 0);
  }

  /**
   * 适配上下文窗口
   * 自动截断消息以适应模型的上下文窗口
   * @param modelId 模型ID
   * @param messages 消息列表
   * @param reserveForOutput 为输出保留的 token 数
   * @returns 截断后的消息列表
   */
  fitContext(modelId: string, messages: Message[], reserveForOutput: number = 1024): Message[] {
    const modelInfo = this.registry.getModelInfo(modelId);
    const maxContextWindow = modelInfo?.contextWindow || 4096;
    const maxInputTokens = maxContextWindow - reserveForOutput;

    const totalTokens = this.estimateMessagesTokens(messages);

    if (totalTokens <= maxInputTokens) {
      return messages;
    }

    // 需要截断
    return this.truncate(messages, maxInputTokens);
  }

  /**
   * 截断消息列表
   * 保留系统消息和最近的用户消息
   * @param messages 消息列表
   * @param maxTokens 最大 token 数
   * @returns 截断后的消息列表
   */
  truncate(messages: Message[], maxTokens: number): Message[] {
    if (messages.length === 0) {
      return [];
    }

    // 分离系统消息和普通消息
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    // 计算系统消息占用的 token
    const systemTokens = this.estimateMessagesTokens(systemMessages);
    const remainingTokens = maxTokens - systemTokens;

    if (remainingTokens <= 0) {
      // 系统消息已经超出限制，只保留第一条系统消息的截断版本
      if (systemMessages.length > 0) {
        const truncatedSystem: Message = {
          ...systemMessages[0],
          content: this.truncateText(systemMessages[0].content, maxTokens),
        };
        return [truncatedSystem];
      }
      return [];
    }

    // 从最近的对话开始保留
    const result: Message[] = [...systemMessages];
    let currentTokens = systemTokens;

    // 从后往前添加消息
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const msg = nonSystemMessages[i];
      const msgTokens = this.estimateMessagesTokens([msg]);

      if (currentTokens + msgTokens <= maxTokens) {
        result.splice(systemMessages.length, 0, msg);
        currentTokens += msgTokens;
      } else {
        // 尝试截断当前消息
        const availableTokens = maxTokens - currentTokens;
        if (availableTokens > 50) {
          const truncatedContent = this.truncateText(msg.content, availableTokens - 10);
          const truncatedMsg: Message = { ...msg, content: truncatedContent };
          result.splice(systemMessages.length, 0, truncatedMsg);
        }
        break;
      }
    }

    return result;
  }

  /**
   * 分割上下文
   * 将长消息列表分割成多个块
   * @param messages 消息列表
   * @param maxTokens 每个块的最大 token 数
   * @returns 分割后的消息块列表
   */
  splitContext(messages: Message[], maxTokens: number): Message[][] {
    if (messages.length === 0) {
      return [];
    }

    const chunks: Message[][] = [];
    let currentChunk: Message[] = [];
    let currentTokens = 0;

    // 系统消息应该添加到每个块的开头
    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    const systemTokens = this.estimateMessagesTokens(systemMessages);

    for (const msg of nonSystemMessages) {
      const msgTokens = this.estimateMessagesTokens([msg]);

      if (currentTokens + msgTokens + systemTokens > maxTokens && currentChunk.length > 0) {
        // 当前块已满，开始新块
        chunks.push([...systemMessages, ...currentChunk]);
        currentChunk = [];
        currentTokens = 0;
      }

      currentChunk.push(msg);
      currentTokens += msgTokens;
    }

    // 添加最后一个块
    if (currentChunk.length > 0) {
      chunks.push([...systemMessages, ...currentChunk]);
    }

    return chunks;
  }

  /**
   * 截断文本
   * @param text 原文本
   * @param maxTokens 最大 token 数
   * @returns 截断后的文本
   */
  private truncateText(text: string, maxTokens: number): string {
    if (!text) return '';

    // 粗略估算：每个 token 约 2 个字符（综合考虑中英文）
    const estimatedChars = maxTokens * 2;

    if (text.length <= estimatedChars) {
      return text;
    }

    // 截断并添加省略号
    return text.substring(0, estimatedChars) + '...';
  }

  /**
   * 获取模型的上下文窗口信息
   * @param modelId 模型ID
   * @returns 上下文窗口信息
   */
  getContextInfo(modelId: string): {
    contextWindow: number;
    recommendedReserve: number;
    maxInputTokens: number;
  } {
    const modelInfo = this.registry.getModelInfo(modelId);
    const contextWindow = modelInfo?.contextWindow || 4096;
    const maxOutputTokens = modelInfo?.maxTokens || 4096;
    const recommendedReserve = Math.min(maxOutputTokens, Math.floor(contextWindow * 0.25));

    return {
      contextWindow,
      recommendedReserve,
      maxInputTokens: contextWindow - recommendedReserve,
    };
  }

  /**
   * 检查消息列表是否超出上下文窗口
   * @param modelId 模型ID
   * @param messages 消息列表
   * @param reserveForOutput 为输出保留的 token 数
   * @returns 是否超出
   */
  isOverflow(modelId: string, messages: Message[], reserveForOutput: number = 1024): boolean {
    const modelInfo = this.registry.getModelInfo(modelId);
    const maxContextWindow = modelInfo?.contextWindow || 4096;
    const maxInputTokens = maxContextWindow - reserveForOutput;
    const totalTokens = this.estimateMessagesTokens(messages);

    return totalTokens > maxInputTokens;
  }
}