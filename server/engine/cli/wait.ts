/** 进程生命周期的 wait 原语，供有意永不返回的 CLI 路径使用。 */
export function waitForever() {
  // 用一个 ref 的 interval 保持事件循环活跃。单独的 pending Promise 不是
  // 一个活跃的 handle，所以没有 interval 的话，一旦没有其他 handle 保持
  // 循环开启，Node 就会以退出码 13（"unsettled top-level await"）退出进程——
  // 这违背了 "wait forever" 契约。该 handle 故意不被持有：调用方没有可见的
  // 方式停止 "forever" 等待，interval 与进程生命周期一致。
  setInterval(() => {}, 1_000_000);
  return new Promise<void>(() => {
    /* never resolve */
  });
}
