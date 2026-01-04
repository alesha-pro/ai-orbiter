export type McpServerType = 'stdio' | 'http';

export interface McpServer {
  id: string;
  name: string;
  type: McpServerType;
  command: string | null;
  args: string[] | null;
  cwd: string | null;
  url: string | null;
  headers: Record<string, string> | null;
  env: Record<string, string> | null;
  tags: string[] | null;
  fingerprint: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClientBinding {
  id: string;
  serverId: string;
  client: string;
  enabled: 'on' | 'off';
  createdAt: number;
  updatedAt: number;
}

export interface SourceSnapshot {
  id: string;
  client: string;
  path: string;
  hash: string;
  mtime: number;
  scannedAt: number;
}

export type ActivityAction =
  | 'server_created'
  | 'server_updated'
  | 'server_deleted'
  | 'binding_created'
  | 'binding_deleted'
  | 'binding_enabled'
  | 'binding_disabled'
  | 'drift_detected'
  | 'drift_resolved'
  | 'scan_completed'
  | 'cleanup';

export type ActivityEntityType = 'server' | 'binding' | 'drift' | 'scan';

export interface ActivityLog {
  id: string;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string | null;
  entityName: string | null;
  details: string | null;
  createdAt: number;
}
