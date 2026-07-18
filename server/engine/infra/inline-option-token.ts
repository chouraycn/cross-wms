/**
 * 内联选项 token 解析 — 保留原始 token 中是否含 `=`
 * 参考 openclaw/src/infra/inline-option-token.ts
 */

/** 已解析的命令行选项 token，保留 `=` 是否出现于原始 token */
export type InlineOptionToken =
  | {
      name: string;
      hasInlineValue: false;
    }
  | {
      name: string;
      hasInlineValue: true;
      inlineValue: string;
    };

/** 将一个 CLI 风格的选项 token 分割为 flag 名与可选内联值 */
export function parseInlineOptionToken(token: string): InlineOptionToken {
  const separatorIndex = token.indexOf("=");
  if (separatorIndex < 0) {
    return { name: token, hasInlineValue: false };
  }
  // 仅第一个分隔符是结构性的；后续的 `=` 字节属于值
  // （如 token、查询字符串或文件名，通过 root/daemon 命令选项传递）
  return {
    name: token.slice(0, separatorIndex),
    hasInlineValue: true,
    inlineValue: token.slice(separatorIndex + 1),
  };
}
