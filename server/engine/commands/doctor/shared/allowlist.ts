// Shared doctor allowlist predicates for normalized sender lists.
// 移植自 openclaw/src/commands/doctor/shared/allowlist.ts
//
// 降级说明：
//  - normalizeStringEntries 来自 @openclaw/normalization-core/string-normalization
//    → cross-wms 已在 ../../infra/string-normalization.ts 实现同源函数
import { normalizeStringEntries } from "../../../infra/string-normalization.js";
import type { DoctorAllowFromList } from "../types.js";

/** Return true when an allowFrom-like list has at least one normalized sender entry. */
export function hasAllowFromEntries(list?: DoctorAllowFromList) {
  return Array.isArray(list) && normalizeStringEntries(list).length > 0;
}
