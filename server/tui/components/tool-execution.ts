import type { TUIToolCall } from '../types.js';
import { formatDuration, wordWrap } from '../tui-formatters.js';

export interface ToolTheme {
  toolTitle: (text: string) => string;
  toolOutput: (text: string) => string;
  toolPendingBg: (text: string) => string;
  toolSuccessBg: (text: string) => string;
  toolErrorBg: (text: string) => string;
  success: (text: string) => string;
  error: (text: string) => string;
  dim: (text: string) => string;
  accent: (text: string) => string;
}

export function renderToolExecution(
  toolCall: TUIToolCall,
  toolTheme: ToolTheme,
  width: number,
): string[] {
  const lines: string[] = [];
  const statusIcon = getStatusIcon(toolCall.status);
  const statusLabel = getStatusLabel(toolCall.status);

  const titleLine =
    toolTheme.toolTitle(`${statusIcon} ${toolCall.name}`) +
    ' ' +
    toolTheme.dim(statusLabel);

  if (toolCall.status === 'running') {
    titleLine;
  } else if (toolCall.status === 'success') {
    titleLine;
  } else if (toolCall.status === 'error') {
    titleLine;
  }

  lines.push(titleLine);

  if (toolCall.input) {
    const inputStr = JSON.stringify(toolCall.input, null, 2);
    const inputLines = wordWrap(inputStr, width - 4);
    lines.push(toolTheme.dim('  Input:'));
    for (const line of inputLines) {
      lines.push('    ' + toolTheme.toolOutput(line));
    }
  }

  if (toolCall.output) {
    const outputLines = toolCall.output.split('\n');
    const wrappedOutput: string[] = [];
    for (const line of outputLines) {
      wrappedOutput.push(...wordWrap(line, width - 4));
    }
    lines.push(toolTheme.dim('  Output:'));
    for (const line of wrappedOutput.slice(0, 20)) {
      lines.push('    ' + toolTheme.toolOutput(line));
    }
    if (wrappedOutput.length > 20) {
      lines.push('    ' + toolTheme.dim(`... and ${wrappedOutput.length - 20} more lines`));
    }
  }

  if (toolCall.errorMessage) {
    const errorLines = wordWrap(toolCall.errorMessage, width - 4);
    lines.push(toolTheme.error('  Error:'));
    for (const line of errorLines) {
      lines.push('    ' + toolTheme.error(line));
    }
  }

  if (toolCall.startTime && toolCall.endTime) {
    const duration = toolCall.endTime - toolCall.startTime;
    lines.push('  ' + toolTheme.dim(`Duration: ${formatDuration(duration)}`));
  }

  return lines;
}

function getStatusIcon(status: TUIToolCall['status']): string {
  switch (status) {
    case 'pending':
      return '◌';
    case 'running':
      return '◐';
    case 'success':
      return '✓';
    case 'error':
      return '✗';
    default:
      return '•';
  }
}

function getStatusLabel(status: TUIToolCall['status']): string {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'running':
      return 'running...';
    case 'success':
      return 'done';
    case 'error':
      return 'failed';
    default:
      return '';
  }
}

export class ToolExecution {
  private toolCall: TUIToolCall;
  private toolTheme: ToolTheme;

  constructor(toolCall: TUIToolCall, toolTheme: ToolTheme) {
    this.toolCall = toolCall;
    this.toolTheme = toolTheme;
  }

  setToolCall(toolCall: TUIToolCall): void {
    this.toolCall = toolCall;
  }

  render(width: number): string[] {
    return renderToolExecution(this.toolCall, this.toolTheme, width);
  }

  getToolName(): string {
    return this.toolCall.name;
  }

  getStatus(): TUIToolCall['status'] {
    return this.toolCall.status;
  }
}
