import { getAllMcpServersWithBindings, getBindingsByServerId } from '../db/dal';
import { initDatabase } from '../db';
import { McpServer, ClientBinding } from '../db/types';

export function getAllMcpServers() {
  return getAllMcpServersWithBindings();
}

export function getAllMcpServersWithBindingsQuery() {
  return getAllMcpServersWithBindings();
}

export function getMcpServerById(id: string): (McpServer & { bindings: ClientBinding[] }) | undefined {
  const db = initDatabase();
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id);
  if (!row) return undefined;

  const toCamelCase = (obj: any): any => {
    if (!obj) return obj;
    const newObj: any = {};
    for (const key in obj) {
      const newKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      newObj[newKey] = obj[key];
    }
    return newObj;
  };

  const parseJsonField = <T>(value: string | null): T | null => {
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  };

  const base = toCamelCase(row);
  const server: McpServer = {
    ...base,
    args: parseJsonField<string[]>(row.args),
    headers: parseJsonField<Record<string, string>>(row.headers),
    env: parseJsonField<Record<string, string>>(row.env),
    tags: parseJsonField<string[]>(row.tags),
  };
  const bindings = getBindingsByServerId(id);

  return { ...server, bindings };
}

export function getBindingsByServer(serverId: string): ClientBinding[] {
  return getBindingsByServerId(serverId);
}

export function getEffectiveConfigForClient(client: string) {
  const allData = getAllMcpServersWithBindings();
  
  const result: (McpServer & { binding: ClientBinding })[] = [];
  
  for (const serverWithBindings of allData) {
    const binding = serverWithBindings.bindings.find(b => b.client === client && b.enabled === 'on');
    if (binding) {
      const { bindings: _, ...server } = serverWithBindings;
      result.push({ ...server, binding });
    }
  }

  return result;
}
