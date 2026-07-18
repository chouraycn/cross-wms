import { logger } from '../../../logger.js';
import type { ToolCall, ToolResult, ToolExecutorOptions } from './types.js';
import { getTool } from './tool-registry.js';

export class ToolExecutor {
  private callId = 0;

  async execute(toolName: string, args: Record<string, unknown>, options?: ToolExecutorOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const id = `${toolName}-${++this.callId}-${Date.now()}`;

    const tool = getTool(toolName);
    if (!tool) {
      logger.error(`[Agents:ToolExecutor] Tool not found: ${toolName}`);
      return {
        id,
        toolName,
        success: false,
        error: `Tool not found: ${toolName}`,
        durationMs: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    const timeoutMs = options?.timeoutMs ?? tool.definition.timeoutMs;
    const maxRetries = options?.maxRetries ?? 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`[Agents:ToolExecutor] Executing tool: ${toolName} (attempt ${attempt + 1})`);

        const result = await this.withTimeout(
          tool.execute(args),
          timeoutMs,
        );

        logger.debug(`[Agents:ToolExecutor] Tool ${toolName} executed successfully`);
        return {
          id,
          toolName,
          success: true,
          result,
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (attempt >= maxRetries) {
          logger.error(`[Agents:ToolExecutor] Tool ${toolName} failed after ${maxRetries + 1} attempts: ${errorMessage}`);
          return {
            id,
            toolName,
            success: false,
            error: errorMessage,
            durationMs: Date.now() - startTime,
            timestamp: Date.now(),
          };
        }

        logger.warn(`[Agents:ToolExecutor] Tool ${toolName} attempt ${attempt + 1} failed: ${errorMessage}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }

    return {
      id,
      toolName,
      success: false,
      error: 'Unknown error',
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }

  async executeBatch(calls: Array<{ toolName: string; args: Record<string, unknown> }>, options?: ToolExecutorOptions): Promise<ToolResult[]> {
    const results = await Promise.all(
      calls.map(call => this.execute(call.toolName, call.args, options)),
    );
    return results;
  }

  async executeSequence(calls: Array<{ toolName: string; args: Record<string, unknown> }>, options?: ToolExecutorOptions): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of calls) {
      const result = await this.execute(call.toolName, call.args, options);
      results.push(result);

      if (!result.success && !options?.continueOnError) {
        break;
      }
    }

    return results;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise.then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }
}

export const toolExecutor = new ToolExecutor();

logger.debug('[Agents:ToolExecutor] Module loaded');