CREATE TABLE IF NOT EXISTS tree_source_cursors (
  source_id TEXT PRIMARY KEY,
  city TEXT NOT NULL,
  next_page INTEGER NOT NULL DEFAULT 1,
  scan_year INTEGER NOT NULL,
  scan_complete INTEGER NOT NULL DEFAULT 0,
  completed_year INTEGER,
  earliest_publication TEXT,
  last_scanned_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tree_source_cursors_city
  ON tree_source_cursors(city, scan_year);
