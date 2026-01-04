import { McpServer, ClientBinding, SourceSnapshot } from '../db/types';

export enum ClientType {
  CLAUDE_CODE = 'claude-code',
  OPENCODE = 'opencode',
  CODEX = 'codex',
  GEMINI_CLI = 'gemini-cli'
}

export interface AdapterCapabilities {
  supportsEnableFlag: boolean;
  supportsEnvExpansion: boolean;
  isReadOnly?: boolean;
}

export interface McpCandidate {
  server: Partial<McpServer>;
  binding: Partial<ClientBinding>;
  sourceSnapshot: SourceSnapshot;
}

export interface DiscoverResult {
  candidates: McpCandidate[];
  snapshots: SourceSnapshot[];
  warnings?: string[];
}

export interface ClientConfig {
  filePath: string;
  content: string;
  format: 'json' | 'jsonc' | 'toml';
}

export interface ApplyResult {
  success: boolean;
  filePath: string;
  backupPath?: string;
  error?: Error;
}

export interface DiscoveryOptions {
  globalConfigPath?: string;
}

export interface ApplyOptions {
  backup?: boolean;
}

export interface InstallationStatus {
  installed: boolean;
  configPath?: string;
  binaryPath?: string;
}

export interface ClientAdapter {
  type: ClientType;
  capabilities: AdapterCapabilities;
  discover(options?: DiscoveryOptions): Promise<DiscoverResult>;
  normalize(source: SourceSnapshot, rawContent: any): Promise<McpCandidate[]>;
  compile(servers: McpServer[], bindings: ClientBinding[]): Promise<ClientConfig>;
  apply(config: ClientConfig, options?: ApplyOptions): Promise<ApplyResult>;
  isInstalled(): Promise<InstallationStatus>;
  getGlobalConfigPath(): string;
}
