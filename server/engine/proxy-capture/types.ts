// 共享 debug-proxy 抓取 schema。这些 record 支撑 SQLite store、CLI 报告
// 与 HTTP/SSE/websocket 流量的运行时抓取事件
export type CaptureProtocol = "http" | "https" | "sse" | "ws" | "wss" | "connect";

export type CaptureDirection = "outbound" | "inbound" | "local";

export type CaptureEventKind =
  | "connect"
  | "tls-handshake"
  | "request"
  | "response"
  | "ws-open"
  | "ws-frame"
  | "ws-close"
  | "error"
  | "retry-link";

export type CaptureSessionRecord = {
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: string;
  sourceScope: "openclaw";
  sourceProcess: string;
  proxyUrl?: string;
  /** @deprecated 抓取存储现已位于共享状态数据库 */
  dbPath?: string;
  /** @deprecated 抓取负载现已位于共享状态数据库 */
  blobDir?: string;
};

export type CaptureBlobRecord = {
  blobId: string;
  path: string;
  encoding: "gzip";
  sizeBytes: number;
  sha256: string;
  contentType?: string;
};

export type SharedCaptureBlobRecord = Omit<CaptureBlobRecord, "path"> & {
  path?: never;
};

export type CaptureEventRecord = {
  sessionId: string;
  ts: number;
  sourceScope: "openclaw";
  sourceProcess: string;
  protocol: CaptureProtocol;
  direction: CaptureDirection;
  kind: CaptureEventKind;
  flowId: string;
  method?: string;
  host?: string;
  path?: string;
  status?: number;
  closeCode?: number;
  contentType?: string;
  headersJson?: string;
  dataText?: string;
  dataBlobId?: string;
  dataSha256?: string;
  errorText?: string;
  metaJson?: string;
};

export type CaptureQueryPreset =
  | "double-sends"
  | "retry-storms"
  | "cache-busting"
  | "ws-duplicate-frames"
  | "missing-ack"
  | "error-bursts";

export type CaptureQueryRow = Record<string, string | number | null>;

export type CaptureSessionSummary = {
  id: string;
  startedAt: number;
  endedAt?: number;
  mode: string;
  sourceProcess: string;
  proxyUrl?: string;
  eventCount: number;
};

export type CaptureObservedDimension = {
  value: string;
  count: number;
};

export type CaptureSessionCoverageSummary = {
  sessionId: string;
  totalEvents: number;
  unlabeledEventCount: number;
  providers: CaptureObservedDimension[];
  apis: CaptureObservedDimension[];
  models: CaptureObservedDimension[];
  hosts: CaptureObservedDimension[];
  localPeers: CaptureObservedDimension[];
};
