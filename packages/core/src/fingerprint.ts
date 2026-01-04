import { createHash } from 'crypto';
import type { McpServer } from './db/types';

function sortedStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(sortedStringify).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const sorted = Object.keys(obj as object)
      .sort()
      .map(key => `${JSON.stringify(key)}:${sortedStringify((obj as Record<string, unknown>)[key])}`);
    return '{' + sorted.join(',') + '}';
  }
  return JSON.stringify(obj);
}

const IGNORED_HEADERS = ['accept', 'content-type', 'user-agent'];

function normalizeHeaders(headers: Record<string, string> | null | undefined): Record<string, string> | null {
  if (!headers || Object.keys(headers).length === 0) {
    return null;
  }
  
  const filtered: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(headers)) {
    if (!IGNORED_HEADERS.includes(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  
  return Object.keys(filtered).length > 0 ? filtered : null;
}

export function calculateFingerprint(server: Partial<McpServer>): string {
  const hash = createHash('sha256');

  const data = {
    type: server.type ?? null,
    command: server.command ?? null,
    args: server.args ?? null,
    cwd: server.cwd ?? null,
    url: server.url ?? null,
    headers: normalizeHeaders(server.headers),
    env: server.env ?? null
  };

  hash.update(sortedStringify(data));
  return hash.digest('hex');
}
