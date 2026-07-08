export { default as gatewayRouter } from './gateway.js';
export { detectProvider, normalizeModelId, type GatewayConfig, type OpenAIChatMessage, type OpenAIChatCompletionRequest, type OpenAIChatCompletionChoice, type OpenAIModel } from './gateway.js';
export { authenticateRequest, type GatewayAuthResult } from './gatewayAuth.js';
export { registerGatewayRoutes } from './gatewayRoutes.js';
