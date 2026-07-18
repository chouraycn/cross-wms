export type {
  TransportId,
  TransportType,
  TransportStatus,
  TransportConfig,
  TransportMessage,
  TransportResponse,
  TransportEvent,
  ChannelTransport,
  TransportStats,
  TransportFactory,
} from "./types.js";

export {
  TransportConfigSchema,
  TransportMessageSchema,
  TransportResponseSchema,
} from "./types.js";

export { HttpTransport } from "./http-transport.js";
export { WebSocketTransport } from "./websocket-transport.js";
export { SocketIoTransport } from "./socketio-transport.js";
export { GrpcTransport } from "./grpc-transport.js";

export {
  registerTransport,
  unregisterTransport,
  getTransport,
  getTransportOrThrow,
  hasTransport,
  listTransports,
  getTransportStatus,
  updateTransportStatus,
  clearTransportRegistry,
  getTransportCount,
  getActiveTransports,
} from "./transport-registry.js";

export {
  registerTransportFactory,
  createTransport,
  getTransportFactory,
  hasTransportFactory,
  listTransportFactories,
  createHttpTransport,
  createWebSocketTransport,
  createSocketIoTransport,
  createGrpcTransport,
  type TransportFactory as TransportFactoryType,
} from "./transport-factory.js";