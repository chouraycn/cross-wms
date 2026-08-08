import type { MockTool } from './skill-test-runner.js';

export interface ToolCallRecord {
  args: any[];
  timestamp: number;
}

export function createMockTool(name: string, handler: (...args: any[]) => Promise<any>): MockTool {
  return {
    name,
    handler,
    calls: [],
  };
}

export function createMockCliTool(name: string, output: string, exitCode: number = 0): MockTool {
  return {
    name,
    handler: async () => ({ output, exitCode }),
    calls: [],
  };
}

export function createMockApiTool(name: string, response: any, statusCode: number = 200): MockTool {
  return {
    name,
    handler: async () => ({ response, statusCode }),
    calls: [],
  };
}

export function createMockFileTool(name: string, content: string): MockTool {
  return {
    name,
    handler: async () => ({ content }),
    calls: [],
  };
}

export function captureToolCalls(mockTool: MockTool): ToolCallRecord[] {
  return [...mockTool.calls];
}

export function instrumentMockTool(mockTool: MockTool): MockTool {
  const originalHandler = mockTool.handler;
  return {
    ...mockTool,
    handler: async (...args: any[]) => {
      mockTool.calls.push({ args, timestamp: Date.now() });
      return originalHandler(...args);
    },
  };
}
