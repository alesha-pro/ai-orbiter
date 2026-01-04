'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  RefreshCw,
  Server,
  Settings2,
  AlertTriangle,
  History,
  FolderOpen,
  Terminal,
  FileCode,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Link as LinkIcon,
  Unlink,
  AlertCircle
} from 'lucide-react';
import { useState } from 'react';
import { AddMcpDialog } from '@/components/AddMcpDialog';

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const mcpQuery = trpc.registry.listMcpDefinitions.useQuery();
  const conflictQuery = trpc.registry.getConflicts.useQuery();
  const clientsQuery = trpc.registry.listInstalledClients.useQuery();
  const activitiesQuery = trpc.registry.getActivities.useQuery(10);
  const openFolderMutation = trpc.registry.openFolder.useMutation();

  const scanMutation = trpc.scan.globalScan.useMutation({
    onSuccess: () => {
      mcpQuery.refetch();
      conflictQuery.refetch();
      clientsQuery.refetch();
      activitiesQuery.refetch();
      setIsScanning(false);
    },
    onSettled: () => {
      setIsScanning(false);
    }
  });

  const handleScan = () => {
    setIsScanning(true);
    scanMutation.mutate({});
  };

  const handleOpenFolder = (path: string | undefined) => {
    if (path) {
      openFolderMutation.mutate(path);
    }
  };

  const toggleClientExpanded = (client: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(client)) {
        next.delete(client);
      } else {
        next.add(client);
      }
      return next;
    });
  };

  const totalMcps = mcpQuery.data?.length || 0;
  const conflictsCount = conflictQuery.data?.length || 0;
  const clientsCount = clientsQuery.data?.length || 0;

  // Client display names mapping
  const clientNames: Record<string, string> = {
    'claude-code': 'Claude Code',
    'opencode': 'OpenCode',
    'codex': 'Codex',
    'gemini-cli': 'Gemini CLI'
  };

  // Activity action labels and icons
  const activityLabels: Record<string, { label: string; icon: typeof Plus; color: string }> = {
    'binding_created': { label: 'Server added', icon: Plus, color: 'text-green-500' },
    'binding_deleted': { label: 'Server removed', icon: Trash2, color: 'text-red-500' },
    'mcp_deleted': { label: 'Definition deleted', icon: Trash2, color: 'text-red-500' },
    'binding_enabled': { label: 'Server enabled', icon: LinkIcon, color: 'text-green-500' },
    'binding_disabled': { label: 'Server disabled', icon: Unlink, color: 'text-yellow-500' },
    'drift_detected': { label: 'Drift detected', icon: AlertCircle, color: 'text-orange-500' },
    'drift_resolved': { label: 'Drift resolved', icon: CheckCircle2, color: 'text-green-500' },
    'scan_completed': { label: 'Scanning', icon: RefreshCw, color: 'text-blue-500' },
    'mcp_created': { label: 'Definition created', icon: Plus, color: 'text-green-500' }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your MCP registry and connected clients.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddMcpDialog onMcpCreated={() => { mcpQuery.refetch(); activitiesQuery.refetch(); }} />
          <Button
            onClick={handleScan}
            disabled={isScanning}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isScanning && "animate-spin")} />
            {isScanning ? 'Scanning...' : 'Run Scan'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link href="/registry" className="block group">
          <Card className="cursor-pointer transition-all duration-200 group-hover:shadow-lg group-hover:-translate-y-1">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total MCP Servers</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMcps}</div>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Installed Clients</CardTitle>
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Name Conflicts</CardTitle>
            <AlertTriangle className={cn("h-4 w-4", conflictsCount > 0 ? "text-destructive" : "text-muted-foreground")} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{conflictsCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Update</CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString('en-US')}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Client Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {clientsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : clientsQuery.data && clientsQuery.data.length > 0 ? (
                clientsQuery.data.map(client => {
                  const isExpanded = expandedClients.has(client.client);
                  return (
                    <div key={client.client} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleClientExpanded(client.client)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {clientNames[client.client] || client.client}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
                            Installed
                          </Badge>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t px-3 py-3 bg-muted/30 space-y-3">
                          {/* Config Path */}
                          {client.configPath && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <FileCode className="h-3 w-3" />
                                <span>Config File</span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                  {client.configPath}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={() => handleOpenFolder(client.configPath)}
                                  title="Open folder in Finder"
                                >
                                  <FolderOpen className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Binary Path */}
                          {client.binaryPath && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                <Terminal className="h-3 w-3" />
                                <span>Binary Path</span>
                              </div>
                              <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                                {client.binaryPath}
                              </code>
                            </div>
                          )}

                          {/* Capabilities */}
                          {client.capabilities && (
                            <div className="space-y-1.5">
                              <div className="text-xs text-muted-foreground">Capabilities</div>
                              <div className="flex flex-wrap gap-2">
                                <div
                                  className="flex items-center gap-1 text-xs cursor-help"
                                  title="Ability to enable/disable individual MCP servers"
                                >
                                  {client.capabilities.supportsEnableFlag ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className={client.capabilities.supportsEnableFlag ? '' : 'text-muted-foreground'}>
                                    On/Off
                                  </span>
                                </div>
                                <div
                                  className="flex items-center gap-1 text-xs cursor-help"
                                  title="Support for environment variables in configuration ($HOME, ${API_KEY})"
                                >
                                  {client.capabilities.supportsEnvExpansion ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <XCircle className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  <span className={client.capabilities.supportsEnvExpansion ? '' : 'text-muted-foreground'}>
                                    ENV
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No clients detected.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {isScanning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Scanning...
                </div>
              )}
              {activitiesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : activitiesQuery.data && activitiesQuery.data.length > 0 ? (
                activitiesQuery.data.map(activity => {
                  const config = activityLabels[activity.action] || {
                    label: activity.action,
                    icon: History,
                    color: 'text-muted-foreground'
                  };
                  const Icon = config.icon;
                  return (
                    <div key={activity.id} className="flex items-start gap-2 text-sm">
                      <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">
                            {activity.entityName || config.label}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatRelativeTime(activity.createdAt)}
                          </span>
                        </div>
                        {activity.details && (
                          <p className="text-xs text-muted-foreground truncate">
                            {activity.details}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-sm text-muted-foreground italic">
                  No recent activity.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
