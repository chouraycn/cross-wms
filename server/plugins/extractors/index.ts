/**
 * Content Extractors Index — 内容提取器入口
 *
 * 导入并注册所有内置内容提取器。
 * 调用 initContentExtractors() 完成初始化。
 */

import "./readability-extractor.js";
import "./basic-extractor.js";

export function initContentExtractors(): void {
  // 提取器在各自的模块中通过 registerWebContentExtractor 自动注册
  // 此函数仅用于确保所有提取器模块被加载
}

export { default as readabilityExtractor } from "./readability-extractor.js";
export { default as basicExtractor } from "./basic-extractor.js";
