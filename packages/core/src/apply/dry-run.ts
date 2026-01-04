import { DiffResult } from '../diff/calculator';
import { getAdapter } from '../adapters/registry';
import { McpServer, ClientBinding } from '../db/types';
import { ClientType } from '../adapters/types';

export interface FilePreview {
  filePath: string;
  client: string;
  beforeContent: string;
  afterContent: string;
}

export async function dryRunApply(
  diff: DiffResult,
  allServers: McpServer[],
  allBindings: ClientBinding[]
): Promise<FilePreview[]> {
  const previews: FilePreview[] = [];

  for (const entry of diff.entries) {
    const adapter = getAdapter(entry.client as ClientType);

    const relevantBindings = allBindings.filter(b => b.client === entry.client);

    const config = await adapter.compile(allServers, relevantBindings);

    previews.push({
      filePath: config.filePath,
      client: entry.client,
      beforeContent: '',
      afterContent: config.content
    });
  }

  return previews;
}
