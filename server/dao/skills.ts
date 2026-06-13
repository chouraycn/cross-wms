import { initDb } from '../db.js';
import type { UserSkillRow, BuiltinStatusPatchRow } from '../db.js';

// ===================== User Skills DAO =====================

/** Parse a UserSkillRow into a frontend-friendly shape */
export function skillRowToClient(row: UserSkillRow): Record<string, unknown> {
  let tags: string[] = [];
  try {
    if (row.tags) tags = JSON.parse(row.tags);
  } catch { /* ignore corrupt JSON */ }
  return {
    id: row.id,
    name: row.name,
    desc: row.desc,
    icon: row.icon,
    category: row.category,
    path: row.path,
    trigger: row.trigger || undefined,
    detail: row.detail || undefined,
    tags,
    status: row.status,
    version: row.version || undefined,
    featured: row.featured === 1,
    shortcut: row.shortcut || undefined,
    source: 'user' as const,
    installedAt: row.installedAt,
    promptTemplate: row.promptTemplate || undefined,
    executionMode: row.executionMode || undefined,
  };
}

/** Convert frontend Skill data to DB-compatible fields */
export function clientToSkillRow(data: Record<string, unknown>): Omit<UserSkillRow, 'id'> {
  return {
    name: (data.name ?? '') as string,
    desc: (data.desc ?? '') as string,
    icon: (data.icon ?? 'Extension') as string,
    category: (data.category ?? 'tool') as string,
    path: (data.path ?? '') as string,
    trigger: (data.trigger as string) || null,
    detail: (data.detail as string) || null,
    tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : (data.tags as string) || null,
    status: (data.status ?? 'active') as string,
    version: (data.version as string) || null,
    featured: data.featured === true ? 1 : 0,
    shortcut: (data.shortcut as string) || null,
    installedAt: (data.installedAt as number) ?? Date.now(),
    promptTemplate: (data.promptTemplate as string) || null,
    executionMode: (data.executionMode as string) || null,
  };
}

export function getUserSkills(): Record<string, unknown>[] {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM user_skills ORDER BY installedAt DESC').all() as UserSkillRow[];
  return rows.map(skillRowToClient);
}

export function getUserSkillById(id: string): Record<string, unknown> | undefined {
  const db = initDb();
  const row = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return row ? skillRowToClient(row) : undefined;
}

export function createUserSkill(data: Record<string, unknown>): Record<string, unknown> {
  const id = (data.id as string) || `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const db = initDb();
  const row = clientToSkillRow(data);
  db.prepare(`INSERT INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt, promptTemplate, executionMode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt, row.promptTemplate, row.executionMode
  );
  // Read back from DB to ensure correct type conversion (e.g. tags: JSON string → array)
  const saved = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return skillRowToClient(saved!);
}

export function updateUserSkill(id: string, data: Record<string, unknown>): Record<string, unknown> | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  if (!existing) return null;
  const row = clientToSkillRow({ ...skillRowToClient(existing), ...data });
  db.prepare(`UPDATE user_skills SET name=?, "desc"=?, icon=?, category=?, path=?, trigger=?, detail=?, tags=?, status=?, version=?, featured=?, shortcut=?, installedAt=?, promptTemplate=?, executionMode=? WHERE id=?`).run(
    row.name, row.desc, row.icon, row.category, row.path, row.trigger, row.detail, row.tags, row.status, row.version, row.featured, row.shortcut, row.installedAt, row.promptTemplate, row.executionMode, id
  );
  // Read back from DB to ensure correct type conversion
  const saved = db.prepare('SELECT * FROM user_skills WHERE id = ?').get(id) as UserSkillRow | undefined;
  return saved ? skillRowToClient(saved) : null;
}

export function deleteUserSkill(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM user_skills WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== Builtin Status Patches DAO =====================

export function getBuiltinPatches(): Record<string, string> {
  const db = initDb();
  const rows = db.prepare('SELECT * FROM builtin_status_patches').all() as BuiltinStatusPatchRow[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.skillId] = row.status;
  }
  return result;
}

export function setBuiltinPatch(skillId: string, status: string): void {
  const db = initDb();
  db.prepare('INSERT OR REPLACE INTO builtin_status_patches (skillId, status) VALUES (?,?)').run(skillId, status);
}

export function removeBuiltinPatch(skillId: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM builtin_status_patches WHERE skillId = ?').run(skillId);
  return result.changes > 0;
}
