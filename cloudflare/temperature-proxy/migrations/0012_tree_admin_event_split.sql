-- Retain split lineage and the original tombstone across automatic refreshes.
ALTER TABLE tree_events ADD COLUMN parent_source_key TEXT;
ALTER TABLE tree_events ADD COLUMN split_parent INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tree_events_parent ON tree_events(parent_source_key);
CREATE INDEX IF NOT EXISTS idx_tree_events_split_source ON tree_events(source_url,split_parent);
CREATE TABLE IF NOT EXISTS tree_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tree_admin_audit_event ON tree_admin_audit(source_key,id);
