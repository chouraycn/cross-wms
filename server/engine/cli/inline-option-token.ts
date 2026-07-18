// 本地 stub：替代未移植的 `../infra/inline-option-token.js`。
// 原模块为纯类型与函数，无外部依赖，这里完整复制实现以支持 cli 模块移植。

/** 解析后的命令行选项 token，保留原始 token 中是否出现 `=`。 */
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

/** 将一个 CLI 风格的选项 token 拆分为标志名和可选的内联值。 */
export function parseInlineOptionToken(token: string): InlineOptionToken {
  const separatorIndex = token.indexOf("=");
  if (separatorIndex < 0) {
    return { name: token, hasInlineValue: false };
  }
  // 仅第一个分隔符是结构性的；后续的 `=` 字节属于值的一部分，例如
  // token、查询字符串或通过根/守护进程命令选项传递的文件名。
  return {
    name: token.slice(0, separatorIndex),
    hasInlineValue: true,
    inlineValue: token.slice(separatorIndex + 1),
  };
}
