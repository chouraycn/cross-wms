/**
 * ACP Client
 * 交互式 ACP 客户端 - 将终端会话连接到 ACP Server
 *
 * 参考 openclaw/src/acp/client.ts 设计（简化版，使用 HTTP API 而非 stdio）
 */

import * as readline from "node:readline";
import type { RequestPermissionRequest, RequestPermissionResponse } from "./permissionResolver.js";
import { resolvePermissionRequest } from "./permissionResolver.js";
import { acpTranslator } from "./translator.js";
import type { OpenAiChatCompletionRequest, OpenAiChatCompletionResponse } from "./translator.js";

export type AcpClientOptions = {
  baseUrl?: string;
  cwd?: string;
  verbose?: boolean;
};

export type AcpClientHandle = {
  sessionId: string;
};

export class AcpClient {
  private baseUrl: string;
  private cwd: string;
  private verbose: boolean;
  private log: (msg: string) => void;
  private sessionId?: string;

  constructor(options: AcpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://localhost:3000";
    this.cwd = options.cwd ?? process.cwd();
    this.verbose = options.verbose ?? false;
    this.log = this.verbose ? (msg: string) => console.error(`[acp-client] ${msg}`) : () => {};
  }

  async initialize(): Promise<string> {
    this.log("initializing ACP client");
    return "initialized";
  }

  async createSession(): Promise<string> {
    this.log("creating session");
    this.sessionId = `acp_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await acpTranslator.startSession({
      sessionId: this.sessionId,
      sessionKey: `user:default:${this.sessionId}`,
      cwd: this.cwd,
      complete: false,
    });

    return this.sessionId;
  }

  async prompt(text: string): Promise<string> {
    if (!this.sessionId) {
      throw new Error("Session not created");
    }

    this.log(`sending prompt: ${text.slice(0, 50)}...`);

    await acpTranslator.recordUserPrompt({
      sessionId: this.sessionId,
      sessionKey: `user:default:${this.sessionId}`,
      runId: `run_${Date.now()}`,
      prompt: [{ type: "text", text }],
    });

    const openAiRequest: OpenAiChatCompletionRequest = {
      model: process.env.CROSS_WMS_MODELS_DEFAULT || "gpt-4o-mini",
      messages: [{ role: "user", content: text }],
      temperature: 0.7,
      max_tokens: 1024,
    };

    const acpRequest = acpTranslator.translateOpenAiToAcp(openAiRequest);

    await acpTranslator.recordUpdate({
      sessionId: this.sessionId,
      sessionKey: `user:default:${this.sessionId}`,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "This is a simulated ACP response." },
      },
    });

    return "This is a simulated ACP response.";
  }

  async handlePermissionRequest(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    return resolvePermissionRequest(params, { cwd: this.cwd });
  }

  async close(): Promise<void> {
    this.log("closing session");
    if (this.sessionId) {
      await acpTranslator.recordUpdate({
        sessionId: this.sessionId,
        sessionKey: `user:default:${this.sessionId}`,
        update: { sessionUpdate: "session_closed" },
      });
    }
    this.sessionId = undefined;
  }
}

export async function runAcpClientInteractive(options: AcpClientOptions = {}): Promise<void> {
  const client = new AcpClient(options);

  await client.initialize();
  const sessionId = await client.createSession();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Cross-WMS ACP Client");
  console.log(`Session: ${sessionId}`);
  console.log('Type a prompt, or "exit" to quit.\n');

  const prompt = () => {
    rl.question("> ", (input) => {
      void (async () => {
        const text = input.trim();
        if (!text) {
          prompt();
          return;
        }
        if (text === "exit" || text === "quit") {
          await client.close();
          rl.close();
          process.exit(0);
        }

        try {
          const response = await client.prompt(text);
          console.log(`\n${response}\n`);
        } catch (err) {
          console.error(`\n[error] ${String(err)}\n`);
        }

        prompt();
      })();
    });
  };

  prompt();
}