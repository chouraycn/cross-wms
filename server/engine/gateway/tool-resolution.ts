import { logger } from '../../logger.js';
import { listTools, hasTool } from '../tools/index.js';

export type GatewayScopedToolSurface = 'http' | 'loopback';

export type GatewayToolInfo = {
  name: string;
  description?: string;
  source: 'builtin' | 'plugin';
  pluginId?: string;
  category?: string;
  dangerous?: boolean;
  scopes?: string[];
};

const DEFAULT_GATEWAY_HTTP_TOOL_DENY: string[] = [];

const GATEWAY_OWNER_ONLY_CORE_TOOLS: string[] = [];

export type ResolveGatewayToolsParams = {
  sessionKey?: string;
  sessionId?: string;
  senderIsOwner?: boolean;
  surface?: GatewayScopedToolSurface;
  excludeToolNames?: Iterable<string>;
  disablePluginTools?: boolean;
  gatewayRequestedTools?: string[];
};

export function resolveGatewayScopedTools(params: ResolveGatewayToolsParams = {}): {
  tools: GatewayToolInfo[];
  total: number;
  filtered: number;
} {
  const surface = params.surface ?? 'http';
  const excludeToolNames = params.excludeToolNames ? Array.from(params.excludeToolNames) : [];
  const gatewayRequestedTools = params.gatewayRequestedTools ?? [];

  const allTools = listTools();

  const defaultGatewayDeny =
    surface === 'http'
      ? DEFAULT_GATEWAY_HTTP_TOOL_DENY.filter((name) => !gatewayRequestedTools.includes(name))
      : [];

  const ownerOnlyGatewayDeny =
    params.senderIsOwner === false || (surface === 'http' && params.senderIsOwner !== true)
      ? [...GATEWAY_OWNER_ONLY_CORE_TOOLS]
      : [];

  const gatewayDenySet = new Set<string>([
    ...defaultGatewayDeny,
    ...ownerOnlyGatewayDeny,
    ...excludeToolNames,
  ]);

  const tools: GatewayToolInfo[] = [];
  let filtered = 0;

  for (const tool of allTools) {
    const toolName = typeof tool === 'object' && 'name' in tool ? (tool as { name: string }).name : String(tool);

    if (gatewayDenySet.has(toolName)) {
      filtered++;
      continue;
    }

    if (params.disablePluginTools && typeof tool === 'object' && 'pluginId' in tool) {
      filtered++;
      continue;
    }

    if (gatewayRequestedTools.length > 0 && !gatewayRequestedTools.includes(toolName)) {
      filtered++;
      continue;
    }

    tools.push({
      name: toolName,
      description: typeof tool === 'object' && 'description' in tool ? (tool as { description?: string }).description : undefined,
      source: typeof tool === 'object' && 'pluginId' in tool ? 'plugin' : 'builtin',
      pluginId: typeof tool === 'object' && 'pluginId' in tool ? (tool as { pluginId?: string }).pluginId : undefined,
      category: typeof tool === 'object' && 'category' in tool ? (tool as { category?: string }).category : undefined,
      dangerous: typeof tool === 'object' && 'dangerous' in tool ? (tool as { dangerous?: boolean }).dangerous : undefined,
    });
  }

  logger.debug(`[Gateway] Resolved ${tools.length} tools for ${surface} surface (${filtered} filtered)`);

  return {
    tools,
    total: allTools.length,
    filtered,
  };
}

export function isToolAllowedInGateway(
  toolName: string,
  params: ResolveGatewayToolsParams = {},
): boolean {
  const { tools } = resolveGatewayScopedTools(params);
  return tools.some((t) => t.name === toolName);
}

export function getGatewayToolNames(params: ResolveGatewayToolsParams = {}): string[] {
  const { tools } = resolveGatewayScopedTools(params);
  return tools.map((t) => t.name);
}

export function toolExistsInGateway(
  toolName: string,
  params: ResolveGatewayToolsParams = {},
): boolean {
  const { tools } = resolveGatewayScopedTools(params);
  return tools.some((t) => t.name === toolName) || hasTool(toolName);
}
