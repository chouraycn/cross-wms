// 从文本中剥除轻量 markdown 格式，保留可读的纯文本结构，便于 TTS 与通道回退
export function stripMarkdown(text: string): string {
  let result = text;

  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");

  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1");
  result = result.replace(/(?<![\p{L}\p{N}])_(?!_)(.+?)(?<!_)_(?![\p{L}\p{N}])/gu, "$1");

  result = result.replace(/~~(.+?)~~/g, "$1");
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "$1");
  result = result.replace(/^>\s?(.*)$/gm, "$1");
  result = result.replace(/^[-*_]{3,}$/gm, "");
  result = result.replace(/`([^`]+)`/g, "$1");
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}
