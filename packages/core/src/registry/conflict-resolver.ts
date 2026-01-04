import { v4 as uuidv4 } from 'uuid';
import { McpServer } from '../db/types';
import { McpCandidate, ClientType } from '../adapters/types';
import { calculateFingerprint } from '../fingerprint';

export interface ConflictSource {
  client: ClientType;
  config: Partial<McpServer>;
  fingerprint: string;
}

export type ConflictDifferenceField = 'url' | 'headers' | 'env' | 'args' | 'command' | 'cwd';

export interface ConfigDifference {
  field: ConflictDifferenceField;
  values: {
    client: ClientType;
    value: unknown;
  }[];
}

export interface ConflictGroup {
  id: string;
  name: string;
  sources: ConflictSource[];
  differences: ConfigDifference[];
  createdAt: number;
}

export type ResolutionAction =
  | { type: 'merge'; baseClient: ClientType; editedConfig?: Partial<McpServer> }
  | { type: 'separate'; renames: { client: ClientType; newName: string }[] }
  | { type: 'skip' };

export interface ConflictResolution {
  conflictId: string;
  conflictName?: string;
  action: ResolutionAction;
}

export interface ConflictDetectionResult {
  conflicts: ConflictGroup[];
  nonConflicting: McpCandidate[];
}

const CLIENT_SUFFIXES: Record<ClientType, string> = {
  [ClientType.CLAUDE_CODE]: 'claude',
  [ClientType.OPENCODE]: 'opencode',
  [ClientType.CODEX]: 'codex',
  [ClientType.GEMINI_CLI]: 'gemini',
};

export function getClientSuffix(client: ClientType): string {
  return CLIENT_SUFFIXES[client] || client;
}

export function getClientDisplayName(client: ClientType): string {
  const names: Record<ClientType, string> = {
    [ClientType.CLAUDE_CODE]: 'Claude Code',
    [ClientType.OPENCODE]: 'OpenCode',
    [ClientType.CODEX]: 'Codex',
    [ClientType.GEMINI_CLI]: 'Gemini CLI',
  };
  return names[client] || client;
}

export function detectConflicts(candidates: McpCandidate[]): ConflictDetectionResult {
  const nameGroups = new Map<string, McpCandidate[]>();

  for (const candidate of candidates) {
    const name = candidate.server.name;
    if (!name) continue;

    if (!nameGroups.has(name)) {
      nameGroups.set(name, []);
    }
    nameGroups.get(name)!.push(candidate);
  }

  const conflicts: ConflictGroup[] = [];
  const nonConflicting: McpCandidate[] = [];

  for (const [name, group] of nameGroups) {
    if (group.length === 1) {
      nonConflicting.push(group[0]!);
      continue;
    }

    const fingerprints = new Set<string>();
    for (const candidate of group) {
      let fp = candidate.server.fingerprint;
      if (!fp) {
        fp = calculateFingerprint(candidate.server);
        candidate.server.fingerprint = fp;
      }
      fingerprints.add(fp);
    }

    if (fingerprints.size === 1) {
      nonConflicting.push(...group);
      continue;
    }

    const sources: ConflictSource[] = group.map(candidate => ({
      client: candidate.binding.client as ClientType,
      config: candidate.server,
      fingerprint: candidate.server.fingerprint || calculateFingerprint(candidate.server),
    }));

    const differences = calculateDifferences(sources);

    conflicts.push({
      id: uuidv4(),
      name,
      sources,
      differences,
      createdAt: Date.now(),
    });
  }

  return { conflicts, nonConflicting };
}

export function calculateDifferences(sources: ConflictSource[]): ConfigDifference[] {
  const differences: ConfigDifference[] = [];
  const fields: ConflictDifferenceField[] = ['url', 'headers', 'env', 'args', 'command', 'cwd'];

  for (const field of fields) {
    const values: { client: ClientType; value: unknown }[] = [];
    const uniqueValues = new Set<string>();

    for (const source of sources) {
      const value = source.config[field];
      values.push({ client: source.client, value });
      uniqueValues.add(JSON.stringify(value ?? null));
    }

    if (uniqueValues.size > 1) {
      differences.push({ field, values });
    }
  }

  return differences;
}

export function generateSuffixes(
  name: string,
  clients: ClientType[]
): Map<ClientType, string> {
  const result = new Map<ClientType, string>();

  for (const client of clients) {
    const suffix = getClientSuffix(client);
    result.set(client, `${name}-${suffix}`);
  }

  return result;
}

export function applyResolutions(
  conflicts: ConflictGroup[],
  resolutions: ConflictResolution[],
  nonConflicting: McpCandidate[]
): McpCandidate[] {
  const result: McpCandidate[] = [...nonConflicting];
  const resolutionByIdMap = new Map(resolutions.map(r => [r.conflictId, r.action]));
  
  const resolutionByNameMap = new Map<string, ResolutionAction>();
  for (const resolution of resolutions) {
    if (resolution.conflictName) {
      resolutionByNameMap.set(resolution.conflictName, resolution.action);
    }
  }

  for (const conflict of conflicts) {
    let action = resolutionByIdMap.get(conflict.id);
    if (!action) {
      action = resolutionByNameMap.get(conflict.name);
    }

    if (!action) {
      continue;
    }

    switch (action.type) {
      case 'merge': {
        const baseSource = conflict.sources.find(s => s.client === action.baseClient);
        if (!baseSource) continue;

        const mergedConfig = action.editedConfig || baseSource.config;
        const mergedFingerprint = calculateFingerprint(mergedConfig);

        for (const source of conflict.sources) {
          result.push({
            server: {
              ...mergedConfig,
              name: conflict.name,
              fingerprint: mergedFingerprint,
            },
            binding: {
              client: source.client,
              enabled: 'on',
            },
            sourceSnapshot: {} as any,
          });
        }
        break;
      }

      case 'separate': {
        const renameMap = new Map(action.renames.map(r => [r.client, r.newName]));

        for (const source of conflict.sources) {
          const newName = renameMap.get(source.client) || `${conflict.name}-${getClientSuffix(source.client)}`;

          result.push({
            server: {
              ...source.config,
              name: newName,
              fingerprint: calculateFingerprint({ ...source.config, name: newName }),
            },
            binding: {
              client: source.client,
              enabled: 'on',
            },
            sourceSnapshot: {} as any,
          });
        }
        break;
      }

      case 'skip': {
        break;
      }
    }
  }

  return result;
}

export function createBulkResolution(
  conflicts: ConflictGroup[],
  bulkAction: 'use_client' | 'keep_separate' | 'skip_all',
  client?: ClientType
): ConflictResolution[] {
  return conflicts.map(conflict => {
    let action: ResolutionAction;

    switch (bulkAction) {
      case 'use_client':
        if (!client) {
          client = conflict.sources[0]?.client;
        }
        action = { type: 'merge', baseClient: client! };
        break;

      case 'keep_separate':
        const suffixes = generateSuffixes(
          conflict.name,
          conflict.sources.map(s => s.client)
        );
        action = {
          type: 'separate',
          renames: Array.from(suffixes.entries()).map(([c, newName]) => ({
            client: c,
            newName,
          })),
        };
        break;

      case 'skip_all':
        action = { type: 'skip' };
        break;
    }

    return {
      conflictId: conflict.id,
      conflictName: conflict.name,
      action,
    };
  });
}
