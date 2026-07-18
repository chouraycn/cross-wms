import type { SyntaxCheckResult, SyntaxError, SourceSpan } from "./types.js";

function createSpan(startIndex: number, endIndex: number, text: string): SourceSpan {
  const before = text.slice(0, startIndex);
  const startRow = before.split("\n").length;
  const startColumn = before.length - before.lastIndexOf("\n") - (before.endsWith("\n") ? 0 : 1);
  const between = text.slice(startIndex, endIndex);
  const endRow = startRow + between.split("\n").length - 1;
  const lastNewline = between.lastIndexOf("\n");
  const endColumn =
    lastNewline === -1 ? startColumn + between.length : between.length - lastNewline - 1;
  return {
    startIndex,
    endIndex,
    startPosition: { row: startRow, column: startColumn },
    endPosition: { row: endRow, column: endColumn },
  };
}

const DANGEROUS_PATTERNS = [
  { pattern: /`[^`]+`/g, error: "Command substitution with backticks is dangerous", code: "BACKTICK_SUBSTITUTION" },
  { pattern: /\$\([^)]+\)/g, error: "Command substitution with $() is dangerous", code: "DOLLAR_PAREN_SUBSTITUTION" },
  { pattern: /\|\s*(sh|bash|zsh|fish|ksh)/gi, error: "Pipe to shell interpreter is dangerous", code: "PIPE_TO_SHELL" },
  { pattern: /(sh|bash|zsh|fish|ksh)\s+-c\b/gi, error: "Shell -c flag allows arbitrary code execution", code: "SHELL_C_FLAG" },
  { pattern: /\beval\b/i, error: "eval command allows arbitrary code execution", code: "EVAL_COMMAND" },
  { pattern: /\bsource\b/i, error: "source command reads and executes files", code: "SOURCE_COMMAND" },
  { pattern: /\bexec\b/i, error: "exec replaces current process", code: "EXEC_COMMAND" },
];

const SYNTAX_PATTERNS = [
  { pattern: /\|\|/g, error: "Double pipe (||) for OR operator", code: "OR_OPERATOR" },
  { pattern: /&&/g, error: "Double ampersand (&&) for AND operator", code: "AND_OPERATOR" },
  { pattern: /\|\s*$/m, error: "Unterminated pipeline", code: "UNTERMINATED_PIPELINE" },
  { pattern: /;\s*$/m, error: "Trailing semicolon", code: "TRAILING_SEMICOLON" },
  { pattern: /<</g, error: "Here-document marker", code: "HEREDOC" },
  { pattern: /<<</g, error: "Here-string marker", code: "HERE_STRING" },
  { pattern: />\s*>/g, error: "Double redirection", code: "DOUBLE_REDIRECTION" },
  { pattern: /2>\s*/g, error: "Stderr redirection", code: "STDERR_REDIRECTION" },
  { pattern: /&\s*$/m, error: "Background execution", code: "BACKGROUND_EXECUTION" },
];

export function checkCommandSyntax(command: string): SyntaxCheckResult {
  const errors: SyntaxError[] = [];
  const warnings: string[] = [];

  for (const { pattern, error, code } of DANGEROUS_PATTERNS) {
    let match;
    while ((match = pattern.exec(command)) !== null) {
      errors.push({
        message: error,
        span: createSpan(match.index, match.index + match[0].length, command),
        errorCode: code,
      });
    }
  }

  for (const { pattern, error, code } of SYNTAX_PATTERNS) {
    let match;
    while ((match = pattern.exec(command)) !== null) {
      warnings.push(`${error} at position ${match.index}`);
    }
  }

  const unclosedQuotes = findUnclosedQuotes(command);
  for (const quote of unclosedQuotes) {
    errors.push({
      message: `Unclosed ${quote.type} quote`,
      span: createSpan(quote.position, quote.position + 1, command),
      errorCode: "UNCLOSED_QUOTE",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function findUnclosedQuotes(text: string): { type: "single" | "double"; position: number }[] {
  const result: { type: "single" | "double"; position: number }[] = [];
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      if (!inSingle) {
        const start = text.lastIndexOf("'", i - 1);
        if (start !== -1) {
          const content = text.slice(start + 1, i);
          if (content.includes("'")) {
            result.push({ type: "single", position: start });
          }
        }
      }
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }

  if (inSingle) {
    const lastSingle = text.lastIndexOf("'");
    if (lastSingle !== -1) {
      result.push({ type: "single", position: lastSingle });
    }
  }

  if (inDouble) {
    const lastDouble = text.lastIndexOf('"');
    if (lastDouble !== -1) {
      result.push({ type: "double", position: lastDouble });
    }
  }

  return result;
}

export function validateCommandStructure(command: string): boolean {
  const result = checkCommandSyntax(command);
  return result.valid;
}

export function formatSyntaxError(error: SyntaxError): string {
  const pos = error.span.startPosition;
  return `Syntax error at line ${pos.row}, column ${pos.column}: ${error.message}`;
}