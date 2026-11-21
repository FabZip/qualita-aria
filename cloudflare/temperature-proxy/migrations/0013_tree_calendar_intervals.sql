ALTER TABLE tree_events ADD COLUMN event_end_date TEXT;
ALTER TABLE tree_events ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'notice';
ALTER TABLE tree_events ADD COLUMN calendar_url TEXT;
CREATE TABLE IF NOT EXISTS tree_calendar_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  completed_at TEXT NOT NULL,
  events INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  detail_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tree_events_interval ON tree_events(city,event_date,event_end_date);
