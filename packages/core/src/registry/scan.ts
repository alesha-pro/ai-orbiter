import fs from 'fs/promises';
import { getAllAdapters } from '../adapters/registry';
import { insertSourceSnapshot } from '../db/dal';
import type { SourceSnapshot } from '../db/types';
import type { McpCandidate, DiscoveryOptions } from '../adapters/types';
import { hashMcpBlock } from '../drift/snapshot-utils';

export interface ScanResult {
  candidates: McpCandidate[];
  snapshots: SourceSnapshot[];
  warnings: string[];
}

export async function globalScan(options?: DiscoveryOptions): Promise<ScanResult> {
  const adapters = getAllAdapters();
  
  const allCandidates: McpCandidate[] = [];
  const allSnapshots: SourceSnapshot[] = [];
  const allWarnings: string[] = [];

  for (const adapter of adapters) {
    try {
      const result = await adapter.discover(options);
      
      if (result.warnings) {
        allWarnings.push(...result.warnings);
      }

      const idMap = new Map<string, string>();

      for (const snapshot of result.snapshots) {
        const { id: tempId, ...snapshotData } = snapshot;

        let hash = snapshotData.hash;
        try {
          const content = await fs.readFile(snapshotData.path, 'utf-8');
          hash = hashMcpBlock(content, snapshotData.client);
        } catch {
          hash = snapshotData.hash;
        }

        const newId = insertSourceSnapshot({ ...snapshotData, hash });
        idMap.set(tempId, newId);

        allSnapshots.push({ ...snapshot, id: newId, hash });
      }

      for (const candidate of result.candidates) {
        allCandidates.push(candidate);
      }

    } catch (e) {
      allWarnings.push(`Adapter ${adapter.type} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    candidates: allCandidates,
    snapshots: allSnapshots,
    warnings: allWarnings
  };
}
