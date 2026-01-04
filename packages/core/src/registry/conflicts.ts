import { McpServer } from '../db/types';

export enum ConflictType {
  NAME_CONFLICT = 'NAME_CONFLICT'
}

export interface Conflict {
  type: ConflictType;
  serverIds: string[];
  description: string;
}

export function detectConflicts(servers: McpServer[]): Conflict[] {
  const nameMap = new Map<string, string[]>();

  for (const server of servers) {
    if (!server.name) continue;

    if (!nameMap.has(server.name)) {
      nameMap.set(server.name, []);
    }
    nameMap.get(server.name)!.push(server.id);
  }

  const conflicts: Conflict[] = [];

  for (const [name, ids] of nameMap) {
    if (ids.length > 1) {
      conflicts.push({
        type: ConflictType.NAME_CONFLICT,
        serverIds: ids,
        description: `Multiple MCP servers share the same name: "${name}"`
      });
    }
  }

  return conflicts;
}
