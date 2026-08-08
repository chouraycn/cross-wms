/** Ambient subpath type shim for MCP SDK streamable HTTP server transport. */
declare module "@modelcontextprotocol/sdk/server/streamableHttp.js" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  /** Options accepted by the streamable HTTP transport constructor. */
  export type StreamableHTTPServerTransportOptions = {
    sessionIdGenerator?: (() => string) | undefined;
  };

  /** Server transport subset consumed by OpenClaw's MCP HTTP surfaces. */
  export class StreamableHTTPServerTransport {
    constructor(options?: StreamableHTTPServerTransportOptions);
    get sessionId(): string | undefined;
    start(): Promise<void>;
    close(): Promise<void>;
    send(message: any, options?: { relatedRequestId?: string | number }): Promise<void>;
    handleRequest(
      req: IncomingMessage & { auth?: any },
      res: ServerResponse,
      parsedBody?: any,
    ): Promise<void>;
  }
}
