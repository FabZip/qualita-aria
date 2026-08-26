CREATE TABLE IF NOT EXISTS tree_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL DEFAULT 'roma',
  year INTEGER NOT NULL,
  event_date TEXT,
  location_name TEXT NOT NULL DEFAULT 'Roma',
  district TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('planting', 'decrement', 'unknown')),
  quantity INTEGER,
  status TEXT NOT NULL CHECK (status IN ('completed', 'emergency_completed', 'planned', 'reported', 'unknown')),
  validation TEXT NOT NULL CHECK (validation IN ('automatic_confirmed', 'automatic_pending', 'manual_confirmed', 'manual_rejected')),
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  raw_excerpt TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tree_events_city_year
  ON tree_events(city, year);

CREATE INDEX IF NOT EXISTS idx_tree_events_validation
  ON tree_events(validation, status);

CREATE TABLE IF NOT EXISTS tree_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL,
  discovered INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);
