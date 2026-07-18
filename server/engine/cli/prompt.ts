// 小型交互式 prompt 辅助函数，用于 CLI 确认。
// 移植自 openclaw/src/cli/prompt.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-coerce`，已替换为本地
//    `../infra/string-coerce.js`（cross-wms 已有 `normalizeLowercaseStringOrEmpty`）。
//  - 原模块依赖 `../globals.js` 中的 `isVerbose`/`isYes`，cross-wms 中未移植该模块；
//    这里内联一个进程级全局状态 stub，提供等价的 verbose/yes 标志读取能力。
//    未来 cross-wms 移植 globals 模块后可替换为正式实现。
//  - 原模块依赖 `../infra/errors.js` 中的 `toErrorObject`，cross-wms 已存在同名函数。
//  - 此处直接迁移实现，仅调整 import 路径并内联 globals stub。

import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";
import { toErrorObject } from "../infra/errors.js";

// ===== 内联 globals stub（替代未移植的 ../globals.js）=====
// 进程级 verbose/yes 标志，用于 CLI 全局共享状态。
// 调用方可通过 setVerboseFlag/setYesFlag 在启动时设置。
let globalVerboseFlag = false;
let globalYesFlag = false;

export function setVerboseFlag(value: boolean): void {
  globalVerboseFlag = value;
}

export function setYesFlag(value: boolean): void {
  globalYesFlag = value;
}

export function isVerbose(): boolean {
  return globalVerboseFlag;
}

export function isYes(): boolean {
  return globalYesFlag;
}
// ===== globals stub 结束 =====

/** 表示交互式 prompt 在完整答案到达之前失去了 stdin。 */
export class PromptInputClosedError extends Error {
  constructor() {
    super("Prompt input closed before an answer was received.");
    this.name = "PromptInputClosedError";
  }
}

type ReadlineInterface = ReturnType<typeof readline.createInterface>;

function questionUntilClose(rl: ReadlineInterface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      rl.off("close", onClose);
      complete();
    };
    const onClose = () => finish(() => reject(new PromptInputClosedError()));

    // readline.question 在 interface 关闭时不会 reject，因此与 close 事件进行竞争。
    rl.once("close", onClose);
    void rl.question(question).then(
      (answer) => finish(() => resolve(answer)),
      (error: unknown) => finish(() => reject(toErrorObject(error, "Non-Error rejection"))),
    );
  });
}

/** 提示 yes/no 输入，在打开 stdin 之前尊重全局 `--yes`。 */
export async function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  if (isVerbose() && isYes()) {
    return true;
  }
  if (isYes()) {
    return true;
  }
  const rl = readline.createInterface({ input, output });
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const answer = normalizeLowercaseStringOrEmpty(
    await questionUntilClose(rl, `${question}${suffix}`).finally(() => {
      rl.close();
    }),
  );
  if (!answer) {
    return defaultYes;
  }
  return answer.startsWith("y");
}
