import { initDatabase } from './index';
import type { SourceSnapshot, McpServer, ClientBinding, ActivityLog, ActivityAction, ActivityEntityType } from './types';
import type { ConflictGroup, ResolutionAction } from '../registry/conflict-resolver';
import { v4 as uuidv4 } from 'uuid';

function getDb() {
  return initDatabase();
}

function toCamelCase(obj: any): any {
  if (!obj) return obj;
  const newObj: any = {};
  for (const key in obj) {
    const newKey = key.replace(/_([a-z])/g, (_match, p1) => p1.toUpperCase());
    newObj[newKey] = obj[key];
  }
  return newObj;
}

function parseJsonField<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function rowToMcpServer(row: any): McpServer {
  const base = toCamelCase(row);
  return {
    ...base,
    args: parseJsonField<string[]>(row.args),
    headers: parseJsonField<Record<string, string>>(row.headers),
    env: parseJsonField<Record<string, string>>(row.env),
    tags: parseJsonField<string[]>(row.tags),
  };
}

export function insertMcpServer(server: Omit<McpServer, 'id' | 'createdAt' | 'updatedAt'>): string {
  const id = uuidv4();
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO mcp_servers (id, name, type, command, args, cwd, url, headers, env, tags, fingerprint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    server.name,
    server.type,
    server.command,
    server.args ? JSON.stringify(server.args) : null,
    server.cwd,
    server.url,
    server.headers ? JSON.stringify(server.headers) : null,
    server.env ? JSON.stringify(server.env) : null,
    server.tags ? JSON.stringify(server.tags) : null,
    server.fingerprint,
    now,
    now
  );
  return id;
}

export function getMcpServerById(id: string): McpServer | undefined {
  const row = getDb().prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  return row ? rowToMcpServer(row) : undefined;
}

export function getMcpServerByFingerprint(fingerprint: string): McpServer | undefined {
  const row = getDb().prepare('SELECT * FROM mcp_servers WHERE fingerprint = ?').get(fingerprint);
  return row ? rowToMcpServer(row) : undefined;
}

export function getAllMcpServers(): McpServer[] {
  const rows = getDb().prepare('SELECT * FROM mcp_servers ORDER BY name').all();
  return rows.map((row: any) => rowToMcpServer(row));
}

export function upsertMcpServer(server: Omit<McpServer, 'id' | 'createdAt' | 'updatedAt'>): string {
  const existing = getMcpServerByFingerprint(server.fingerprint);
  if (existing) {
    updateMcpServer(existing.id, server);
    return existing.id;
  }
  return insertMcpServer(server);
}

export function updateMcpServer(id: string, updates: Partial<Omit<McpServer, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.command !== undefined) {
    fields.push('command = ?');
    values.push(updates.command);
  }
  if (updates.args !== undefined) {
    fields.push('args = ?');
    values.push(updates.args ? JSON.stringify(updates.args) : null);
  }
  if (updates.cwd !== undefined) {
    fields.push('cwd = ?');
    values.push(updates.cwd);
  }
  if (updates.url !== undefined) {
    fields.push('url = ?');
    values.push(updates.url);
  }
  if (updates.headers !== undefined) {
    fields.push('headers = ?');
    values.push(updates.headers ? JSON.stringify(updates.headers) : null);
  }
  if (updates.env !== undefined) {
    fields.push('env = ?');
    values.push(updates.env ? JSON.stringify(updates.env) : null);
  }
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(updates.tags ? JSON.stringify(updates.tags) : null);
  }
  if (updates.fingerprint !== undefined) {
    fields.push('fingerprint = ?');
    values.push(updates.fingerprint);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const sql = `UPDATE mcp_servers SET ${fields.join(', ')} WHERE id = ?`;
  getDb().prepare(sql).run(...values);
}

