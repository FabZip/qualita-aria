ALTER TABLE tree_source_cursors
  ADD COLUMN next_link_offset INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tree_source_cursors
  ADD COLUMN page_signature TEXT;
