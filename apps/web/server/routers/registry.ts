import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import {
  getMcpServerById,
  getEffectiveConfigForClient
} from '@ai-orbiter/core/src/registry/query';
import { detectConflicts } from '@ai-orbiter/core/src/registry/conflicts';
import { updateBindingEnabled } from '@ai-orbiter/core/src/registry/bindings';
import { rebuildRegistry } from '@ai-orbiter/core/src/registry/rebuild';
import { getAllAdapters, getAdapter } from '@ai-orbiter/core/src/adapters/registry';
import { ClientType } from '@ai-orbiter/core/src/adapters/types';
import { initDatabase } from '@ai-orbiter/core/src/db';
import type { McpServer, ClientBinding } from '@ai-orbiter/core/src/db/types';
import {
  logActivity,
  getRecentActivities,
  getAllMcpServersWithBindings,
  updateMcpServer,
  deleteOrphanedServers,
  insertMcpServer,
  deleteMcpServer,
  insertClientBinding,
  deleteBinding
} from '@ai-orbiter/core/src/db/dal';
import { calculateFingerprint } from '@ai-orbiter/core/src/fingerprint';
import { updateSnapshotHashAfterApply } from '@ai-orbiter/core/src/drift/snapshot-utils';

let registryInitialized = false;

function serverToLegacyFormat(server: McpServer & { bindings: ClientBinding[] }) {
  const endpoint: Record<string, unknown> = {};
  
  if (server.type === 'stdio') {
    endpoint.command = server.command;
    if (server.args) endpoint.args = server.args;
    if (server.cwd) endpoint.cwd = server.cwd;
    if (server.env) endpoint.env = server.env;
  } else {
    endpoint.url = server.url;
    if (server.headers) endpoint.headers = server.headers;
  }

  return {
    id: server.id,
    displayName: server.name,
    transport: server.type === 'http' ? 'http' : server.type,
    endpoint: JSON.stringify(endpoint),
    tags: server.tags,
    fingerprint: server.fingerprint,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    bindings: server.bindings.map(b => ({
      id: b.id,
      mcpDefinitionId: b.serverId,
      client: b.client,
      scope: 'global',
      clientServerName: server.name,
      enabled: b.enabled,
      clientSpecific: null,
      originSnapshotId: null,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt
    }))
  };
}

function parseEndpointToServerFields(transport: string, endpointJson: string) {
  const parsed = JSON.parse(endpointJson);
  
  if (transport === 'stdio') {
    return {
      type: 'stdio' as const,
      command: parsed.command || null,
      args: Array.isArray(parsed.args) ? parsed.args : null,
      cwd: parsed.cwd || null,
      url: null,
      headers: null,
      env: parsed.env || null
    };
  } else {
    return {
      type: 'http' as const,
      command: null,
      args: null,
      cwd: null,
      url: parsed.url || null,
      headers: parsed.headers || null,
      env: null
    };
  }
}

