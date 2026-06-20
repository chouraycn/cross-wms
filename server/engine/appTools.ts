/**
 * App Tools — 应用级工具（如设置 AI 助手名称）
 */

/** app_setBotName — 修改 AI 助手显示名称 */
export async function handleAppSetBotName(args: Record<string, unknown>): Promise<string> {
  const name = String(args.name || '').trim();
  if (!name) return JSON.stringify({ success: false, error: '名称不能为空' });
  if (name.length > 20) return JSON.stringify({ success: false, error: '名称不能超过 20 个字符' });
  return JSON.stringify({ success: true, action: 'set_bot_name', name });
}
