import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { parse, modify, applyEdits } from 'jsonc-parser';
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

const GEMINI_GLOBAL_CONFIG = path.join(os.homedir(), '.gemini', 'settings.json');

export class GeminiCliAdapter implements ClientAdapter {
  type = ClientType.GEMINI_CLI;

  capabilities: AdapterCapabilities = {
    supportsEnableFlag: true,
    supportsEnvExpansion: true
  };

  async discover(options?: DiscoveryOptions): Promise<DiscoverResult> {
    const candidates: McpCandidate[] = [];
    const snapshots: SourceSnapshot[] = [];
    const warnings: string[] = [];

    const globalPath = options?.globalConfigPath || GEMINI_GLOBAL_CONFIG;
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
        const parsed = parse(content);
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

    const mcpServers = rawContent.mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return candidates;
    }

    const mcpConfig = rawContent.mcp;
    const allowedList = mcpConfig?.allowed as string[] | undefined;
    const excludedList = mcpConfig?.excluded as string[] | undefined;

    for (const [name, config] of Object.entries(mcpServers)) {
      const serverConfig = config as any;

      let enabled = serverConfig.enabled !== false;
      if (allowedList && Array.isArray(allowedList)) {
        enabled = allowedList.includes(name);
      } else if (excludedList && Array.isArray(excludedList)) {
        if (excludedList.includes(name)) {
          enabled = false;
        }
      }

      let server: Partial<McpServer>;

      const httpUrl = serverConfig.httpUrl || serverConfig.url;
      if (httpUrl) {
        server = {
          name,
          type: 'http',
          url: httpUrl,
          ...(serverConfig.headers && { headers: serverConfig.headers })
        };
      } else if (serverConfig.command) {
        server = {
          name,
          type: 'stdio',
          command: serverConfig.command,
          ...(serverConfig.args && { args: serverConfig.args }),
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
    const excluded: string[] = [];

    for (const binding of bindings) {
      if (binding.client !== this.type) continue;

      const server = servers.find(s => s.id === binding.serverId);
      if (!server) continue;

      const name = server.name;

      if (server.type === 'http') {
        mcpServers[name] = {
          url: server.url,
          ...(server.headers && { headers: server.headers })
        };
      } else {
        mcpServers[name] = {
          command: server.command,
          ...(server.args && { args: server.args }),
          ...(server.env && { env: server.env })
        };
      }

      if (binding.enabled === 'off') {
        excluded.push(name);
      }
    }

    const configObj: any = { mcpServers };
    if (excluded.length > 0) {
      configObj.mcp = { excluded };
    }

    return {
      filePath: GEMINI_GLOBAL_CONFIG,
      content: JSON.stringify(configObj, null, 2),
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
      const mcpServers = newConfig.mcpServers;
      const mcpConfig = newConfig.mcp;

      let edits = modify(originalContent, ['mcpServers'], mcpServers, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
      let newContent = applyEdits(originalContent, edits);

      if (mcpConfig) {
        edits = modify(newContent, ['mcp'], mcpConfig, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
        newContent = applyEdits(newContent, edits);
      } else {
        const parsed = parse(newContent);
        if (parsed && typeof parsed === 'object' && 'mcp' in parsed) {
          edits = modify(newContent, ['mcp'], undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
          newContent = applyEdits(newContent, edits);
        }
      }

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
      const { stdout } = await execAsync('which gemini');
      if (stdout.trim()) {
        result.binaryPath = stdout.trim();
      }
    } catch {}

    try {
      await fs.access(GEMINI_GLOBAL_CONFIG);
      result.configPath = GEMINI_GLOBAL_CONFIG;
    } catch {}

    result.installed = !!(result.binaryPath || result.configPath);
    return result;
  }

  getGlobalConfigPath(): string {
    return GEMINI_GLOBAL_CONFIG;
  }
}
