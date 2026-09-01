CREATE TABLE IF NOT EXISTS tree_location_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  event_id TEXT,
  location_index INTEGER NOT NULL DEFAULT 0,
  location_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  reporter_name TEXT,
  reporter_email TEXT,
  suggested_longitude REAL,
  suggested_latitude REAL,
  reporter_ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tree_location_reports_status
  ON tree_location_reports(status, created_at);

CREATE TABLE IF NOT EXISTS tree_location_overrides (
  source_key TEXT NOT NULL,
  location_index INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  geometry_json TEXT,
  report_id INTEGER,
  PRIMARY KEY (source_key, location_index)
);

UPDATE tree_events SET geocoded_at=NULL
WHERE location_points_json IS NOT NULL;
