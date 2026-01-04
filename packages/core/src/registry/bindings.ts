import { getAllMcpServersWithBindings, updateBinding, logActivity } from '../db/dal';
import { initDatabase } from '../db';
import { ClientBinding, McpServer } from '../db/types';
import { getAdapter } from '../adapters/registry';
import { ClientType } from '../adapters/types';
import { updateSnapshotHashAfterApply } from '../drift/snapshot-utils';

export async function updateBindingEnabled(
  bindingId: string,
  enabled: 'on' | 'off'
): Promise<void> {
  const db = initDatabase();

  const row = db.prepare('SELECT * FROM client_bindings WHERE id = ?').get(bindingId);

  if (!row) {
    throw new Error(`Binding not found: ${bindingId}`);
  }

  const toCamelCase = (obj: any): any => {
    const newObj: any = {};
    for (const key in obj) {
      const newKey = key.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
      newObj[newKey] = obj[key];
    }
    return newObj;
  };

  const binding = toCamelCase(row) as ClientBinding;
  const previousEnabled = binding.enabled;

  updateBinding(bindingId, { enabled });

  await applyBindingChanges(binding.client);

  if (previousEnabled !== enabled) {
    const mcpDef = db.prepare('SELECT name FROM mcp_servers WHERE id = ?').get(binding.serverId) as { name: string } | undefined;
    const mcpName = mcpDef?.name || 'Unknown';

    if (enabled === 'on') {
      logActivity('binding_enabled', 'binding', bindingId, mcpName, `Enabled in ${binding.client}`);
    } else {
      logActivity('binding_disabled', 'binding', bindingId, mcpName, `Disabled in ${binding.client}`);
    }
  }
}

async function applyBindingChanges(client: string): Promise<void> {
  try {
    const adapter = getAdapter(client as ClientType);
    const allData = getAllMcpServersWithBindings();
    const servers: McpServer[] = allData.map(({ bindings: _, ...server }) => server);
    const allBindings: ClientBinding[] = allData.flatMap(d => d.bindings);
    const clientBindings = allBindings.filter(b => b.client === client);

    const config = await adapter.compile(servers, clientBindings);
    const result = await adapter.apply(config);

    if (result.success && result.filePath) {
      await updateSnapshotHashAfterApply(result.filePath, client);
    }
  } catch (e) {
    console.error(`Failed to apply binding changes for ${client}:`, e);
  }
}
