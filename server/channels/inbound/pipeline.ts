/**
 * Inbound event pipeline.
 *
 * Manages the lifecycle of inbound events from external platforms,
 * including queuing, processing, and graceful shutdown.
 */
import type { InboundEvent, InboundQueue, HandleResult } from "./types.js";
import type { InboundEventHandler } from "./handler.js";
import { logger } from "../../logger.js";

/**
 * Pipeline state.
 */
export type PipelineState = "stopped" | "starting" | "running" | "stopping";

/**
 * Pipeline configuration.
 */
export interface InboundPipelineConfig {
  queue: InboundQueue;
  handler: InboundEventHandler;
  /** Maximum events to process per batch (default: 10) */
  batchSize?: number;
  /** Delay between processing batches in ms (default: 100) */
  pollInterval?: number;
  /** Maximum retries for failed events (default: 3) */
  maxRetries?: number;
}

/**
 * Inbound event pipeline.
 *
 * Manages the flow of inbound events:
 * 1. Events are pushed to the queue via `push()`
 * 2. The pipeline processes events from the queue in FIFO order
 * 3. Each event is passed to the handler for processing
 */
export class InboundPipeline {
  private queue: InboundQueue;
  private handler: InboundEventHandler;
  private batchSize: number;
  private pollInterval: number;
  private maxRetries: number;
  private state: PipelineState;
  private processingLoop: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private isProcessing: boolean;

  constructor(params: InboundPipelineConfig) {
    this.queue = params.queue;
    this.handler = params.handler;
    this.batchSize = params.batchSize ?? 10;
    this.pollInterval = params.pollInterval ?? 100;
    this.maxRetries = params.maxRetries ?? 3;
    this.state = "stopped";
    this.isProcessing = false;
  }

  /**
   * Current pipeline state.
   */
  get state_(): PipelineState {
    return this.state;
  }

  /**
   * Check if the pipeline is running.
   */
  get isRunning(): boolean {
    return this.state === "running";
  }

  /**
   * Start the pipeline.
   * Begins processing events from the queue.
   */
  start(): void {
    if (this.state === "running" || this.state === "starting") {
      logger.warn("[InboundPipeline] Already running");
      return;
    }

    this.state = "starting";
    this.abortController = new AbortController();
    this.processingLoop = this.runProcessingLoop();
    this.state = "running";

    logger.info("[InboundPipeline] Started");
  }

  /**
   * Stop the pipeline gracefully.
   * Waits for current processing to complete before stopping.
   */
  async stop(): Promise<void> {
    if (this.state === "stopped" || this.state === "stopping") {
      return;
    }

    this.state = "stopping";
    logger.info("[InboundPipeline] Stopping...");

    // Signal abort to processing loop
    if (this.abortController) {
      this.abortController.abort();
    }

    // Wait for processing loop to complete
    if (this.processingLoop) {
      try {
        await this.processingLoop;
      } catch {
        // Ignore errors during shutdown
      }
    }

    this.state = "stopped";
    this.abortController = null;
    this.processingLoop = null;

    logger.info("[InboundPipeline] Stopped");
  }

  /**
   * Push an event into the pipeline.
   * The event will be queued and processed in FIFO order.
   */
  async push(event: InboundEvent): Promise<void> {
    if (this.state !== "running") {
      throw new Error(`Cannot push event: pipeline is ${this.state}`);
    }

    await this.queue.enqueue(event);
    logger.debug(`[InboundPipeline] Enqueued event: ${event.messageId}`);
  }

  /**
   * Process a single event directly without queuing.
   * Useful for synchronous processing needs.
   */
  async processEvent(event: InboundEvent): Promise<HandleResult> {
    return this.handler.handle(event);
  }

  /**
   * Main processing loop.
   * Continuously dequeues and processes events while the pipeline is running.
   */
  private async runProcessingLoop(): Promise<void> {
    const abortSignal = this.abortController!.signal;

    while (!abortSignal.aborted) {
      try {
        // Process a batch of events
        const processed = await this.processBatch();
        if (processed === 0) {
          // No events to process, wait before next poll
          await this.delay(this.pollInterval, abortSignal);
        }
      } catch (err) {
        if (abortSignal.aborted) {
          break;
        }
        logger.error("[InboundPipeline] Processing error:", err);
        // Wait before retrying after error
        await this.delay(this.pollInterval, abortSignal);
      }
    }
  }

  /**
   * Process a batch of events from the queue.
   */
  private async processBatch(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processed = 0;

    try {
      for (let i = 0; i < this.batchSize; i++) {
        const event = await this.queue.dequeue();
        if (!event) {
          break;
        }

        await this.processEventWithRetry(event);
        processed++;
      }
    } finally {
      this.isProcessing = false;
    }

    return processed;
  }

  /**
   * Process an event with retry logic.
   */
  private async processEventWithRetry(event: InboundEvent): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.handler.handle(event);

        if (result.success) {
          logger.debug(
            `[InboundPipeline] Processed event: ${event.messageId} (attempt ${attempt})`,
          );
          return;
        }

        if (result.error) {
          lastError = result.error;
        }

        // If the decision was to drop, don't retry
        if (result.decision?.action === "drop") {
          logger.debug(
            `[InboundPipeline] Dropped event: ${event.messageId} - ${result.decision.reason}`,
          );
          return;
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }

      if (attempt < this.maxRetries) {
        logger.warn(
          `[InboundPipeline] Retry ${attempt}/${this.maxRetries} for event: ${event.messageId}`,
        );
        // Exponential backoff with simple sleep
        await this.sleep(100 * Math.pow(2, attempt - 1));
      }
    }

    logger.error(
      `[InboundPipeline] Failed to process event after ${this.maxRetries} attempts: ${event.messageId}`,
      lastError,
    );
  }

  /**
   * Simple sleep without abort signal support.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Delay helper that respects abort signal.
   */
  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
      });
    });
  }
}
