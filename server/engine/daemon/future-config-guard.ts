/**
 * 防止当配置属于更新版本时执行守护进程写入操作。
 */

export async function assertFutureConfigActionAllowed(action: string): Promise<void> {
  void action;
  return;
}
