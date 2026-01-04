import { DiffResult } from '../diff/calculator';
import { getAdapter } from '../adapters/registry';
import { McpServer, ClientBinding } from '../db/types';
import { ClientType, ApplyResult } from '../adapters/types';
import { createBackup, restoreBackup } from '../backup';
import { updateSnapshotHashAfterApply } from '../drift/snapshot-utils';

export interface OrchestratorResult {
  success: boolean;
  filesChanged: string[];
  errors: Array<{ filePath: string; error: Error }>;
  backups: Array<{ filePath: string; backupPath: string }>;
}

export async function applyChanges(
  diff: DiffResult,
  allServers: McpServer[],
  allBindings: ClientBinding[]
): Promise<OrchestratorResult> {
  const filesChanged: string[] = [];
  const errors: Array<{ filePath: string; error: Error }> = [];
  const backups: Array<{ filePath: string; backupPath: string }> = [];

  if (diff.summary.totalChanges === 0) {
    return { success: true, filesChanged, errors, backups };
  }

  for (const entry of diff.entries) {
    try {
      const adapter = getAdapter(entry.client as ClientType);

      const relevantBindings = allBindings.filter(b => b.client === entry.client);

      const config = await adapter.compile(allServers, relevantBindings);

      let backupPath: string | undefined;
      try {
        backupPath = createBackup(config.filePath);
        if (backupPath) {
          backups.push({ filePath: config.filePath, backupPath });
        }
      } catch {}

      const result: ApplyResult = await adapter.apply(config, { backup: true });

      if (!result.success) {
        if (backupPath) {
          try {
            restoreBackup(backupPath, config.filePath);
          } catch {}
        }

        errors.push({
          filePath: config.filePath,
          error: result.error || new Error('Apply failed')
        });
      } else {
        filesChanged.push(config.filePath);

        if (result.filePath) {
          await updateSnapshotHashAfterApply(result.filePath, entry.client);
        }
      }
    } catch (e) {
      errors.push({
        filePath: entry.filePath || entry.client,
        error: e instanceof Error ? e : new Error(String(e))
      });
    }
  }

  const success = errors.length === 0;

  if (!success) {
    for (const backup of backups) {
      try {
        restoreBackup(backup.backupPath, backup.filePath);
      } catch {}
    }
  }

  return { success, filesChanged, errors, backups };
}
