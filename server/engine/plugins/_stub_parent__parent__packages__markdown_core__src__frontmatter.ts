// 原本是 openclaw stub，现已替换为 cross-wms 同源包导入
// 注意：tsx 运行时解析 workspace 包 (@cdf-know/*) 的 dist/ 时存在 ESM/CommonJS 兼容问题，
// 直接用相对路径导入 src/ 源文件，绕过 workspace 包解析。
export { parseFrontmatterBlock } from '../../../packages/markdown-core/src/frontmatter.js';
