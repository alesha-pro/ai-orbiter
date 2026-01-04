import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { modify, applyEdits } from 'jsonc-parser';
import { v4 as uuidv4 } from 'uuid';
import {
  ClientAdapter,
  ClientType,
  AdapterCapabilities,
  DiscoverResult,
  McpCandidate,
  ClientConfig,
  ApplyResult,
  DiscoveryOptions,
  ApplyOptions,
  InstallationStatus
} from './types';
import { McpServer, ClientBinding, SourceSnapshot } from '../db/types';

const execAsync = promisify(exec);

const OPENCODE_GLOBAL_CONFIG = path.join(os.homedir(), '.config', 'opencode', 'opencode.json');

export class OpenCodeAdapter implements ClientAdapter {
  type = ClientType.OPENCODE;

  capabilities: AdapterCapabilities = {
    supportsEnableFlag: true,
    supportsEnvExpansion: true
  };

  async discover(options?: DiscoveryOptions): Promise<DiscoverResult> {
    const candidates: McpCandidate[] = [];
    const snapshots: SourceSnapshot[] = [];
    const warnings: string[] = [];

    const globalPath = options?.globalConfigPath || OPENCODE_GLOBAL_CONFIG;
    try {
      const content = await fs.readFile(globalPath, 'utf-8');
      const stats = await fs.stat(globalPath);

      const snapshot: SourceSnapshot = {
        id: uuidv4(),
        client: this.type,
        path: globalPath,
        hash: '',
        mtime: stats.mtimeMs,
        scannedAt: Date.now()
      };

      try {
        const parsed = JSON.parse(content);
        const newCandidates = await this.normalize(snapshot, parsed);
        candidates.push(...newCandidates);
        snapshots.push(snapshot);
      } catch (e) {
        warnings.push(`Failed to parse config at ${globalPath}: ${e instanceof Error ? e.message : String(e)}`);
        snapshots.push(snapshot);
      }
    } catch {}

    return { candidates, snapshots, warnings };
  }

  async normalize(source: SourceSnapshot, rawContent: any): Promise<McpCandidate[]> {
    const candidates: McpCandidate[] = [];

    if (!rawContent || typeof rawContent !== 'object') {
      return candidates;
    }

    const mcpServers = rawContent.mcp || rawContent.mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return candidates;
    }

    for (const [name, config] of Object.entries(mcpServers)) {
      const serverConfig = config as any;
      const enabled = serverConfig.enabled !== false;

      let server: Partial<McpServer>;

      if (serverConfig.type === 'remote' || serverConfig.url) {
        server = {
          name,
          type: 'http',
          url: serverConfig.url,
          ...(serverConfig.headers && { headers: serverConfig.headers })
        };
      } else if (serverConfig.type === 'local' || serverConfig.command) {
        const cmdArray = Array.isArray(serverConfig.command)
          ? serverConfig.command
          : [serverConfig.command];
        const envValue = serverConfig.environment || serverConfig.env;
        server = {
          name,
          type: 'stdio',
          command: cmdArray[0] || '',
          args: cmdArray.slice(1),
          ...(envValue && { env: envValue })
        };
      } else {
        continue;
      }

      candidates.push({
        server,
        binding: {
          client: this.type,
          enabled: enabled ? 'on' : 'off'
        },
        sourceSnapshot: source
      });
    }

    return candidates;
  }

  async compile(servers: McpServer[], bindings: ClientBinding[]): Promise<ClientConfig> {
    const mcp: Record<string, any> = {};

    for (const binding of bindings) {
      if (binding.client !== this.type) continue;

      const server = servers.find(s => s.id === binding.serverId);
      if (!server) continue;

      const name = server.name;
      let opencodeConfig: any;

      if (server.type === 'http') {
        opencodeConfig = {
          type: 'remote',
          url: server.url,
          ...(server.headers && { headers: server.headers })
        };
      } else {
        const cmdArray = [server.command, ...(server.args || [])];
        opencodeConfig = {
          type: 'local',
          command: cmdArray,
          ...(server.env && { environment: server.env })
        };
      }

      opencodeConfig.enabled = binding.enabled !== 'off';
      mcp[name] = opencodeConfig;
    }

    return {
      filePath: OPENCODE_GLOBAL_CONFIG,
      content: JSON.stringify({ mcp }, null, 2),
      format: 'json'
    };
  }

  async apply(config: ClientConfig, options?: ApplyOptions): Promise<ApplyResult> {
    try {
      let originalContent = '{}';
      try {
        originalContent = await fs.readFile(config.filePath, 'utf-8');
      } catch {}

      if (options?.backup && originalContent !== '{}') {
        try {
          const { createBackup } = await import('../backup');
          createBackup(config.filePath);
        } catch {}
      }

      const newConfig = JSON.parse(config.content);
      const mcp = newConfig.mcp;

      const edits = modify(originalContent, ['mcp'], mcp, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
      const newContent = applyEdits(originalContent, edits);

      await fs.mkdir(path.dirname(config.filePath), { recursive: true });
      await fs.writeFile(config.filePath, newContent, 'utf-8');

      return { success: true, filePath: config.filePath };
    } catch (e) {
      return {
        success: false,
        filePath: config.filePath,
        error: e instanceof Error ? e : new Error(String(e))
      };
    }
  }

  async isInstalled(): Promise<InstallationStatus> {
    const result: InstallationStatus = { installed: false };

    try {
      const { stdout } = await execAsync('which opencode');
      if (stdout.trim()) {
        result.binaryPath = stdout.trim();
      }
    } catch {}

    try {
      await fs.access(OPENCODE_GLOBAL_CONFIG);
      result.configPath = OPENCODE_GLOBAL_CONFIG;
    } catch {}

    result.installed = !!(result.binaryPath || result.configPath);
    return result;
  }

  getGlobalConfigPath(): string {
    return OPENCODE_GLOBAL_CONFIG;
  }
}
