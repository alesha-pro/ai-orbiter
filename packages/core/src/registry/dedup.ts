import { v4 as uuidv4 } from 'uuid';
import { calculateFingerprint } from '../fingerprint';
import { McpServer, ClientBinding } from '../db/types';
import { McpCandidate } from '../adapters/types';

export type DeduplicatedServer = McpServer & {
  bindings: ClientBinding[];
};

export function deduplicateCandidates(candidates: McpCandidate[]): DeduplicatedServer[] {
  const groups = new Map<string, McpCandidate[]>();

  for (const candidate of candidates) {
    let fp = candidate.server.fingerprint;
    if (!fp) {
      fp = calculateFingerprint(candidate.server);
    }
    candidate.server.fingerprint = fp;

    if (!groups.has(fp)) {
      groups.set(fp, []);
    }
    groups.get(fp)!.push(candidate);
  }

  const results: DeduplicatedServer[] = [];

  for (const [fingerprint, group] of groups) {
    if (!group || group.length === 0) continue;
    const base = group[0]!.server;

    const name = group.map(c => c.server.name).find(n => n) || 'unnamed';

    const id = uuidv4();
    const now = Date.now();

    const server: McpServer = {
      id,
      name,
      type: base.type || 'stdio',
      command: base.command ?? null,
      args: base.args ?? null,
      cwd: base.cwd ?? null,
      url: base.url ?? null,
      headers: base.headers ?? null,
      env: base.env ?? null,
      tags: null,
      fingerprint,
      createdAt: now,
      updatedAt: now
    };

    const uniqueClientBindings = new Map<string, ClientBinding>();
    
    for (const c of group) {
      const client = c.binding.client || 'unknown';
      if (uniqueClientBindings.has(client)) {
        continue;
      }
      uniqueClientBindings.set(client, {
        id: uuidv4(),
        serverId: id,
        client,
        enabled: (c.binding.enabled as 'on' | 'off') || 'on',
        createdAt: now,
        updatedAt: now
      });
    }
    
    const bindings = Array.from(uniqueClientBindings.values());

    results.push({ ...server, bindings });
  }

  return results;
}
