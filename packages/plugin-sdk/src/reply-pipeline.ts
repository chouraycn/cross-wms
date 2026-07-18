import EventEmitter from 'eventemitter3';
import type { Reply, ReplyMessage, PipelineStage, PipelineContext } from './types';

/**
 * ReplyPipeline 事件
 */
export interface ReplyPipelineEvents {
  pipeline_started: [message: ReplyMessage];
  pipeline_completed: [reply: Reply];
  stage_added: [stage: PipelineStage];
  stage_removed: [stageId: string];
  pipeline_error: [stageId: string, error: Error];
}

/**
 * ReplyPipeline 类
 *
 * 回复处理流水线，支持多阶段处理。
 * 每个阶段可以对消息进行转换、过滤或增强。
 */
export class ReplyPipeline extends EventEmitter<ReplyPipelineEvents> {
  private stages: Map<string, PipelineStage> = new Map();
  private stageOrder: string[] = [];
  private messageCounter = 0;

  /**
   * 处理消息
   * @param message 输入消息
   * @param context 处理上下文
   * @returns 处理后的回复
   */
  async process(
    message: ReplyMessage,
    context?: PipelineContext,
  ): Promise<Reply> {
    const startTime = Date.now();
    const processedStages: string[] = [];

    this.emit('pipeline_started', message);

    let currentMessage: ReplyMessage = { ...message };

    // 按优先级排序的阶段列表
    const sortedStages = this.getSortedStages();

    for (const stage of sortedStages) {
      // 检查阶段是否启用
      if (stage.enabled === false) {
        continue;
      }

      try {
        currentMessage = await stage.process(currentMessage, context);
        processedStages.push(stage.id);
      } catch (error) {
        this.emit(
          'pipeline_error',
          stage.id,
          error instanceof Error ? error : new Error(String(error)),
        );
        // 继续处理后续阶段
      }
    }

    const reply: Reply = {
      id: `reply-${++this.messageCounter}`,
      message: currentMessage,
      stages: processedStages,
      processingTime: Date.now() - startTime,
      metadata: context?.metadata,
    };

    this.emit('pipeline_completed', reply);

    return reply;
  }

  /**
   * 添加处理阶段
   * @param stage 处理阶段
   */
  addStage(stage: PipelineStage): void {
    if (this.stages.has(stage.id)) {
      throw new Error(`Stage ${stage.id} already exists`);
    }

    this.stages.set(stage.id, stage);
    this.updateStageOrder();
    this.emit('stage_added', stage);
  }

  /**
   * 移除处理阶段
   * @param stageId 阶段 ID
   */
  removeStage(stageId: string): void {
    const existed = this.stages.delete(stageId);
    if (existed) {
      this.updateStageOrder();
      this.emit('stage_removed', stageId);
    }
  }

  /**
   * 获取阶段
   * @param stageId 阶段 ID
   */
  getStage(stageId: string): PipelineStage | undefined {
    return this.stages.get(stageId);
  }

  /**
   * 列出所有阶段
   */
  listStages(): PipelineStage[] {
    return this.getSortedStages();
  }

  /**
   * 检查阶段是否存在
   */
  hasStage(stageId: string): boolean {
    return this.stages.has(stageId);
  }

  /**
   * 清空所有阶段
   */
  clear(): void {
    this.stages.clear();
    this.stageOrder = [];
  }

  /**
   * 获取阶段数量
   */
  size(): number {
    return this.stages.size;
  }

  /**
   * 更新阶段顺序（内部方法）
   */
  private updateStageOrder(): void {
    this.stageOrder = Array.from(this.stages.keys());
  }

  /**
   * 获取排序后的阶段列表（内部方法）
   */
  private getSortedStages(): PipelineStage[] {
    return Array.from(this.stages.values()).sort((a, b) => {
      const priorityA = a.priority ?? 100;
      const priorityB = b.priority ?? 100;
      return priorityB - priorityA; // 优先级高的先执行
    });
  }
}

/**
 * 默认 ReplyPipeline 实例
 */
export const replyPipeline = new ReplyPipeline();