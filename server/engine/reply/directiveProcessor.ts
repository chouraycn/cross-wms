/**
 * Directive System
 * 指令处理系统 - 解析和执行 LLM 输出中的特殊指令标记
 */

export type DirectiveType =
  | "user-note"
  | "system-command"
  | "metadata"
  | "status"
  | "silent-reply"
  | "continue";

export interface ParsedDirective {
  type: DirectiveType;
  content: string;
  raw: string;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, string>;
}

export interface DirectiveHandler {
  type: DirectiveType;
  handle: (directive: ParsedDirective, context: DirectiveContext) => Promise<DirectiveResult> | DirectiveResult;
}

export interface DirectiveContext {
  sessionKey: string;
  runId?: string;
  messageId?: string;
  timestamp: number;
}

export interface DirectiveResult {
  consumed: boolean;
  output?: string;
  sideEffects?: Array<{
    type: string;
    payload?: unknown;
  }>;
}

const DIRECTIVE_PATTERNS: Record<DirectiveType, RegExp> = {
  "user-note": /<!--\s*user-note\s*([\s\S]*?)-->/g,
  "system-command": /<!--\s*system-command\s*:\s*(\w+)\s*([\s\S]*?)-->/g,
  "metadata": /<!--\s*metadata\s*([\s\S]*?)-->/g,
  "status": /<!--\s*status\s*:\s*(\w+)\s*-->/g,
  "silent-reply": /<!--\s*silent-reply\s*-->/g,
  "continue": /<!--\s*continue\s*-->/g,
};

class DirectiveProcessor {
  private readonly handlers = new Map<DirectiveType, DirectiveHandler>();

  register(handler: DirectiveHandler): void {
    this.handlers.set(handler.type, handler);
  }

  unregister(type: DirectiveType): boolean {
    return this.handlers.delete(type);
  }

  /**
   * 从文本中提取所有指令
   */
  extractDirectives(text: string): ParsedDirective[] {
    const directives: ParsedDirective[] = [];

    for (const [type, pattern] of Object.entries(DIRECTIVE_PATTERNS) as [
      DirectiveType,
      RegExp,
    ][]) {
      const regex = new RegExp(pattern.source, "g");
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const directive: ParsedDirective = {
          type,
          content: match[1]?.trim() ?? "",
          raw: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        };

        // 解析 metadata 的键值对
        if (type === "metadata" && directive.content) {
          directive.metadata = this.parseMetadata(directive.content);
        }

        directives.push(directive);
      }
    }

    return directives.sort((a, b) => a.startIndex - b.startIndex);
  }

  /**
   * 处理文本中的所有指令
   */
  async process(
    text: string,
    context: DirectiveContext,
  ): Promise<{
    cleanedText: string;
    directives: ParsedDirective[];
    results: DirectiveResult[];
    sideEffects: DirectiveResult["sideEffects"];
  }> {
    const directives = this.extractDirectives(text);
    const results: DirectiveResult[] = [];
    const allSideEffects: DirectiveResult["sideEffects"] = [];
    let cleanedText = text;

    for (const directive of directives) {
      const handler = this.handlers.get(directive.type);
      if (handler) {
        const result = await handler.handle(directive, context);
        results.push(result);

        if (result.sideEffects) {
          allSideEffects.push(...result.sideEffects);
        }

        if (result.consumed) {
          cleanedText = cleanedText.slice(0, directive.startIndex) +
            (result.output ?? "") +
            cleanedText.slice(directive.endIndex);
        }
      }
    }

    return {
      cleanedText: cleanedText.trim(),
      directives,
      results,
      sideEffects: allSideEffects,
    };
  }

  /**
   * 检查文本是否包含特定类型的指令
   */
  hasDirective(text: string, type: DirectiveType): boolean {
    const pattern = DIRECTIVE_PATTERNS[type];
    if (!pattern) return false;
    const regex = new RegExp(pattern.source);
    return regex.test(text);
  }

  /**
   * 剥离所有指令，只保留纯文本
   */
  stripDirectives(text: string): string {
    let result = text;
    for (const pattern of Object.values(DIRECTIVE_PATTERNS)) {
      result = result.replace(new RegExp(pattern.source, "g"), "");
    }
    return result.trim();
  }

  private parseMetadata(content: string): Record<string, string> {
    const metadata: Record<string, string> = {};
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim();
        const value = trimmed.slice(colonIndex + 1).trim();
        if (key) {
          metadata[key] = value;
        }
      }
    }
    return metadata;
  }

  clear(): void {
    this.handlers.clear();
  }

  size(): number {
    return this.handlers.size;
  }
}

const DIRECTIVE_PROCESSOR_INSTANCE = new DirectiveProcessor();

export function getDirectiveProcessor(): DirectiveProcessor {
  return DIRECTIVE_PROCESSOR_INSTANCE;
}

export function registerDirectiveHandler(handler: DirectiveHandler): void {
  DIRECTIVE_PROCESSOR_INSTANCE.register(handler);
}

export function processDirectives(
  text: string,
  context: DirectiveContext,
): ReturnType<DirectiveProcessor["process"]> {
  return DIRECTIVE_PROCESSOR_INSTANCE.process(text, context);
}

export function stripDirectives(text: string): string {
  return DIRECTIVE_PROCESSOR_INSTANCE.stripDirectives(text);
}

export function resetDirectiveProcessorForTests(): void {
  DIRECTIVE_PROCESSOR_INSTANCE.clear();
}

export type { DirectiveProcessor };

// 内置默认指令处理器
const defaultHandlers: DirectiveHandler[] = [
  {
    type: "silent-reply",
    handle: () => ({ consumed: true }),
  },
  {
    type: "continue",
    handle: () => ({
      consumed: true,
      sideEffects: [{ type: "request_continue" }],
    }),
  },
  {
    type: "status",
    handle: (directive) => ({
      consumed: true,
      sideEffects: [{ type: "status_update", payload: directive.content }],
    }),
  },
  {
    type: "metadata",
    handle: (directive) => ({
      consumed: true,
      sideEffects: [{ type: "metadata", payload: directive.metadata }],
    }),
  },
];

for (const handler of defaultHandlers) {
  DIRECTIVE_PROCESSOR_INSTANCE.register(handler);
}
