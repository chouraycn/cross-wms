// @ts-nocheck
/**
 * Desktop 模块统一导出
 *
 * 桌面自动化工具集，支持：
 * - 应用管理（启动/退出/聚焦）
 * - 剪贴板操作（读/写）
 * - 输入模拟（点击/打字/按键/滚动）
 * - 视觉能力（截图/元素识别/智能点击）
 *
 * 子模块：
 * - appTools       应用管理工具
 * - clipboardTools 剪贴板工具
 * - inputTools     输入模拟工具
 * - visionTools    视觉工具
 * - helpers        辅助函数与共享状态
 */

export {
  handleDesktopAppLaunch,
  handleDesktopAppQuit,
  handleDesktopWindowFocus,
} from './appTools.js';

export {
  handleDesktopClipboard,
} from './clipboardTools.js';

export {
  handleDesktopClick,
  handleDesktopType,
  handleDesktopKeypress,
  handleDesktopScroll,
} from './inputTools.js';

export {
  handleDesktopScreenshot,
  handleDesktopSee,
  handleDesktopSnapshot,
  handleDesktopFind,
  handleDesktopClickSmart,
} from './visionTools.js';

export {
  escapeForAppleScript,
  runAppleScript,
  linuxScreenshot,
  linuxToolAvailable,
  handleDesktopHealth,
  setDesktopSnapshotCache,
  BROWSER_APPS,
  isMac,
  isLinux,
  PLATFORM,
} from './helpers.js';

export type {
  DesktopElement,
} from './helpers.js';

import {
  handleDesktopAppLaunch,
  handleDesktopAppQuit,
  handleDesktopWindowFocus,
} from './appTools.js';
import { handleDesktopClipboard } from './clipboardTools.js';
import {
  handleDesktopClick,
  handleDesktopType,
  handleDesktopKeypress,
  handleDesktopScroll,
} from './inputTools.js';
import {
  handleDesktopScreenshot,
  handleDesktopSee,
  handleDesktopSnapshot,
  handleDesktopFind,
  handleDesktopClickSmart,
} from './visionTools.js';
import { handleDesktopHealth } from './helpers.js';

/**
 * Desktop 模块聚合对象
 */
export const desktop = {
  app: {
    launch: handleDesktopAppLaunch,
    quit: handleDesktopAppQuit,
    focus: handleDesktopWindowFocus,
  },
  clipboard: handleDesktopClipboard,
  input: {
    click: handleDesktopClick,
    type: handleDesktopType,
    keypress: handleDesktopKeypress,
    scroll: handleDesktopScroll,
  },
  vision: {
    screenshot: handleDesktopScreenshot,
    see: handleDesktopSee,
    snapshot: handleDesktopSnapshot,
    find: handleDesktopFind,
    clickSmart: handleDesktopClickSmart,
  },
  health: handleDesktopHealth,
};

export default desktop;