export const registryRouter = router({
  listMcpDefinitions: publicProcedure.query(async () => {
    if (!registryInitialized) {
      const existing = getAllMcpServersWithBindings();
      if (existing.length === 0) {
        await rebuildRegistry();
      }
      registryInitialized = true;
    }
    return getAllMcpServersWithBindings().map(serverToLegacyFormat);
  }),

  getMcpById: publicProcedure.input(z.string()).query(({ input }) => {
    const server = getMcpServerById(input);
    return server ? serverToLegacyFormat(server) : undefined;
  }),

  getConflicts: publicProcedure.query(() => {
    const servers = getAllMcpServersWithBindings();
    return detectConflicts(servers);
  }),

  getEffectiveConfig: publicProcedure.input(z.string()).query(({ input: client }) => {
    return getEffectiveConfigForClient(client);
  }),

  createMcpDefinition: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(1, 'Название обязательно'),
        transport: z.enum(['stdio', 'http', 'sse']),
        endpoint: z.string(),
        tags: z.array(z.string()).optional()
      })
    )
    .mutation(async ({ input }) => {
      const existingServers = getAllMcpServersWithBindings();
      const duplicate = existingServers.find(
        m => m.name.toLowerCase() === input.displayName.toLowerCase()
      );
      if (duplicate) {
        throw new Error(`MCP с названием "${input.displayName}" уже существует`);
      }

      let endpointObj: unknown;
      try {
        endpointObj = JSON.parse(input.endpoint);
      } catch {
        throw new Error('Некорректный JSON в конфигурации');
      }

      const parsed = endpointObj as Record<string, unknown>;
      
      if (input.transport === 'stdio') {
        if (!parsed.command || typeof parsed.command !== 'string' || (parsed.command as string).trim() === '') {
          throw new Error('Поле "command" обязательно для STDIO транспорта');
        }
        if (parsed.args !== undefined && !Array.isArray(parsed.args)) {
          throw new Error('Поле "args" должно быть массивом');
        }
        if (parsed.env !== undefined && (typeof parsed.env !== 'object' || Array.isArray(parsed.env))) {
          throw new Error('Поле "env" должно быть объектом');
        }
      } else if (input.transport === 'http' || input.transport === 'sse') {
        if (!parsed.url || typeof parsed.url !== 'string' || (parsed.url as string).trim() === '') {
          throw new Error('Поле "url" обязательно для HTTP/SSE транспорта');
        }
        try {
          new URL(parsed.url as string);
        } catch {
          throw new Error('Некорректный формат URL');
        }
        if (parsed.headers !== undefined && (typeof parsed.headers !== 'object' || Array.isArray(parsed.headers))) {
          throw new Error('Поле "headers" должно быть объектом');
        }
      }

      const serverFields = parseEndpointToServerFields(input.transport, input.endpoint);
      const fingerprint = calculateFingerprint(serverFields);

      const existingByFingerprint = existingServers.find(m => m.fingerprint === fingerprint);
      if (existingByFingerprint) {
        throw new Error(`MCP с такой конфигурацией уже существует: "${existingByFingerprint.name}"`);
      }

      const mcpId = insertMcpServer({
        name: input.displayName,
        ...serverFields,
        tags: input.tags || null,
        fingerprint
      });

      logActivity('server_created', 'server', mcpId, input.displayName, `Created MCP server (${input.transport})`);

      return { success: true, mcpId, displayName: input.displayName };
    }),

  updateBindingEnabled: publicProcedure
    .input(
      z.object({
        bindingId: z.string(),
        enabled: z.enum(['inherit', 'on', 'off'])
      })
    )
    .mutation(async ({ input }) => {
      const effectiveEnabled = input.enabled === 'inherit' ? 'on' : input.enabled;
      await updateBindingEnabled(input.bindingId, effectiveEnabled);
      return { success: true };
    }),

  updateMcpConfig: publicProcedure
    .input(
      z.object({
        mcpId: z.string(),
        displayName: z.string().optional(),
        transport: z.enum(['stdio', 'http', 'sse']).optional(),
        endpoint: z.string(),
        tags: z.array(z.string()).optional()
      })
    )
    .mutation(async ({ input }) => {
      const server = getMcpServerById(input.mcpId);
      if (!server) {
        throw new Error(`MCP server not found: ${input.mcpId}`);
      }

      try {
        JSON.parse(input.endpoint);
      } catch {
        throw new Error('Invalid JSON in endpoint configuration');
      }

      const transport = input.transport || server.type;
      const serverFields = parseEndpointToServerFields(transport, input.endpoint);
      const fingerprint = calculateFingerprint(serverFields);

      updateMcpServer(input.mcpId, {
        name: input.displayName || server.name,
        ...serverFields,
        tags: input.tags || server.tags,
        fingerprint
      });

      const bindings = server.bindings || [];
      const clients = new Set(bindings.map(b => b.client));

      const allServers = getAllMcpServersWithBindings();
      const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);

      for (const client of clients) {
        try {
          const adapter = getAdapter(client as ClientType);
          const clientBindings = allBindings.filter(b => b.client === client);
          const config = await adapter.compile(allServers, clientBindings);
          const result = await adapter.apply(config);

          if (result.success && result.filePath) {
            await updateSnapshotHashAfterApply(result.filePath, client);
          }
        } catch (e) {
          console.error(`Failed to apply config to ${client}:`, e);
        }
      }

      logActivity('server_updated', 'server', input.mcpId, input.displayName || server.name, 'Конфигурация обновлена');

      return { success: true };
    }),

  listInstalledClients: publicProcedure.query(async () => {
    const adapters = getAllAdapters();
    const results = await Promise.all(
      adapters.map(async (adapter) => {
        const status = await adapter.isInstalled();
        return {
          client: adapter.type,
          ...status,
          capabilities: adapter.capabilities
        };
      })
    );
    return results.filter(r => r.installed);
  }),

  createBinding: publicProcedure
    .input(
      z.object({
        mcpDefinitionId: z.string(),
        client: z.string(),
        scope: z.string().default('global'),
        enabled: z.enum(['on', 'off']).default('on')
      })
    )
    .mutation(async ({ input }) => {
      const db = initDatabase();

      const server = getMcpServerById(input.mcpDefinitionId);
      if (!server) {
        throw new Error(`MCP server not found: ${input.mcpDefinitionId}`);
      }

      const existingBinding = db.prepare(`
        SELECT id FROM client_bindings 
        WHERE server_id = ? AND client = ?
      `).get(input.mcpDefinitionId, input.client) as { id: string } | undefined;

      if (existingBinding) {
        db.prepare(`
          UPDATE client_bindings SET enabled = ?, updated_at = ? WHERE id = ?
        `).run(input.enabled, Date.now(), existingBinding.id);

        const adapter = getAdapter(input.client as ClientType);
        const allServers = getAllMcpServersWithBindings();
        const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);
        const clientBindings = allBindings.filter(b => b.client === input.client);
        const config = await adapter.compile(allServers, clientBindings);
        const result = await adapter.apply(config, { backup: true });
        if (result.success && result.filePath) {
          await updateSnapshotHashAfterApply(result.filePath, input.client);
        }
        return { success: true, bindingId: existingBinding.id, wasExisting: true };
      }

      const bindingId = insertClientBinding({
        serverId: input.mcpDefinitionId,
        client: input.client,
        enabled: input.enabled
      });

      const adapter = getAdapter(input.client as ClientType);
      const allServers = getAllMcpServersWithBindings();
      const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);
      const clientBindings = allBindings.filter(b => b.client === input.client);
      const config = await adapter.compile(allServers, clientBindings);
      const result = await adapter.apply(config, { backup: true });

      if (result.success && result.filePath) {
        await updateSnapshotHashAfterApply(result.filePath, input.client);
      }

      logActivity('binding_created', 'binding', bindingId, server.name, `Добавлен в ${input.client}`);

      return { success: true, bindingId };
    }),

  deleteDuplicateBindings: publicProcedure.mutation(async () => {
    const db = initDatabase();

    const duplicates = db.prepare(`
      SELECT id, server_id, client, created_at
      FROM client_bindings
      WHERE (server_id, client) IN (
        SELECT server_id, client
        FROM client_bindings
        GROUP BY server_id, client
        HAVING COUNT(*) > 1
      )
      ORDER BY server_id, client, created_at ASC
    `).all() as Array<{ id: string; server_id: string; client: string; created_at: number }>;

    const toDelete: string[] = [];
    const seen = new Set<string>();

    for (const row of duplicates) {
      const key = `${row.server_id}:${row.client}`;
      if (seen.has(key)) {
        toDelete.push(row.id);
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => '?').join(',');
      db.prepare(`DELETE FROM client_bindings WHERE id IN (${placeholders})`).run(...toDelete);
    }

    return { success: true, deletedCount: toDelete.length };
  }),

  cleanupDuplicates: publicProcedure.mutation(async () => {
    const orphansDeleted = deleteOrphanedServers();

    logActivity('cleanup', 'server', null, null,
      `Удалено: ${orphansDeleted} неиспользуемых серверов`);

    return {
      success: true,
      merged: 0,
      deleted: 0,
      orphansDeleted
    };
  }),

  deleteMcpDefinition: publicProcedure
    .input(z.string())
    .mutation(async ({ input: mcpId }) => {
      const server = getMcpServerById(mcpId);
      if (!server) {
        throw new Error(`MCP server not found: ${mcpId}`);
      }

      const db = initDatabase();
      db.prepare('DELETE FROM client_bindings WHERE server_id = ?').run(mcpId);
      deleteMcpServer(mcpId);

      // Apply changes to all installed clients
      const adapters = getAllAdapters();
      const allServers = getAllMcpServersWithBindings();
      const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);

      for (const adapter of adapters) {
        try {
          const status = await adapter.isInstalled();
          if (!status.installed) continue;

          const clientBindings = allBindings.filter(b => b.client === adapter.type);
          const config = await adapter.compile(allServers, clientBindings);
          const result = await adapter.apply(config);

          if (result.success && result.filePath) {
            await updateSnapshotHashAfterApply(result.filePath, adapter.type);
          }
        } catch (e) {
          console.error(`Failed to apply config to ${adapter.type}:`, e);
        }
      }

      logActivity('server_deleted', 'server', mcpId, server.name, null);

      return { success: true, deletedId: mcpId, displayName: server.name };
    }),

  deleteBinding: publicProcedure
    .input(z.string())
    .mutation(async ({ input: bindingId }) => {
      const db = initDatabase();

      const binding = db.prepare(`
        SELECT cb.*, s.name as server_name
        FROM client_bindings cb
        LEFT JOIN mcp_servers s ON cb.server_id = s.id
        WHERE cb.id = ?
      `).get(bindingId) as { client: string; server_name: string | null } | undefined;
      if (!binding) {
        throw new Error(`Binding not found: ${bindingId}`);
      }

      const serverName = binding.server_name;

      deleteBinding(bindingId);

      const adapter = getAdapter(binding.client as ClientType);
      const allServers = getAllMcpServersWithBindings();
      const allBindings: ClientBinding[] = allServers.flatMap(s => s.bindings);
      const clientBindings = allBindings.filter(b => b.client === binding.client);
      const config = await adapter.compile(allServers, clientBindings);
      const result = await adapter.apply(config);

      if (result.success && result.filePath) {
        await updateSnapshotHashAfterApply(result.filePath, binding.client);
      }

      logActivity('binding_deleted', 'binding', bindingId, serverName, `Удалён из ${binding.client}`);

      return { success: true };
    }),

  getActivities: publicProcedure
    .input(z.number().optional().default(20))
    .query(({ input: limit }) => {
      return getRecentActivities(limit);
    }),

  getRecentMcps: publicProcedure
    .input(z.number().optional().default(10))
    .query(({ input: limit }) => {
      const servers = getAllMcpServersWithBindings();
      const sorted = servers.sort((a, b) => b.updatedAt - a.updatedAt);
      return sorted.slice(0, limit).map(serverToLegacyFormat);
    }),

  openFolder: publicProcedure
    .input(z.string())
    .mutation(async ({ input: folderPath }) => {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const { dirname } = await import('path');
      const { homedir } = await import('os');
      const execAsync = promisify(exec);

      const expandedPath = folderPath.startsWith('~') 
        ? folderPath.replace('~', homedir())
        : folderPath;

      const dirPath = expandedPath.includes('.') ? dirname(expandedPath) : expandedPath;

      try {
        await execAsync(`open "${dirPath}"`);
        return { success: true, path: dirPath };
      } catch (e) {
        throw new Error(`Failed to open folder: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
});
