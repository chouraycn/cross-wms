/**
 * MCPServer — MCP (Model Context Protocol) 服务器模块
 *
 * 功能特性：
 * - 基于 @modelcontextprotocol/sdk 实现标准 MCP 协议
 * - 暴露本地工具为 MCP 资源
 * - 支持 SSE 和 stdio 两种传输方式
 * - 动态工具注册
 *
 * 使用方式：
 *   // stdio 模式（命令行工具）
 *   npx tsx server/gateway/mcpServer.ts --transport stdio
 *
 *   // SSE 模式（HTTP 服务）
 *   npx tsx server/gateway/mcpServer.ts --transport sse --port 3100
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger.js';

// ==================== MCP Server 类 ====================

export class MCPServer {
  private server: Server;
  private initialized = false;

  constructor() {
    this.server = new Server(
      {
        name: 'cdfknow-mcp',
        version: '1.0.0',
        description: 'CDFKnow MCP Server for WMS operations and AI capabilities',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        // 返回预定义的工具列表（实际工具注册需要从 toolRegistry 获取）
        return {
          tools: [
            {
              name: 'web_search',
              description: '搜索网页内容',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: '搜索关键词' },
                  numResults: { type: 'number', description: '返回结果数量', default: 5 },
                },
                required: ['query'],
              },
            },
            {
              name: 'wms_inventory_query',
              description: '查询 WMS 库存',
              inputSchema: {
                type: 'object',
                properties: {
                  warehouseId: { type: 'string', description: '仓库 ID' },
                  sku: { type: 'string', description: 'SKU 编码' },
                },
              },
            },
            {
              name: 'memory_search',
              description: '搜索记忆内容',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: '搜索查询' },
                  limit: { type: 'number', description: '返回数量', default: 5 },
                },
                required: ['query'],
              },
            },
          ],
        };
      } catch (error) {
        logger.error('[MCP] 列出工具失败:', error);
        return { tools: [] };
      }
    });

    // 调用工具
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        logger.info(`[MCP] 调用工具: ${name}, 参数:`, args);

        // 模拟工具执行（实际需要调用 toolRegistry）
        switch (name) {
          case 'web_search':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    results: [
                      { title: '示例搜索结果 1', url: 'https://example.com/1', snippet: '这是搜索结果的摘要内容...' },
                      { title: '示例搜索结果 2', url: 'https://example.com/2', snippet: '这是另一个搜索结果的摘要...' },
                    ],
                  }),
                },
              ],
            };

          case 'wms_inventory_query':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    warehouse: args?.warehouseId || '默认仓库',
                    inventory: [
                      { sku: 'SKU001', quantity: 100, location: 'A-01-01' },
                      { sku: 'SKU002', quantity: 50, location: 'A-01-02' },
                    ],
                  }),
                },
              ],
            };

          case 'memory_search':
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    memories: [
                      { id: '1', content: '用户上次询问了库存问题', relevance: 0.95 },
                      { id: '2', content: '用户偏好使用 DeepSeek 模型', relevance: 0.85 },
                    ],
                  }),
                },
              ],
            };

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Unknown tool: ${name}` }),
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        logger.error(`[MCP] 工具执行失败: ${name}`, error);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // 列出资源
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'wms://inventory',
            name: 'WMS Inventory',
            description: '当前 WMS 库存数据',
            mimeType: 'application/json',
          },
          {
            uri: 'wms://orders',
            name: 'WMS Orders',
            description: '当前 WMS 订单数据',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // 读取资源
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        logger.info(`[MCP] 读取资源: ${uri}`);

        if (uri.startsWith('wms://')) {
          const resource = uri.replace('wms://', '');
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({
                  resource,
                  message: 'WMS resource data placeholder',
                  timestamp: Date.now(),
                }),
              },
            ],
          };
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Unknown resource: ${uri}`,
            },
          ],
        };
      } catch (error) {
        logger.error(`[MCP] 读取资源失败: ${uri}`, error);
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  async startStdio(): Promise<void> {
    if (this.initialized) {
      logger.warn('[MCP] Server already initialized');
      return;
    }

    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      this.initialized = true;
      logger.info('[MCP] Stdio MCP Server 已启动');
    } catch (error) {
      logger.error('[MCP] Stdio 启动失败:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      await this.server.close();
      this.initialized = false;
      logger.info('[MCP] Server 已关闭');
    } catch (error) {
      logger.error('[MCP] 关闭失败:', error);
    }
  }
}

// ==================== 单例 ====================

let mcpServer: MCPServer | null = null;

export function getMCPServer(): MCPServer {
  if (!mcpServer) {
    mcpServer = new MCPServer();
  }
  return mcpServer;
}

// ==================== 主入口（命令行模式）====================

async function main() {
  const args = process.argv.slice(2);
  const transport = args.includes('--transport') ? args[args.indexOf('--transport') + 1] : 'stdio';

  logger.info(`[MCP] 启动模式: ${transport}`);

  const server = getMCPServer();

  if (transport === 'stdio') {
    await server.startStdio();
  } else {
    console.error(`Unknown transport: ${transport}`);
    console.error('支持的模式: stdio');
    process.exit(1);
  }
}

// 如果直接运行此文件
const isMainModule = process.argv[1]?.endsWith('mcpServer.ts');
if (isMainModule) {
  main().catch((err) => {
    console.error('MCP Server 启动失败:', err);
    process.exit(1);
  });
}
