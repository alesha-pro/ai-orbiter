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

const CLAUDE_GLOBAL_CONFIG = path.join(os.homedir(), '.claude.json');

export class ClaudeCodeAdapter implements ClientAdapter {
  type = ClientType.CLAUDE_CODE;

  capabilities: AdapterCapabilities = {
    supportsEnableFlag: true,
    supportsEnvExpansion: true
  };

  async discover(options?: DiscoveryOptions): Promise<DiscoverResult> {
    const candidates: McpCandidate[] = [];
    const snapshots: SourceSnapshot[] = [];
    const warnings: string[] = [];

    const globalPath = options?.globalConfigPath || CLAUDE_GLOBAL_CONFIG;
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

    const projects = rawContent.projects && typeof rawContent.projects === 'object'
      ? rawContent.projects
      : {};
    
    const projectPaths = Object.keys(projects);
    const disabledInProjects = new Map<string, number>();
    
    for (const projectPath of projectPaths) {
      const project = projects[projectPath];
      if (!project || typeof project !== 'object') continue;
      
      const projectDisabled: string[] = Array.isArray(project.disabledMcpServers)
        ? project.disabledMcpServers
        : [];
      
      for (const serverName of projectDisabled) {
        disabledInProjects.set(serverName, (disabledInProjects.get(serverName) || 0) + 1);
      }
    }
    
    const totalProjects = projectPaths.length;
    const disabledServers: string[] = [];
    
    for (const [serverName, disabledCount] of disabledInProjects) {
      if (totalProjects === 0 || disabledCount >= totalProjects) {
        disabledServers.push(serverName);
      }
    }

    for (const [name, config] of Object.entries(mcpServers)) {
      const serverConfig = config as any;

      let server: Partial<McpServer>;

      if (serverConfig.command) {
        server = {
          name,
          type: 'stdio',
          command: serverConfig.command,
          ...(serverConfig.args && { args: serverConfig.args }),
          ...(serverConfig.cwd && { cwd: serverConfig.cwd }),
          ...(serverConfig.env && { env: serverConfig.env })
        };
      } else if (serverConfig.url) {
        server = {
          name,
          type: 'http',
          url: serverConfig.url,
          ...(serverConfig.headers && { headers: serverConfig.headers }),
          ...(serverConfig.env && { env: serverConfig.env })
        };
      } else {
        continue;
      }

      const isDisabled = disabledServers.includes(name);

      candidates.push({
        server,
        binding: {
          client: this.type,
          enabled: isDisabled ? 'off' : 'on'
        },
        sourceSnapshot: source
      });
    }

    return candidates;
  }

  async compile(servers: McpServer[], bindings: ClientBinding[]): Promise<ClientConfig> {
    const filePath = CLAUDE_GLOBAL_CONFIG;

    const mcpServers: Record<string, any> = {};
    const serversToDisable: string[] = [];
    const serversToEnable: string[] = [];

    for (const binding of bindings) {
      if (binding.client !== this.type) continue;

      const server = servers.find(s => s.id === binding.serverId);
      if (!server) continue;

      const name = server.name;

      if (server.type === 'stdio') {
        mcpServers[name] = {
          command: server.command,
          ...(server.args && { args: server.args }),
          ...(server.cwd && { cwd: server.cwd }),
          ...(server.env && { env: server.env })
        };
      } else if (server.type === 'http') {
        mcpServers[name] = {
          url: server.url,
          type: 'http',
          ...(server.headers && { headers: server.headers }),
          ...(server.env && { env: server.env })
        };
      }

      if (binding.enabled === 'off') {
        serversToDisable.push(name);
      } else {
        serversToEnable.push(name);
      }
    }

    const configObj = {
      mcpServers,
      serversToDisable,
      serversToEnable
    };

    return {
      filePath,
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
      const mcpServers = newConfig.mcpServers || {};
      const serversToDisable: string[] = newConfig.serversToDisable || [];
      const serversToEnable: string[] = newConfig.serversToEnable || [];

      let parsed: any = {};
      try {
        parsed = parse(originalContent);
      } catch {
        parsed = {};
      }

      let newContent = originalContent;

      // Full replacement instead of merge — deleted servers will be removed from file
      let edits = modify(originalContent, ['mcpServers'], mcpServers, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
      newContent = applyEdits(originalContent, edits);

      const projects = parsed?.projects && typeof parsed.projects === 'object'
        ? { ...parsed.projects }
        : {};

      for (const projectPath of Object.keys(projects)) {
        const project = projects[projectPath];
        if (!project || typeof project !== 'object') continue;

        let disabledList: string[] = Array.isArray(project.disabledMcpServers)
          ? [...project.disabledMcpServers]
          : [];

        for (const server of serversToDisable) {
          if (!disabledList.includes(server)) {
            disabledList.push(server);
          }
        }

        disabledList = disabledList.filter(s => !serversToEnable.includes(s));

        const knownServers = Object.keys(mcpServers);
        disabledList = disabledList.filter(s => knownServers.includes(s));

        projects[projectPath] = {
          ...project,
          disabledMcpServers: disabledList
        };
      }

      edits = modify(newContent, ['projects'], projects, { formattingOptions: { insertSpaces: true, tabSize: 2 } });
      newContent = applyEdits(newContent, edits);

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
      const { stdout } = await execAsync('which claude');
      if (stdout.trim()) {
        result.binaryPath = stdout.trim();
      }
    } catch {}

    try {
      await fs.access(CLAUDE_GLOBAL_CONFIG);
      result.configPath = CLAUDE_GLOBAL_CONFIG;
    } catch {}

    result.installed = !!(result.binaryPath || result.configPath);
    return result;
  }

  getGlobalConfigPath(): string {
    return CLAUDE_GLOBAL_CONFIG;
  }
}
