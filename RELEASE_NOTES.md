# CDF Know Clow v1.5.112

## 新功能

### MCP Client 集成
- 支持 Model Context Protocol (MCP) 外部工具协议
- MCP Server 管理：添加/删除/连接/断开 MCP Server
- MCP 工具自动注册：已连接的 MCP Server 工具自动合并到 AI 引擎工具列表
- MCP 工具命名规范：`mcp__{serverName}__{toolName}`
- MCP Server 级熔断保护：单个 Server 故障不影响其他工具
- MCP 工具权限集成：`mcp__*` 默认 confirm 级别，支持 per-server 覆盖
- SQLite 持久化：MCP Server 配置存储在 `~/.cdf-know-clow/mcp/mcp_servers.db`
- 前端 MCP 设置面板：AI 设置对话框中新增 MCP tab

### Tool Loop 授权样式重构
- 浅灰中性背景 + 大圆角设计
- 左侧 3px 彩色强调线（橙色=需确认，红色=高风险）
- 轻量化文字按钮替代传统 MUI Button
- 工具名以圆角 badge 展示
- 已审批状态用彩色圆点替代符号

## 技术改进
- 新增 `@modelcontextprotocol/sdk` 依赖
- 新增后端模块：`mcpTypes.ts`, `mcpConfigStore.ts`, `mcpClientManager.ts`, `routes/mcp.ts`
- 新增前端组件：MCPSettingsTab（7个组件文件）
- `server/index.ts` 注册 MCP 路由 + 启动连接 + 优雅关闭
- `reactExecutor.ts` MCP 工具合并 + 执行路由 + 熔断检查
- `toolPermissionSandbox.ts` MCP 权限规则
- `circuitBreaker.ts` MCP Server 级熔断方法
