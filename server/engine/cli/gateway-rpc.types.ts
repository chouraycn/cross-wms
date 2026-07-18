/** gateway CLI 命令共享的 RPC 选项形状。 */

/** 直接 gateway 命令辅助函数接受的通用 gateway RPC flag。 */
export type GatewayRpcOpts = {
  url?: string;
  token?: string;
  timeout?: string;
  expectFinal?: boolean;
  json?: boolean;
};
