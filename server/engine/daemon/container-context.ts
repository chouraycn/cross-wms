/**
 * 检测守护进程是否由容器感知的服务包装器启动。
 */

export function resolveDaemonContainerContext(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const containerHint = env.CROSS_WMS_CONTAINER_HINT?.trim();
  const container = env.CROSS_WMS_CONTAINER?.trim();
  return containerHint || container || null;
}
