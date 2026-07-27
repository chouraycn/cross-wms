// MCP Demo Server — 供数字员工 MCP 发现/同步 e2e 使用。
// 通过 stdio 传输暴露两个工具（echo / add），不依赖网络，确定性强。
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server(
  { name: 'cross-wms-e2e-demo', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'echo',
      description: '回显一条消息',
      inputSchema: {
        type: 'object',
        properties: { msg: { type: 'string' } },
        required: ['msg'],
      },
    },
    {
      name: 'add',
      description: '将两个数字相加',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'echo') {
    return { content: [{ type: 'text', text: String(args?.msg ?? '') }] };
  }
  if (name === 'add') {
    const a = Number(args?.a ?? 0);
    const b = Number(args?.b ?? 0);
    return { content: [{ type: 'text', text: String(a + b) }] };
  }
  return { content: [{ type: 'text', text: 'unknown tool' }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
