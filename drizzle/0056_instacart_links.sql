CREATE TABLE shopping_list_instacart_links (
  list_id TEXT PRIMARY KEY NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  url TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
