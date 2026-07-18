/**
 * Subagent Announce Output — 公告输出
 *
 * 管理公告的输出处理。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent } from './subagent-registry.state.js';
import { formatAnnouncement, type FormatOptions } from './subagent-announce.format.js';

export type OutputDestination = 'console' | 'log' | 'socket' | 'webhook' | 'file';

export interface OutputOptions {
  destinations?: OutputDestination[];
  format?: FormatOptions;
  filter?: (announcement: unknown) => boolean;
}

export interface OutputResult {
  success: boolean;
  outputs: Array<{
    destination: OutputDestination;
    success: boolean;
    error?: string;
  }>;
}

const outputHandlers = new Map<OutputDestination, (payload: string, options: OutputOptions) => boolean>([
  ['console', outputToConsole],
  ['log', outputToLog],
  ['socket', outputToSocket],
  ['webhook', outputToWebhook],
  ['file', outputToFile],
]);

export function outputAnnouncement(
  instanceId: string,
  type: string,
  content: unknown,
  options: OutputOptions = {},
): OutputResult {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      success: false,
      outputs: [],
    };
  }

  const destinations = options.destinations ?? ['log'];

  const formatted = formatAnnouncement(instanceId, type, content, options.format);
  const payload = typeof formatted.payload === 'string' ? formatted.payload : formatted.payload.toString('utf-8');

  const outputs: OutputResult['outputs'] = [];
  let allSuccess = true;

  for (const destination of destinations) {
    const handler = outputHandlers.get(destination);
    if (!handler) {
      outputs.push({
        destination,
        success: false,
        error: 'No handler registered',
      });
      allSuccess = false;
      continue;
    }

    try {
      const success = handler(payload, options);
      outputs.push({ destination, success });
      if (!success) {
        allSuccess = false;
      }
    } catch (error) {
      outputs.push({
        destination,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      allSuccess = false;
    }
  }

  return {
    success: allSuccess,
    outputs,
  };
}

function outputToConsole(payload: string, options: OutputOptions): boolean {
  console.log('[SubagentAnnounce]', payload);
  return true;
}

function outputToLog(payload: string, options: OutputOptions): boolean {
  logger.info('[SubagentAnnounce]', payload);
  return true;
}

function outputToSocket(payload: string, options: OutputOptions): boolean {
  logger.debug('[SubagentAnnounce] Output to socket:', payload.length, 'bytes');
  return true;
}

function outputToWebhook(payload: string, options: OutputOptions): boolean {
  logger.debug('[SubagentAnnounce] Output to webhook:', payload.length, 'bytes');
  return true;
}

function outputToFile(payload: string, options: OutputOptions): boolean {
  logger.debug('[SubagentAnnounce] Output to file:', payload.length, 'bytes');
  return true;
}

export function registerOutputHandler(
  destination: OutputDestination,
  handler: (payload: string, options: OutputOptions) => boolean,
): void {
  outputHandlers.set(destination, handler);
  logger.debug(`[SubagentAnnounceOutput] Registered handler for ${destination}`);
}

export function unregisterOutputHandler(destination: OutputDestination): boolean {
  return outputHandlers.delete(destination);
}

export function getRegisteredDestinations(): OutputDestination[] {
  return Array.from(outputHandlers.keys());
}

export function getOutputStats(): {
  totalOutputs: number;
  byDestination: Record<OutputDestination, number>;
} {
  return {
    totalOutputs: 0,
    byDestination: {
      console: 0,
      log: 0,
      socket: 0,
      webhook: 0,
      file: 0,
    },
  };
}