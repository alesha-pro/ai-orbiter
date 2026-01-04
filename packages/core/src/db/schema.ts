export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('stdio', 'http')),
  command TEXT,
  args TEXT,
  cwd TEXT,
  url TEXT,
  headers TEXT,
  env TEXT,
  tags TEXT,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS client_bindings (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  client TEXT NOT NULL,
  enabled TEXT NOT NULL DEFAULT 'on' CHECK (enabled IN ('on', 'off')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  UNIQUE(server_id, client)
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_fingerprint ON mcp_servers(fingerprint);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_type ON mcp_servers(type);
CREATE INDEX IF NOT EXISTS idx_bindings_client ON client_bindings(client);
CREATE INDEX IF NOT EXISTS idx_bindings_server ON client_bindings(server_id);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id TEXT PRIMARY KEY,
  client TEXT NOT NULL,
  path TEXT NOT NULL,
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  scanned_at INTEGER NOT NULL,
  UNIQUE(client, path)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_name TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

CREATE TABLE IF NOT EXISTS pending_conflicts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sources TEXT NOT NULL,
  differences TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_conflicts_resolved ON pending_conflicts(resolved_at);
`;
