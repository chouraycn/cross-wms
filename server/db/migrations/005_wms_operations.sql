-- Migration 005: WMS 运营操作表
-- 创建时间：2026-06-08
-- 说明：这些表在 server/dao/wmsSkillDao.ts 的 ensureWmsTables() 中
--       也通过 CREATE TABLE IF NOT EXISTS 在启动时创建（幂等）。
--       本迁移文件用于文档记录和灾难恢复。

-- 入库质检
CREATE TABLE IF NOT EXISTS wms_quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  batch_no TEXT,
  expiry_date TEXT,
  expected_quantity INTEGER DEFAULT 0,
  actual_quantity INTEGER DEFAULT 0,
  quality_status TEXT DEFAULT 'pending',
  inspector TEXT,
  check_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 库存盘点
CREATE TABLE IF NOT EXISTS wms_inventory_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id TEXT NOT NULL,
  location_code TEXT NOT NULL,
  sku TEXT NOT NULL,
  system_quantity INTEGER DEFAULT 0,
  actual_quantity INTEGER DEFAULT 0,
  variance INTEGER GENERATED ALWAYS AS (actual_quantity - system_quantity) STORED,
  counter TEXT,
  count_time TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 出库复核
CREATE TABLE IF NOT EXISTS wms_outbound_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbound_order_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  expected_quantity INTEGER DEFAULT 0,
  scanned_quantity INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'pending',
  reviewer TEXT,
  review_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 异常预警
CREATE TABLE IF NOT EXISTS wms_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  sku TEXT,
  message TEXT NOT NULL,
  triggered_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 报表
CREATE TABLE IF NOT EXISTS wms_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,
  warehouse_id TEXT,
  start_date TEXT,
  end_date TEXT,
  file_path TEXT,
  file_format TEXT DEFAULT 'csv',
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_wms_quality_warehouse ON wms_quality_checks(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wms_quality_status ON wms_quality_checks(quality_status);
CREATE INDEX IF NOT EXISTS idx_wms_quality_sku ON wms_quality_checks(sku);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_warehouse ON wms_inventory_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_status ON wms_inventory_counts(status);
CREATE INDEX IF NOT EXISTS idx_wms_inventory_count_sku ON wms_inventory_counts(sku);
CREATE INDEX IF NOT EXISTS idx_wms_outbound_review_warehouse ON wms_outbound_reviews(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wms_outbound_review_order ON wms_outbound_reviews(outbound_order_id);
CREATE INDEX IF NOT EXISTS idx_wms_alerts_warehouse ON wms_alerts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_wms_alerts_type ON wms_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_wms_alerts_status ON wms_alerts(status);
CREATE INDEX IF NOT EXISTS idx_wms_reports_type ON wms_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_wms_reports_warehouse ON wms_reports(warehouse_id);
