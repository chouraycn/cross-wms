// Shared record helpers for legacy config migration modules.
// 移植自 openclaw/src/commands/doctor/shared/legacy-config-record-shared.ts
//
// 降级说明：
//  - isRecord 来自 ../../../utils.js，cross-wms 已在 ../../infra/record-coerce.ts 实现同源函数
type JsonRecord = Record<string, unknown>;

import { isRecord } from "../../../infra/record-coerce.js";

export type { JsonRecord };
export { isRecord };

/** Clone a record-like config section, treating undefined as an empty object. */
export function cloneRecord<T extends JsonRecord>(value: T | undefined): T {
  return { ...value } as T;
}

/** Ensure a nested config value is a mutable record and return it. */
export function ensureRecord(target: JsonRecord, key: string): JsonRecord {
  const current = target[key];
  if (isRecord(current)) {
    return current;
  }
  const next: JsonRecord = {};
  target[key] = next;
  return next;
}

/** Own-property guard used by migrations that must preserve falsy values. */
export function hasOwnKey(target: JsonRecord, key: string): boolean {
  return Object.hasOwn(target, key);
}
