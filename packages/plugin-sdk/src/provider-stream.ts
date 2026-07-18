import EventEmitter from 'eventemitter3';
import type { Usage, StreamMessage, StreamConfig, StreamChunk } from './types';

/**
 * ProviderStream 事件
 */
export interface ProviderStreamEvents {
  stream_started: [config: StreamConfig];
  stream_chunk: [chunk: StreamChunk];
  stream_completed: [usage: Usage];
  stream_error: [error: Error];
  stream_aborted: [];
}

/**
 * 默认流式配置
 */
const DEFAULT_CONFIG: Partial<StreamConfig> = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 1,
};

/**
 * ProviderStream 类
 *
 * 流式模型调用引擎，支持流式输出、中断和使用量统计。
 */
export class ProviderStream extends EventEmitter<ProviderStreamEvents> {
  private usage: Usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requests: 0,
  };
  private abortController: AbortController | null = null;
  private isStreaming = false;

  /**
   * 流式调用模型
   * @param model 模型名称
   * @param messages 消息列表
   * @param onChunk 流式块回调
   * @param config 流式配置
   */
  async stream(
    model: string,
    messages: StreamMessage[],
    onChunk: (chunk: StreamChunk) => void,
    config?: Partial<StreamConfig>,
  ): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Stream already in progress');
    }

    const fullConfig: StreamConfig = {
      ...DEFAULT_CONFIG,
      ...config,
      model,
    };

    this.abortController = new AbortController();
    this.isStreaming = true;

    // 重置本次使用量
    const sessionUsage: Usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 1,
    };

    this.emit('stream_started', fullConfig);

    // 包装 onChunk 以触发事件
    const wrappedOnChunk = (chunk: StreamChunk) => {
      this.emit('stream_chunk', chunk);
      onChunk(chunk);
    };

    try {
      // 模拟流式输出
      // 实际实现中应该调用真实的模型 API
      await this.simulateStream(messages, wrappedOnChunk, sessionUsage, fullConfig);

      // 更新累计使用量
      this.usage.promptTokens += sessionUsage.promptTokens;
      this.usage.completionTokens += sessionUsage.completionTokens;
      this.usage.totalTokens += sessionUsage.totalTokens;
      this.usage.requests += 1;

      this.emit('stream_completed', sessionUsage);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        this.emit('stream_aborted');
      } else {
        this.emit('stream_error', error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  /**
   * 中断流式调用
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * 获取使用量统计
   */
  getUsage(): Usage {
    return { ...this.usage };
  }

  /**
   * 检查是否正在流式调用
   */
  isInProgress(): boolean {
    return this.isStreaming;
  }

  /**
   * 重置使用量统计
   */
  resetUsage(): void {
    this.usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      requests: 0,
    };
  }

  /**
   * 模拟流式输出（内部方法）
   */
  private async simulateStream(
    messages: StreamMessage[],
    onChunk: (chunk: StreamChunk) => void,
    usage: Usage,
    config: StreamConfig,
  ): Promise<void> {
    // 计算输入 token 数（简化估算）
    usage.promptTokens = this.estimateTokens(messages);

    // 模拟输出
    const responseText = `这是来自模型 ${config.model} 的响应。`;
    const words = responseText.split('');

    for (let i = 0; i < words.length; i++) {
      // 检查是否被中断
      if (this.abortController?.signal.aborted) {
        throw new DOMException('Stream aborted', 'AbortError');
      }

      // 发送文本块
      if (i === 0) {
        onChunk({ type: 'text', content: words[i] });
      } else {
        onChunk({ type: 'text', content: words[i] });
      }

      // 模拟延迟
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // 计算输出 token 数
    usage.completionTokens = this.estimateTokens([{ role: 'assistant', content: responseText }]);
    usage.totalTokens = usage.promptTokens + usage.completionTokens;

    // 发送完成块
    onChunk({ type: 'done', usage });
  }

  /**
   * 估算 token 数（简化版本）
   */
  private estimateTokens(messages: StreamMessage[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        // 简化估算：平均 4 个字符 = 1 token
        total += Math.ceil(msg.content.length / 4);
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.text) {
            total += Math.ceil(part.text.length / 4);
          }
        }
      }
      // 添加角色和格式开销
      total += 4;
    }
    return total;
  }
}

/**
 * 默认 ProviderStream 实例
 */
export const providerStream = new ProviderStream();