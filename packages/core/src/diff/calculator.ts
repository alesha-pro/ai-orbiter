import { McpServer, ClientBinding } from '../db/types';

export interface Change {
  type: 'add' | 'remove' | 'modify';
  serverId: string;
  bindingId?: string;
  before?: any;
  after?: any;
}

export interface DiffEntry {
  client: string;
  filePath: string;
  changes: Change[];
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: {
    totalChanges: number;
    added: number;
    removed: number;
    modified: number;
  };
}

export interface RegistryState {
  servers: McpServer[];
  bindings: ClientBinding[];
}

export function calculateDiff(
  currentState: RegistryState,
  desiredState: RegistryState
): DiffResult {
  const entries: DiffEntry[] = [];
  let totalChanges = 0;
  let added = 0;
  let removed = 0;
  let modified = 0;

  const currentByClient = groupBindingsByClient(currentState.bindings);
  const desiredByClient = groupBindingsByClient(desiredState.bindings);

  const allClients = new Set([...currentByClient.keys(), ...desiredByClient.keys()]);

  for (const client of allClients) {
    const currentBindings = currentByClient.get(client) || [];
    const desiredBindings = desiredByClient.get(client) || [];

    const changes = calculateBindingChanges(
      currentBindings,
      desiredBindings
    );

    if (changes.length > 0) {
      entries.push({
        client,
        filePath: '',
        changes
      });

      totalChanges += changes.length;
      for (const change of changes) {
        if (change.type === 'add') added++;
        else if (change.type === 'remove') removed++;
        else if (change.type === 'modify') modified++;
      }
    }
  }

  return {
    entries,
    summary: {
      totalChanges,
      added,
      removed,
      modified
    }
  };
}

function groupBindingsByClient(bindings: ClientBinding[]): Map<string, ClientBinding[]> {
  const map = new Map<string, ClientBinding[]>();
  
  for (const binding of bindings) {
    const key = binding.client;
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(binding);
  }
  
  return map;
}

function calculateBindingChanges(
  currentBindings: ClientBinding[],
  desiredBindings: ClientBinding[]
): Change[] {
  const changes: Change[] = [];

  const currentById = new Map(currentBindings.map(b => [b.id, b]));
  const desiredById = new Map(desiredBindings.map(b => [b.id, b]));

  for (const current of currentBindings) {
    if (!desiredById.has(current.id)) {
      changes.push({
        type: 'remove',
        serverId: current.serverId,
        bindingId: current.id,
        before: current
      });
    }
  }

  for (const desired of desiredBindings) {
    const current = currentById.get(desired.id);
    
    if (!current) {
      changes.push({
        type: 'add',
        serverId: desired.serverId,
        bindingId: desired.id,
        after: desired
      });
    } else {
      if (current.enabled !== desired.enabled) {
        changes.push({
          type: 'modify',
          serverId: desired.serverId,
          bindingId: desired.id,
          before: current,
          after: desired
        });
      }
    }
  }

  return changes;
}