export function deleteMcpServer(id: string): void {
  getDb().prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

export function insertClientBinding(binding: Omit<ClientBinding, 'id' | 'createdAt' | 'updatedAt'>): string {
  const id = uuidv4();
  const now = Date.now();
  const stmt = getDb().prepare(`
    INSERT INTO client_bindings (id, server_id, client, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, binding.serverId, binding.client, binding.enabled, now, now);
  return id;
}

export function getBindingsByServerId(serverId: string): ClientBinding[] {
  const rows = getDb().prepare('SELECT * FROM client_bindings WHERE server_id = ?').all(serverId);
  return rows.map((row: any) => toCamelCase(row) as ClientBinding);
}

export function getBindingByServerAndClient(serverId: string, client: string): ClientBinding | undefined {
  const row = getDb().prepare('SELECT * FROM client_bindings WHERE server_id = ? AND client = ?').get(serverId, client);
  return row ? toCamelCase(row) as ClientBinding : undefined;
}

export function updateBinding(id: string, updates: Partial<Pick<ClientBinding, 'enabled'>>): void {
  if (updates.enabled === undefined) return;
  getDb().prepare('UPDATE client_bindings SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(updates.enabled, Date.now(), id);
}

export function deleteBinding(id: string): void {
  getDb().prepare('DELETE FROM client_bindings WHERE id = ?').run(id);
}

export function getAllMcpServersWithBindings(): (McpServer & { bindings: ClientBinding[] })[] {
  const servers = getAllMcpServers();
  const bindingRows = getDb().prepare('SELECT * FROM client_bindings').all();

  const bindingsMap = new Map<string, ClientBinding[]>();
  for (const row of bindingRows) {
    const binding = toCamelCase(row) as ClientBinding;
    if (!bindingsMap.has(binding.serverId)) {
      bindingsMap.set(binding.serverId, []);
    }
    bindingsMap.get(binding.serverId)!.push(binding);
  }

  return servers.map(server => ({
    ...server,
    bindings: bindingsMap.get(server.id) || []
  }));
}

export function insertSourceSnapshot(snapshot: Omit<SourceSnapshot, 'id'>): string {
  const id = uuidv4();
  const stmt = getDb().prepare(`
    INSERT INTO source_snapshots (id, client, path, hash, mtime, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(client, path) DO UPDATE SET
      hash = excluded.hash,
      mtime = excluded.mtime,
      scanned_at = excluded.scanned_at
    RETURNING id
  `);
  const result = stmt.get(id, snapshot.client, snapshot.path, snapshot.hash, snapshot.mtime, snapshot.scannedAt) as { id: string } | undefined;
  return result ? result.id : id;
}

export function getSourceSnapshot(client: string, path: string): SourceSnapshot | undefined {
  const row = getDb().prepare('SELECT * FROM source_snapshots WHERE client = ? AND path = ?').get(client, path);
  return row ? toCamelCase(row) as SourceSnapshot : undefined;
}

export function logActivity(
  action: ActivityAction,
  entityType: ActivityEntityType,
  entityId?: string | null,
  entityName?: string | null,
  details?: string | null
): string {
  const id = uuidv4();
  getDb().prepare(`
    INSERT INTO activity_log (id, action, entity_type, entity_id, entity_name, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, action, entityType, entityId || null, entityName || null, details || null, Date.now());
  return id;
}

export function getRecentActivities(limit: number = 20): ActivityLog[] {
  const rows = getDb().prepare(`
    SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  return rows.map((row: any) => toCamelCase(row) as ActivityLog);
}

export function clearOldActivities(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - olderThanMs;
  const result = getDb().prepare('DELETE FROM activity_log WHERE created_at < ?').run(cutoff);
  return result.changes;
}

export function deleteOrphanedServers(): number {
  const result = getDb().prepare(`
    DELETE FROM mcp_servers
    WHERE id NOT IN (SELECT DISTINCT server_id FROM client_bindings)
  `).run();
  return result.changes;
}

interface PendingConflictRow {
  id: string;
  name: string;
  sources: string;
  differences: string;
  created_at: number;
  resolved_at: number | null;
  resolution: string | null;
}

export function insertPendingConflict(conflict: ConflictGroup): string {
  const stmt = getDb().prepare(`
    INSERT INTO pending_conflicts (id, name, sources, differences, created_at, resolved_at, resolution)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      sources = excluded.sources,
      differences = excluded.differences
  `);
  stmt.run(
    conflict.id,
    conflict.name,
    JSON.stringify(conflict.sources),
    JSON.stringify(conflict.differences),
    conflict.createdAt
  );
  return conflict.id;
}

export function getPendingConflicts(): ConflictGroup[] {
  const rows = getDb().prepare(`
    SELECT * FROM pending_conflicts WHERE resolved_at IS NULL ORDER BY created_at DESC
  `).all() as PendingConflictRow[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    sources: JSON.parse(row.sources),
    differences: JSON.parse(row.differences),
    createdAt: row.created_at,
  }));
}

export function getUnresolvedConflictsCount(): number {
  const result = getDb().prepare(`
    SELECT COUNT(*) as count FROM pending_conflicts WHERE resolved_at IS NULL
  `).get() as { count: number };
  return result.count;
}

export function markConflictResolved(id: string, resolution: ResolutionAction): void {
  getDb().prepare(`
    UPDATE pending_conflicts SET resolved_at = ?, resolution = ? WHERE id = ?
  `).run(Date.now(), JSON.stringify(resolution), id);
}

export function clearAllPendingConflicts(): void {
  getDb().prepare('DELETE FROM pending_conflicts').run();
}

export function clearResolvedConflicts(): void {
  getDb().prepare('DELETE FROM pending_conflicts WHERE resolved_at IS NOT NULL').run();
}
