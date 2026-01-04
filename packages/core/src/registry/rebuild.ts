import { initDatabase } from '../db';
import { globalScan } from './scan';
import { deduplicateCandidates } from './dedup';
import { McpServer } from '../db/types';
import {
  detectConflicts,
  applyResolutions,
  ConflictGroup,
  ConflictResolution,
} from './conflict-resolver';
import {
  insertPendingConflict,
  clearAllPendingConflicts,
} from '../db/dal';

export interface RebuildOptions {
  resolutions?: ConflictResolution[];
  forceImportAll?: boolean;
}

export interface RebuildResult {
  success: boolean;
  importedCount: number;
  conflicts: ConflictGroup[];
  skippedDueToConflicts: number;
}

export async function rebuildRegistry(options?: RebuildOptions): Promise<RebuildResult> {
  const db = initDatabase();

  db.exec('DELETE FROM client_bindings');
  db.exec('DELETE FROM mcp_servers');
  db.exec('DELETE FROM source_snapshots');
  clearAllPendingConflicts();

  const scanResult = await globalScan();
  const candidates = scanResult.candidates;

  const { conflicts, nonConflicting } = detectConflicts(candidates);

  let candidatesToProcess = nonConflicting;
  let unresolvedConflicts = conflicts;

  if (options?.resolutions && options.resolutions.length > 0) {
    const resolvedCandidates = applyResolutions(conflicts, options.resolutions, nonConflicting);
    candidatesToProcess = resolvedCandidates;

    const resolvedIds = new Set(options.resolutions.map(r => r.conflictId));
    const resolvedNames = new Set(options.resolutions.map(r => r.conflictName).filter(Boolean));
    unresolvedConflicts = conflicts.filter(c => !resolvedIds.has(c.id) && !resolvedNames.has(c.name));
  } else if (options?.forceImportAll) {
    candidatesToProcess = candidates;
    unresolvedConflicts = [];
  }

  for (const conflict of unresolvedConflicts) {
    insertPendingConflict(conflict);
  }

  const dedupedResults = deduplicateCandidates(candidatesToProcess);

  dedupedResults.sort((a, b) => {
    if (a.fingerprint < b.fingerprint) return -1;
    if (a.fingerprint > b.fingerprint) return 1;
    return 0;
  });

  const servers: McpServer[] = [];

  const insertServerStmt = db.prepare(`
    INSERT INTO mcp_servers (id, name, type, command, args, cwd, url, headers, env, tags, fingerprint, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertBindingStmt = db.prepare(`
    INSERT INTO client_bindings (id, server_id, client, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    for (const item of dedupedResults) {
      const { bindings, ...server } = item;
      servers.push(server);

      insertServerStmt.run(
        server.id,
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
        server.createdAt,
        server.updatedAt
      );

      for (const binding of bindings) {
        insertBindingStmt.run(
          binding.id,
          binding.serverId,
          binding.client,
          binding.enabled,
          binding.createdAt,
          binding.updatedAt
        );
      }
    }
  });

  transaction();

  return {
    success: true,
    importedCount: servers.length,
    conflicts: unresolvedConflicts,
    skippedDueToConflicts: unresolvedConflicts.length,
  };
}
