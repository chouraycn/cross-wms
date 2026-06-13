import { v4 as uuidv4 } from 'uuid';
import { initDb } from '../db.js';
import type { AppSettingsRow, WarehouseRow, InventoryItemRow, TransitOrderRow, InboundRecordRow, OutboundRecordRow, UserSkillRow, BuiltinStatusPatchRow } from '../db.js';

export interface MigrateResult {
  warehouses: number;
  inventoryItems: number;
  transitOrders: number;
  userSkills: number;
  builtinStatusPatches: number;
  appSettings: number;
}

// ===================== App Settings DAO =====================

export function getAppSettings(key: string): string | null {
  const db = initDb();
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setAppSettings(key: string, value: string): void {
  const db = initDb();
  db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run(key, value);
}

// ===================== Migration DAO =====================

export function migrateData(payload: {
  warehouses?: WarehouseRow[];
  inventoryItems?: Record<string, unknown>[];
  transitOrders?: Record<string, unknown>[];
  userSkills?: Record<string, unknown>[];
  builtinStatusPatches?: Record<string, string>;
  appSettings?: Record<string, unknown>;
}): MigrateResult {
  const db = initDb();
  const result: MigrateResult = { warehouses: 0, inventoryItems: 0, transitOrders: 0, userSkills: 0, builtinStatusPatches: 0, appSettings: 0 };

  const transaction = db.transaction(() => {
    // Warehouses
    if (Array.isArray(payload.warehouses) && payload.warehouses.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO warehouses (id, name, country, city, totalVolume, usedVolume, totalItems, usedItems, status, address, manager, phone, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const w of payload.warehouses!) {
        stmt.run(w.id, w.name, w.country ?? '', w.city ?? '', w.totalVolume ?? 0, w.usedVolume ?? 0, w.totalItems ?? 0, w.usedItems ?? 0, w.status ?? 'normal', w.address ?? '', w.manager ?? '', w.phone ?? '', w.createdAt ?? new Date().toISOString());
        result.warehouses++;
      }
    }

    // Inventory Items
    if (Array.isArray(payload.inventoryItems) && payload.inventoryItems.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO inventory_items (id, sku, name, warehouseId, quantity, volumePerUnit, totalVolume, inboundDate, valuePerUnit, totalValue, category, isAgeWarning)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of payload.inventoryItems!) {
        const isAgeWarning = item.isAgeWarning === true ? 1 : 0;
        stmt.run(item.id, item.sku ?? '', item.name ?? '', item.warehouseId ?? '', item.quantity ?? 0, item.volumePerUnit ?? 0, item.totalVolume ?? 0, item.inboundDate ?? '', item.valuePerUnit ?? 0, item.totalValue ?? 0, item.category ?? '', isAgeWarning);
        result.inventoryItems++;
      }
    }

    // Transit Orders
    if (Array.isArray(payload.transitOrders) && payload.transitOrders.length > 0) {
      const orderStmt = db.prepare(`INSERT OR REPLACE INTO transit_orders (id, trackingNo, fromWarehouseId, toWarehouseId, category, weight, volume, transportMode, estimatedArrival, actualArrival, status, createdAt, carrier, value)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const historyStmt = db.prepare(`INSERT OR REPLACE INTO transit_status_history (id, transitOrderId, status, time, location, remark) VALUES (?,?,?,?,?,?)`);
      for (const o of payload.transitOrders!) {
        orderStmt.run(o.id, o.trackingNo ?? '', o.fromWarehouseId ?? '', o.toWarehouseId ?? '', o.category ?? '', o.weight ?? 0, o.volume ?? 0, o.transportMode ?? 'sea', o.estimatedArrival ?? '', o.actualArrival ?? null, o.status ?? 'dispatched', o.createdAt ?? new Date().toISOString(), o.carrier ?? '', o.value ?? 0);
        // Insert status history if present
        const history = o.statusHistory as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(history)) {
          for (const h of history) {
            historyStmt.run(uuidv4(), o.id, h.status ?? '', h.time ?? '', h.location ?? '', h.remark ?? '');
          }
        }
        result.transitOrders++;
      }
    }

    // User Skills
    if (Array.isArray(payload.userSkills) && payload.userSkills.length > 0) {
      const stmt = db.prepare(`INSERT OR REPLACE INTO user_skills (id, name, "desc", icon, category, path, trigger, detail, tags, status, version, featured, shortcut, installedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const s of payload.userSkills!) {
        const tags = Array.isArray(s.tags) ? JSON.stringify(s.tags) : (s.tags as string) || '';
        const featured = s.featured === true ? 1 : 0;
        stmt.run(s.id, s.name ?? '', s.desc ?? '', s.icon ?? 'Extension', s.category ?? 'tool', s.path ?? '', s.trigger ?? null, s.detail ?? null, tags, s.status ?? 'active', s.version ?? null, featured, s.shortcut ?? null, s.installedAt ?? Date.now());
        result.userSkills++;
      }
    }

    // Builtin Status Patches
    if (payload.builtinStatusPatches && typeof payload.builtinStatusPatches === 'object') {
      const stmt = db.prepare('INSERT OR REPLACE INTO builtin_status_patches (skillId, status) VALUES (?,?)');
      for (const [skillId, status] of Object.entries(payload.builtinStatusPatches)) {
        stmt.run(skillId, status);
        result.builtinStatusPatches++;
      }
    }

    // App Settings
    if (payload.appSettings && typeof payload.appSettings === 'object') {
      db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?,?)').run('default', JSON.stringify(payload.appSettings));
      result.appSettings = 1;
    }
  });

  transaction();
  return result;
}
