-- Skema database GriyaLapor (Turso / libSQL)
-- Dijalankan oleh scripts/migrate.ts

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  group_name TEXT,
  default_fee INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  date TEXT NOT NULL,
  qty INTEGER NOT NULL,
  fee_per_unit INTEGER NOT NULL,
  total INTEGER NOT NULL,             -- qty * fee_per_unit  (PENDAPATAN BERSIH / fee admin yang didapat)
  total_paid INTEGER NOT NULL DEFAULT 0,  -- total uang dari pembeli = OMZET (fee sudah include)
  bill_per_unit INTEGER NOT NULL DEFAULT 0,  -- (deprecated, kompatibilitas lama)
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_cat_date ON transactions(category_id, date);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
