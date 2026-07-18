// 端口探测类型由 lsof/netstat 读取器和 CLI 状态格式化器共享。
/** 端口上一个监听器的进程元数据。 */
export type PortListener = {
  pid?: number;
  ppid?: number;
  command?: string;
  commandLine?: string;
  user?: string;
  address?: string;
};

export type PortConnectionDirection = "client" | "server" | "unknown";

/** 监听器加上推断的 client/server 方向。 */
export type PortConnection = PortListener & {
  direction: PortConnectionDirection;
};

export type PortUsageStatus = "free" | "busy" | "unknown";

/** 端口探测返回的端口使用摘要。 */
export type PortUsage = {
  port: number;
  status: PortUsageStatus;
  listeners: PortListener[];
  hints: string[];
  detail?: string;
  errors?: string[];
};

export type PortListenerKind = "gateway" | "ssh" | "non_gateway" | "unknown";

/** 单次端口探测的连接列表。 */
export type PortConnections = {
  port: number;
  connections: PortConnection[];
  detail?: string;
  errors?: string[];
};
