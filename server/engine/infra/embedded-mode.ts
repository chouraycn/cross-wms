// 存储进程本地的嵌入模式标志
let embeddedModeValue = false;

/** 设置进程本地的嵌入模式标志，供 UI 和托管运行时使用。 */
export function setEmbeddedMode(value: boolean): void {
  embeddedModeValue = value;
}

/** 返回当前进程是否运行在嵌入式 OpenClaw 宿主内。 */
export function isEmbeddedMode(): boolean {
  return embeddedModeValue;
}
