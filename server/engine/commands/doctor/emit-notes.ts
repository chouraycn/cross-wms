// Doctor note emission helpers that sanitize user-visible repair output.
// 移植自 openclaw/src/commands/doctor/emit-notes.ts
//
// 降级说明：
//  - sanitizeForLog 来自 ../../../packages/terminal-core/src/ansi.js
//    → cross-wms 在 /packages/terminal-core/src/ansi.ts 已有同源实现
//  - 路径调整为相对 server 包根的 ../../packages/terminal-core/src/ansi.js
import { sanitizeForLog } from "../../../../packages/terminal-core/src/ansi.js";

/** Strip terminal control sequences from a potentially multi-line doctor note. */
export function sanitizeDoctorNote(note: string): string {
  return note
    .split("\n")
    .map((line) => sanitizeForLog(line))
    .join("\n");
}

/** Emit grouped doctor change, info, and warning notes with sanitized content. */
export function emitDoctorNotes(params: {
  note: (message: string, title?: string) => void;
  changeNotes?: string[];
  infoNotes?: string[];
  warningNotes?: string[];
}): void {
  for (const change of params.changeNotes ?? []) {
    params.note(sanitizeDoctorNote(change), "Doctor changes");
  }
  for (const info of params.infoNotes ?? []) {
    params.note(sanitizeDoctorNote(info), "Doctor info");
  }
  for (const warning of params.warningNotes ?? []) {
    params.note(sanitizeDoctorNote(warning), "Doctor warnings");
  }
}
