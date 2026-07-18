export { TransportConfigSchema } from './types.js';
export type { TransportConfig, TransportRequest, TransportResponse, TransportMessage, TransportEvent } from './types.js';

export { TransportLayer, BaseTransportLayer } from './transport-layer.js';

export { HttpTransport } from './http-transport.js';

export { LocalTransport, registerLocalService, unregisterLocalService, type LocalService } from './local-transport.js';

export { WebSocketTransport } from './websocket-transport.js';

export {
  registerTransport,
  unregisterTransport,
  getTransport,
  listTransports,
  transportExists,
  updateTransport,
  getTransportsByType,
  clearTransports,
} from './transport-registry.js';

export {
  createTransport,
  createAndRegisterTransport,
  createHttpTransport,
  createLocalTransport,
  createWebSocketTransport,
} from './transport-factory.js';