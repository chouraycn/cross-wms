# Realtime Transcription 移植决策

## 决策：有意排除（暂不移植）

## 理由

1. **功能定位**：realtime-transcription/ 是 openclaw 独立于 talk/ 的实时转录 Provider 实现层
   - `provider-registry.ts`：Provider 注册表
   - `provider-types.ts`：Provider 类型定义
   - `websocket-session.ts`：通用 WebSocket 转录会话（14K 行）

2. **cross-wms 已有等价实现**：
   - `server/engine/talk/`（28 文件 + 17 测试）已包含完整 talk/实时语音对话模块
   - `server/engine/talk/provider-registry.ts` 与 openclaw provider-registry 功能重叠
   - `server/engine/talk/provider-types.ts` 与 openclaw provider-types 功能重叠
   - `server/engine/gateway/talk-realtime-relay.ts` 替代 websocket-session 的网关中继角色

3. **依赖关系**：cross-wms 的 talk 模块不引用 openclaw/src/realtime-transcription/ 任何文件
   - 验证：`grep "websocket-session\|RealtimeWebSocket\|WebSocketSession" server/engine/talk/` → 无匹配

4. **架构差异**：
   - openclaw 设计：分离 talk/（用户对话）与 realtime-transcription/（Provider API 适配）
   - cross-wms 设计：合并到 talk/（session-runtime、provider-resolver、session-controller 等）

## 影响

- 跨产品 Provider 集成（如 AssemblyAI、Deepgram Realtime API）需要单独适配
- 不影响核心 talk/实时语音对话功能

## 后续

如需支持特定 Realtime Provider（如 OpenAI Realtime API、Azure Speech Realtime），可：
- 在 `server/engine/talk/` 下新增 `realtime-providers/` 子目录
- 复用 `session-runtime.ts` 的会话管理逻辑
- 参考 openclaw/src/realtime-transcription/websocket-session.ts 的协议处理
