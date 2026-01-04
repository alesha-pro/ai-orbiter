import fs from 'fs/promises';
import { createHash } from 'crypto';
import { parse as parseJsonc } from 'jsonc-parser';
import { initDatabase } from '../db';

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Get MCP block key for each client type
function getMcpBlockKey(client: string): string {
  switch (client) {
    case 'opencode':
      return 'mcp';
    case 'claude-code':
    case 'codex':
    case 'gemini-cli':
    default:
      return 'mcpServers';
  }
}

// Hash only the MCP block from config
export function hashMcpBlock(content: string, client: string): string {
  try {
    const parsed = parseJsonc(content);
    const mcpKey = getMcpBlockKey(client);
    const mcpBlock = parsed?.[mcpKey] || {};
    // Stable stringify - sort keys for consistent hashing
    const stableStringify = (obj: any): string => {
      if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
      if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
      const keys = Object.keys(obj).sort();
      return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
    };
    return sha256(stableStringify(mcpBlock));
  } catch {
    // Fallback to full content hash if parsing fails
    return sha256(content);
  }
}

/**
 * Updates the snapshot hash and mtime in the database after applying config changes.
 * This prevents the drift detector from triggering on our own changes.
 *
 * @param filePath - Path to the config file that was modified
 * @param client - Client type (e.g., 'claude-code', 'gemini-cli')
 */
export async function updateSnapshotHashAfterApply(filePath: string, client: string): Promise<void> {
  try {
    const db = initDatabase();

    // Find snapshot by path and client
    const snapshot = db.prepare(
      'SELECT id FROM source_snapshots WHERE path = ? AND client = ?'
    ).get(filePath, client) as { id: string } | undefined;

    if (!snapshot) {
      return; // No snapshot found, nothing to update
    }

    // Read the updated file
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);

    // Calculate new hash
    const newHash = hashMcpBlock(content, client);

    // Update both hash and mtime in the database
    db.prepare(
      'UPDATE source_snapshots SET hash = ?, mtime = ? WHERE id = ?'
    ).run(newHash, stats.mtimeMs, snapshot.id);
  } catch (e) {
    // Log but don't throw - this is a non-critical operation
    console.error(`Failed to update snapshot hash for ${filePath}:`, e);
  }
}
