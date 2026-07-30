// 会话绑定运行时：通道仅需当前对话绑定状态的窄接口。
// openclaw 原始实现为 barrel 重导出，依赖
// ../infra/outbound/session-binding-service.js。此处提供最小可用类型与桩函数。

/** 会话绑定记录。 */
export type SessionBindingRecord = {
  /** 绑定的会话键。 */
  sessionKey: string;
  /** 绑定的 agent ID。 */
  agentId?: string;
  /** 绑定的渠道 ID。 */
  channelId?: string;
  /** 绑定的发送者 ID。 */
  senderId?: string;
  /** 最近更新时间戳。 */
  updatedAt?: number;
};

/** 会话绑定服务。 */
export type SessionBindingService = {
  /** 读取当前绑定记录。 */
  getBinding(channelId: string, senderId: string): Promise<SessionBindingRecord | undefined>;
  /** 设置当前绑定记录。 */
  setBinding(record: SessionBindingRecord): Promise<void>;
  /** 清除绑定记录。 */
  clearBinding(channelId: string, senderId: string): Promise<void>;
};

/** 会话绑定适配器。 */
export type SessionBindingAdapter = {
  name: string;
  getBinding(channelId: string, senderId: string): Promise<SessionBindingRecord | undefined>;
  setBinding(record: SessionBindingRecord): Promise<void>;
  clearBinding(channelId: string, senderId: string): Promise<void>;
};

/** 会话绑定测试辅助。 */
export type SessionBindingTesting = {
  reset(): void;
};

/** 测试辅助桩。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export const testing: SessionBindingTesting = {
  reset() {
    // 待 infra/outbound/session-binding-service.js 移植后接入
  },
};

/** @deprecated 使用 testing。历史别名。 */
export const __testing = testing;

/** 获取会话绑定服务实例。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function getSessionBindingService(): SessionBindingService {
  const noopService: SessionBindingService = {
    async getBinding() {
      return undefined;
    },
    async setBinding() {
      // 待依赖模块移植后接入
    },
    async clearBinding() {
      // 待依赖模块移植后接入
    },
  };
  return noopService;
}

/** 注册会话绑定适配器。 */
// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export function registerSessionBindingAdapter(_adapter: SessionBindingAdapter): void {
  // 待 infra/outbound/session-binding-service.js 移植后接入
}
