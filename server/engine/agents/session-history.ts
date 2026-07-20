/**
 * 移植自 openclaw/src/agents/cli-runner/session-history.ts
 *
 * CLI session history persistence and prompt helpers.
 * Cross-wms simplified: inlined constants, basic file-based history.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const MAX_CLI_SESSION_HISTORY_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_CLI_SESSION_HISTORY_MESSAGES = 500;
export const MAX_CLI_SESSION_RESEED_HISTORY_CHARS = 300_000;
export const MAX_AUTO_CLI_SESSION_RESEED_HISTORY_CHARS = 100_000;

function resolveDefaultSessionDir(): string {
  return path.join(os.homedir(), ".openclaw", "sessions");
}

/** Resolves the auto reseed history character limit. */
export function resolveAutoCliSessionReseedHistoryChars(params?: {
  configuredLimit?: number;
}): number {
  if (typeof params?.configuredLimit === "number" && params.configuredLimit >= 0) {
    return params.configuredLimit;
  }
  return MAX_AUTO_CLI_SESSION_RESEED_HISTORY_CHARS;
}

/** Builds the CLI session history prompt section. */
export function buildCliSessionHistoryPrompt(params: {
  messages: Array<{ role: string; content: unknown }>;
  modelId?: string;
}): string {
  if (!params.messages.length) return "";
  const lines = params.messages.map((msg) => {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    return `[${msg.role}]: ${content}`;
  });
  return lines.join("\n");
}

/** Returns whether a CLI session has a stored transcript. */
export function hasCliSessionTranscript(params: {
  sessionKey: string;
  sessionDir?: string;
}): boolean {
  const filePath = resolveSessionFilePath(params.sessionKey, params.sessionDir);
  return fs.existsSync(filePath);
}

/** Loads CLI session history messages from disk. */
export function loadCliSessionHistoryMessages(params: {
  sessionKey: string;
  sessionDir?: string;
}): Array<{ role: string; content: unknown }> {
  const filePath = resolveSessionFilePath(params.sessionKey, params.sessionDir);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/** Loads CLI session context engine messages. */
export function loadCliSessionContextEngineMessages(params: {
  sessionKey: string;
  sessionDir?: string;
}): Array<{ role: string; content: unknown }> {
  return loadCliSessionHistoryMessages(params);
}

/** Loads CLI session reseed messages. */
export function loadCliSessionReseedMessages(params: {
  sessionKey: string;
  sessionDir?: string;
  maxChars?: number;
}): Array<{ role: string; content: unknown }> {
  const messages = loadCliSessionHistoryMessages(params);
  const maxChars = params.maxChars ?? MAX_CLI_SESSION_RESEED_HISTORY_CHARS;
  let totalChars = 0;
  const result: Array<{ role: string; content: unknown }> = [];
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    totalChars += content.length;
    if (totalChars > maxChars) break;
    result.push(msg);
  }
  return result;
}

function resolveSessionFilePath(sessionKey: string, sessionDir?: string): string {
  const dir = sessionDir?.trim() ? sessionDir : resolveDefaultSessionDir();
  const safeKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(dir, `${safeKey}.json`);
}
