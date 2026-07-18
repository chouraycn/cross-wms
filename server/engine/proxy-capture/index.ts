// proxy-capture 子系统入口（仅类型；运行时存储与 server 依赖未移植）
export type {
  CaptureProtocol,
  CaptureDirection,
  CaptureEventKind,
  CaptureSessionRecord,
  CaptureBlobRecord,
  SharedCaptureBlobRecord,
  CaptureEventRecord,
  CaptureQueryPreset,
  CaptureQueryRow,
  CaptureSessionSummary,
  CaptureObservedDimension,
  CaptureSessionCoverageSummary,
} from "./types.js";
