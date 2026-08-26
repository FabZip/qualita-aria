ALTER TABLE tree_events ADD COLUMN latitude REAL;
ALTER TABLE tree_events ADD COLUMN longitude REAL;
ALTER TABLE tree_events ADD COLUMN geocode_precision TEXT;
ALTER TABLE tree_events ADD COLUMN geocode_label TEXT;
ALTER TABLE tree_events ADD COLUMN geocoded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_tree_events_pending_geocode
  ON tree_events(city, geocoded_at);
