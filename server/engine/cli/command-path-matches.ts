// 共享的命令路径匹配工具，用于 CLI 启动和注册策略。

/**
 * 匹配命令路径前缀；当 `exact` 为真时要求完整路径匹配。
 */
export function matchesCommandPath(
  commandPath: string[],
  pattern: readonly string[],
  params?: { exact?: boolean },
): boolean {
  if (pattern.some((segment, index) => commandPath[index] !== segment)) {
    return false;
  }
  return !params?.exact || commandPath.length === pattern.length;
}
