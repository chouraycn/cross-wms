// Re-export from canonical implementation at server/engine/infra/parse-json-compat.ts
// 收敛重复实现（原文件有独立实现，与 infra/parse-json-compat.ts 行为一致）
// 参考 openclaw/src/utils/parse-json-compat.ts
export { parseJsonWithJson5Fallback } from "../infra/parse-json-compat.js";
