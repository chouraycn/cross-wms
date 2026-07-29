/**
 * voicecall 命令
 * 语音通话 (start/join/end/list)
 *
 * 提供语音通话会话管理能力。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type VoicecallOptions = {
  json?: boolean;
};

type CallStatus = "ringing" | "active" | "ended" | "failed";

interface CallEntry {
  id: string;
  participants: string[];
  status: CallStatus;
  startedAt: string;
  endedAt?: string;
  durationSec?: number;
}

const CALL_STORE: Map<string, CallEntry> = new Map();

function startCall(participants: string[]): CallEntry {
  const id = `call_${Date.now().toString(36)}`;
  const entry: CallEntry = {
    id,
    participants,
    status: "ringing",
    startedAt: new Date().toISOString(),
  };
  CALL_STORE.set(id, entry);
  return entry;
}

function joinCall(id: string, participant: string): CallEntry | undefined {
  const call = CALL_STORE.get(id);
  if (!call) {
    return undefined;
  }
  if (!call.participants.includes(participant)) {
    call.participants.push(participant);
  }
  if (call.status === "ringing") {
    call.status = "active";
  }
  return call;
}

function endCall(id: string): CallEntry | undefined {
  const call = CALL_STORE.get(id);
  if (!call) {
    return undefined;
  }
  call.status = "ended";
  call.endedAt = new Date().toISOString();
  const start = new Date(call.startedAt).getTime();
  call.durationSec = Math.floor((Date.now() - start) / 1000);
  return call;
}

function listCalls(): CallEntry[] {
  return Array.from(CALL_STORE.values());
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerVoicecallCommand(program: Command): void {
  const voicecallCmd = program
    .command("voicecall")
    .description("语音通话 (start/join/end/list)")
    .alias("call");

  voicecallCmd
    .command("start <participants>")
    .description("发起语音通话（参与者用逗号分隔）")
    .option("--json", "JSON 输出格式")
    .action((participants: string, options: VoicecallOptions) => {
      const list = participants.split(",").map((p) => p.trim());
      const call = startCall(list);
      logger.info(`已发起通话: ${call.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(call));
      }
    });

  voicecallCmd
    .command("join <id> <participant>")
    .description("加入通话")
    .option("--json", "JSON 输出格式")
    .action((id: string, participant: string, options: VoicecallOptions) => {
      const call = joinCall(id, participant);
      if (!call) {
        logger.error(`未找到通话: ${id}`);
        return;
      }
      logger.info(`${participant} 已加入通话: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(call));
      }
    });

  voicecallCmd
    .command("end <id>")
    .description("结束通话")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: VoicecallOptions) => {
      const call = endCall(id);
      if (!call) {
        logger.error(`未找到通话: ${id}`);
        return;
      }
      logger.info(`已结束通话: ${id} (时长: ${call.durationSec}s)`);
      if (options.json) {
        logger.info(formatJsonOutput(call));
      }
    });

  voicecallCmd
    .command("list")
    .description("列出通话")
    .option("--json", "JSON 输出格式")
    .action((options: VoicecallOptions) => {
      const calls = listCalls();
      if (options.json) {
        logger.info(formatJsonOutput(calls));
      } else {
        logger.info(`通话: ${calls.length}`);
        for (const c of calls) {
          logger.info(`  ${c.id} [${c.status}] 参与者: ${c.participants.join(", ")}`);
        }
      }
    });

  // 默认 list
  voicecallCmd
    .option("--json", "JSON 输出格式")
    .action((options: VoicecallOptions) => {
      const calls = listCalls();
      if (options.json) {
        logger.info(formatJsonOutput(calls));
      } else {
        logger.info(`通话数: ${calls.length}`);
      }
    });
}
