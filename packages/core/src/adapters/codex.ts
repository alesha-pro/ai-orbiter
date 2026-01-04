import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import toml from '@iarna/toml';
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

export class CodexAdapter implements ClientAdapter {
  type = ClientType.CODEX;

  capabilities: AdapterCapabilities = {
    supportsEnableFlag: true,
    supportsEnvExpansion: true
  };

  private getGlobalPath(options?: DiscoveryOptions): string {
    if (options?.globalConfigPath) return options.globalConfigPath;
    const codexHome = process.env.CODEX_HOME;
    if (codexHome) {
      return path.join(codexHome, 'config.toml');
    }
    return path.join(os.homedir(), '.codex', 'config.toml');
  }

  async discover(options?: DiscoveryOptions): Promise<DiscoverResult> {
    const candidates: McpCandidate[] = [];
    const snapshots: SourceSnapshot[] = [];
    const warnings: string[] = [];

    const globalPath = this.getGlobalPath(options);
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
        const parsed = toml.parse(content);
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

    const mcpServers = rawContent.mcp_servers || rawContent.mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return candidates;
    }

    for (const [name, config] of Object.entries(mcpServers)) {
      const serverConfig = config as any;
      const enabled = serverConfig.enabled !== false;

      let server: Partial<McpServer>;

      if (serverConfig.url) {
        const headers: Record<string, string> = {};
        if (serverConfig.http_headers) {
          Object.assign(headers, serverConfig.http_headers);
        } else if (serverConfig.headers) {
          Object.assign(headers, serverConfig.headers);
        }

        server = {
          name,
          type: 'http',
          url: serverConfig.url,
          ...(Object.keys(headers).length > 0 && { headers })
        };
      } else if (serverConfig.command) {
        server = {
          name,
          type: 'stdio',
          command: serverConfig.command,
          ...(serverConfig.args && { args: serverConfig.args }),
          ...(serverConfig.cwd && { cwd: serverConfig.cwd }),
          ...(serverConfig.env && { env: serverConfig.env })
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
    const mcpServers: Record<string, any> = {};
    let needsRmcpClient = false;

    for (const binding of bindings) {
      if (binding.client !== this.type) continue;

      const server = servers.find(s => s.id === binding.serverId);
      if (!server) continue;

      const name = server.name;
      let config: any;

      if (server.type === 'http') {
        needsRmcpClient = true;
        config = {
          url: server.url,
          enabled: binding.enabled !== 'off'
        };
        if (server.headers) {
          config.http_headers = {
            ...server.headers,
            Accept: server.headers.Accept || 'application/json, text/event-stream'
          };
        } else {
          config.http_headers = { Accept: 'application/json, text/event-stream' };
        }
      } else {
        config = {
          command: server.command,
          enabled: binding.enabled !== 'off'
        };
        if (server.args) config.args = server.args;
        if (server.cwd) config.cwd = server.cwd;
        if (server.env) config.env = server.env;
      }

      mcpServers[name] = config;
    }

    const configObj: any = { mcp_servers: mcpServers };
    if (needsRmcpClient) {
      configObj.experimental_use_rmcp_client = true;
    }

    return {
      filePath: this.getGlobalPath(),
      content: toml.stringify(configObj),
      format: 'toml'
    };
  }

  async apply(config: ClientConfig, options?: ApplyOptions): Promise<ApplyResult> {
    try {
      let originalContent = '';
      let parsedOriginal: any = {};
      try {
        originalContent = await fs.readFile(config.filePath, 'utf-8');
        parsedOriginal = toml.parse(originalContent);
      } catch {
        parsedOriginal = {};
      }

      if (options?.backup && originalContent !== '') {
        try {
          const { createBackup } = await import('../backup');
          createBackup(config.filePath);
        } catch {}
      }

      const newConfig = toml.parse(config.content);
      parsedOriginal.mcp_servers = newConfig.mcp_servers;

      if (newConfig.experimental_use_rmcp_client !== undefined) {
        parsedOriginal.experimental_use_rmcp_client = newConfig.experimental_use_rmcp_client;
      }

      const newContent = toml.stringify(parsedOriginal);

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
    const globalPath = this.getGlobalPath();

    try {
      const { stdout } = await execAsync('which codex');
      if (stdout.trim()) {
        result.binaryPath = stdout.trim();
      }
    } catch {}

    try {
      await fs.access(globalPath);
      result.configPath = globalPath;
    } catch {}

    result.installed = !!(result.binaryPath || result.configPath);
    return result;
  }

  getGlobalConfigPath(): string {
    return this.getGlobalPath();
  }
}
