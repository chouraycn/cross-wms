/**
 * transcripts built-in tool.
 *
 * Manages live capture, manual import, summarization, and process-local transcript sessions.
 *
 * Simplified for cross-wms: preserves schema, types, and manual import/summarization;
 * live capture requires transcript provider integration.
 */
import { randomUUID } from "node:crypto";
import { Type } from "typebox";
import type { AnyAgentTool } from "./common.js";

type TranscriptsLogger = {
  warn: (message: string) => void;
};

type TranscriptSourceLocator = {
  providerId: string;
  accountId?: string;
  guildId?: string;
  channelId?: string;
  meetingUrl?: string;
};

type TranscriptUtterance = {
  speaker?: string;
  text: string;
  timestamp?: string;
};

type TranscriptSessionDescriptor = {
  sessionId: string;
  title?: string;
  source: TranscriptSourceLocator;
  startedAt: string;
  stoppedAt?: string;
  metadata?: Record<string, any>;
};

const activeSessions = new Map<string, { session: TranscriptSessionDescriptor; providerId: string }>();

function asParamsRecord(params: any): Record<string, any> {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as Record<string, any>)
    : {};
}

function readStringParam(
  params: Record<string, any>,
  key: string,
  options: { required: true; trim?: boolean },
): string;
function readStringParam(
  params: Record<string, any>,
  key: string,
  options?: { required?: false; trim?: boolean },
): string | undefined;
function readStringParam(
  params: Record<string, any>,
  key: string,
  options: { required?: boolean; trim?: boolean } = {},
): string | undefined {
  const value = params[key];
  if (typeof value !== "string") {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  const normalized = options.trim === false ? value : value.trim();
  if (!normalized && options.required) {
    throw new Error(`${key} required`);
  }
  return normalized || undefined;
}

const TranscriptsSchema = Type.Object(
  {
    action: Type.String({
      description: "start, stop, status, import, or summarize.",
    }),
    sessionId: Type.Optional(Type.String({ minLength: 1 })),
    title: Type.Optional(Type.String({ minLength: 1 })),
    providerId: Type.Optional(Type.String({ minLength: 1 })),
    accountId: Type.Optional(Type.String({ minLength: 1 })),
    guildId: Type.Optional(Type.String({ minLength: 1 })),
    channelId: Type.Optional(Type.String({ minLength: 1 })),
    meetingUrl: Type.Optional(Type.String({ minLength: 1 })),
    transcript: Type.Optional(Type.String({ minLength: 1 })),
    speakerLabel: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

function createSessionId(): string {
  return `transcript-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function toolText(text: string, details?: Record<string, any>) {
  return {
    content: [{ type: "text" as const, text }],
    details: details ?? {},
  };
}

function sourceFromParams(params: Record<string, any>): TranscriptSourceLocator {
  const providerId = readStringParam(params, "providerId", { trim: true }) ?? "manual-transcript";
  return {
    providerId,
    accountId: readStringParam(params, "accountId", { trim: true }),
    guildId: readStringParam(params, "guildId", { trim: true }),
    channelId: readStringParam(params, "channelId", { trim: true }),
    meetingUrl: readStringParam(params, "meetingUrl", { trim: true }),
  };
}

function parseTranscriptLines(text: string, speakerLabel?: string): TranscriptUtterance[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const utterances: TranscriptUtterance[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const speakerMatch = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/);
    if (speakerMatch) {
      utterances.push({
        speaker: speakerLabel ?? speakerMatch[1].trim(),
        text: speakerMatch[2].trim(),
      });
    } else {
      utterances.push({
        speaker: speakerLabel,
        text: trimmed,
      });
    }
  }

  return utterances;
}

function summarizeTranscript(utterances: TranscriptUtterance[]): string {
  if (utterances.length === 0) {
    return "No transcript content.";
  }

  const speakers = new Set<string>();
  let totalChars = 0;
  for (const u of utterances) {
    if (u.speaker) {
      speakers.add(u.speaker);
    }
    totalChars += u.text.length;
  }

  const lines: string[] = [];
  lines.push(`Transcript Summary`);
  lines.push(`- Utterances: ${utterances.length}`);
  lines.push(`- Speakers: ${speakers.size > 0 ? [...speakers].join(", ") : "unknown"}`);
  lines.push(`- Total characters: ${totalChars}`);

  if (utterances.length <= 10) {
    lines.push("");
    lines.push("Full transcript:");
    for (const u of utterances) {
      lines.push(u.speaker ? `${u.speaker}: ${u.text}` : u.text);
    }
  } else {
    lines.push("");
    lines.push("First 5 utterances:");
    for (let i = 0; i < 5 && i < utterances.length; i += 1) {
      const u = utterances[i];
      lines.push(u.speaker ? `${u.speaker}: ${u.text}` : u.text);
    }
    lines.push("...");
    lines.push("Last 5 utterances:");
    for (let i = Math.max(0, utterances.length - 5); i < utterances.length; i += 1) {
      const u = utterances[i];
      lines.push(u.speaker ? `${u.speaker}: ${u.text}` : u.text);
    }
  }

  return lines.join("\n");
}

async function importTranscripts(params: {
  rawParams: Record<string, any>;
}) {
  const source = sourceFromParams(params.rawParams);
  const session: TranscriptSessionDescriptor = {
    sessionId: readStringParam(params.rawParams, "sessionId", { trim: true }) ?? createSessionId(),
    title: readStringParam(params.rawParams, "title", { trim: true }),
    source,
    startedAt: new Date().toISOString(),
    stoppedAt: new Date().toISOString(),
  };
  const transcript = readStringParam(params.rawParams, "transcript", {
    required: true,
    trim: false,
  });
  const utterances = parseTranscriptLines(
    transcript,
    readStringParam(params.rawParams, "speakerLabel", { trim: true }),
  );
  const summary = summarizeTranscript(utterances);
  return toolText(`Transcript imported: ${session.sessionId}`, {
    sessionId: session.sessionId,
    utteranceCount: utterances.length,
    summary,
  });
}

async function summarizeExisting(params: {
  rawParams: Record<string, any>;
}) {
  const sessionId = readStringParam(params.rawParams, "sessionId", {
    required: true,
    trim: true,
  });
  const active = activeSessions.get(sessionId);
  if (!active) {
    throw new Error(`transcripts session not found: ${sessionId}`);
  }
  const summary = `Summary for session ${sessionId}`;
  return toolText(`Transcripts summarized: ${sessionId}\nSummary: ${summary}`, {
    sessionId,
    summary,
  });
}

async function statusTranscripts() {
  const active = [...activeSessions.values()].map((entry) => ({
    sessionId: entry.session.sessionId,
    providerId: entry.providerId,
    title: entry.session.title,
    source: entry.session.source,
  }));
  return toolText(
    [
      `Transcripts providers: manual-transcript`,
      `Active sessions: ${active.length}`,
    ].join("\n"),
    { providers: ["manual-transcript"], active },
  );
}

export function createTranscriptsTool(options?: {
  config?: any;
  stateDir?: string;
  logger?: TranscriptsLogger;
}): AnyAgentTool {
  return {
    name: "transcripts",
    label: "Transcripts",
    description:
      "Start, stop, import, summarize, or inspect transcripts. Manual import supports plain text with optional speaker labels.",
    parameters: TranscriptsSchema as unknown as Record<string, {
      name: string;
      type: "string" | "number" | "boolean" | "object" | "any" | "array";
      description: string;
      required: boolean;
      default?: any;
      enum?: string[] | undefined;
      items?: { type: string } | undefined;
      properties?: Record<string, any> | undefined;
    }>,
    async execute(_toolCallId: string, rawParams: any) {
      const params = asParamsRecord(rawParams);
      const action = readStringParam(params, "action", { required: true, trim: true });
      switch (action) {
        case "start":
          throw new Error(
            "transcripts start not implemented in cross-wms. Use action='import' for manual transcript import.",
          );
        case "stop":
          throw new Error(
            "transcripts stop not implemented in cross-wms. Use action='import' for manual transcript import.",
          );
        case "import":
          return await importTranscripts({ rawParams: params });
        case "summarize":
          return await summarizeExisting({ rawParams: params });
        case "status":
          return await statusTranscripts();
        default:
          throw new Error(`unsupported transcripts action: ${action}`);
      }
    },
  } as unknown as AnyAgentTool;
}

export function createTranscriptsAutoStartService(_ctx: {
  config?: any;
  stateDir?: string;
  logger?: TranscriptsLogger;
}): {
  start: () => void;
  stop: () => Promise<void>;
} {
  return {
    start() {},
    async stop() {},
  };
}
