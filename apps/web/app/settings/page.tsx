'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import {
  Download,
  Upload,
  Info,
  Database,
  FolderOpen
} from 'lucide-react';

export default function SettingsPage() {
  const openFolderMutation = trpc.registry.openFolder.useMutation();

  const handleOpenFolder = (path: string) => {
    openFolderMutation.mutate(path);
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage database, exports, and system parameters.
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle>Data Storage</CardTitle>
              </div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-yellow-600 bg-yellow-400/15 border border-yellow-500/30 px-3 py-1.5 rounded-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                </span>
                Coming soon
              </div>
            </div>
            <CardDescription>
              Manage local database of MCP servers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div className="space-y-1">
                <p className="text-sm font-medium">Database Path</p>
                <code className="text-xs text-muted-foreground">~/.ai-orbiter/registry.sqlite</code>
              </div>
              <Button variant="outline" size="sm" disabled>
                Change
              </Button>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div className="space-y-1">
                <p className="text-sm font-medium">Backup Directory</p>
                <code className="text-xs text-muted-foreground">~/.ai-orbiter/backups/</code>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenFolder('~/.ai-orbiter/backups/')}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Open
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <CardTitle>Export & Import</CardTitle>
              </div>
              <div className="inline-flex items-center gap-2 text-xs font-medium text-yellow-600 bg-yellow-400/15 border border-yellow-500/30 px-3 py-1.5 rounded-md">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                </span>
                Coming soon
              </div>
            </div>
            <CardDescription>
              Transfer your MCP registry between devices.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button variant="outline" className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
            <Button variant="outline" className="gap-2" disabled>
              <Upload className="h-4 w-4" />
              Import JSON
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-4 rounded-md">
        <Info className="h-4 w-4" />
        AI Orbiter runs locally. Your data never leaves this device.
      </div>
    </div>
  );
}
