-- 003_add_wms_skill_tables.sql
-- WMS 行业技能相关表：入库质检、库存盘点、出库复核、异常预警、报表生成

-- 入库质检表
CREATE TABLE IF NOT EXISTS wms_quality_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  batch_no TEXT,
  expiry_date TEXT,
  expected_quantity INTEGER DEFAULT 0,
  actual_quantity INTEGER DEFAULT 0,
  quality_status TEXT DEFAULT 'pending',  -- pending/qualified/unqualified
  inspector TEXT,
  check_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 库存盘点表
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
  status TEXT DEFAULT 'pending',  -- pending/confirmed/adjusted
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 出库复核表
CREATE TABLE IF NOT EXISTS wms_outbound_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbound_order_id TEXT NOT NULL,
  warehouse_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  product_name TEXT,
  expected_quantity INTEGER DEFAULT 0,
  scanned_quantity INTEGER DEFAULT 0,
  review_status TEXT DEFAULT 'pending',  -- pending/passed/failed
  reviewer TEXT,
  review_time TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 异常预警表
CREATE TABLE IF NOT EXISTS wms_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,  -- low_stock/expiry/stagnant
  severity TEXT DEFAULT 'medium',  -- low/medium/high/critical
  sku TEXT,
  message TEXT NOT NULL,
  triggered_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  status TEXT DEFAULT 'active',  -- active/resolved/ignored
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 报表生成记录表
CREATE TABLE IF NOT EXISTS wms_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,  -- inbound/outbound/inventory/custom
  warehouse_id TEXT,
  start_date TEXT,
  end_date TEXT,
  file_path TEXT,
  file_format TEXT DEFAULT 'csv',  -- csv/xlsx/pdf
  generated_by TEXT,
  generated_at TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'completed',  -- pending/completed/failed
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
