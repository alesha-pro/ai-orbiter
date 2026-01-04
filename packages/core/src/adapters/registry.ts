import { ClientAdapter, ClientType } from './types';
import { ClaudeCodeAdapter } from './claude-code';
import { OpenCodeAdapter } from './opencode';
import { CodexAdapter } from './codex';
import { GeminiCliAdapter } from './gemini-cli';

const adapters: Map<ClientType, ClientAdapter> = new Map();

function initializeAdapters() {
  if (adapters.size > 0) return;

  adapters.set(ClientType.CLAUDE_CODE, new ClaudeCodeAdapter());
  adapters.set(ClientType.OPENCODE, new OpenCodeAdapter());
  adapters.set(ClientType.CODEX, new CodexAdapter());
  adapters.set(ClientType.GEMINI_CLI, new GeminiCliAdapter());
}

export function getAdapter(client: ClientType): ClientAdapter {
  initializeAdapters();
  const adapter = adapters.get(client);
  if (!adapter) {
    throw new Error(`No adapter found for client type: ${client}`);
  }
  return adapter;
}

export function getAllAdapters(): ClientAdapter[] {
  initializeAdapters();
  return Array.from(adapters.values());
}
