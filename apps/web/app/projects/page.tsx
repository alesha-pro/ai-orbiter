'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import {
  Plus,
  Folder,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { useState } from 'react';

export default function ProjectsPage() {
  const [projectPath, setProjectPath] = useState('');
  const [lastResult, setLastResult] = useState<any>(null);

  const scanProjectMutation = trpc.scan.scanProject.useMutation({
    onSuccess: (data) => {
      setLastResult(data);
      setProjectPath('');
    }
  });

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectPath) return;
    scanProjectMutation.mutate(projectPath);
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Connect Projects</h1>
        <p className="text-muted-foreground">
          Add local projects to manage their MCP configurations.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add New Project</CardTitle>
            <CardDescription>
              Enter the absolute path to the project directory on your computer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProject} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Project Path</label>
                <div className="relative">
                  <Folder className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="/Users/username/projects/my-app"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-9 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={projectPath}
                    onChange={(e) => setProjectPath(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={scanProjectMutation.isLoading || !projectPath}
              >
                {scanProjectMutation.isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Scan and Add
              </Button>
            </form>
          </CardContent>
        </Card>

        {lastResult && (
          <Card className="border-green-200 bg-green-50/20">
            <CardHeader>
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <CardTitle className="text-lg">Project scanned successfully</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>MCP servers found: <strong>{lastResult.count || 0}</strong></p>
              <p>Conflicts detected: <strong>{lastResult.conflicts?.length || 0}</strong></p>
              <p className="text-xs text-muted-foreground pt-4">
                All found configurations have been added to the common registry. You can manage them on the registry page.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4 text-muted-foreground">
          <p>
            When adding a project, AI Orbiter looks for config files of MCP clients:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Claude Code (<code>.mcp.json</code>)</li>
            <li>OpenCode (<code>opencode.json</code>)</li>
            <li>Gemini CLI (<code>.gemini/settings.json</code>)</li>
          </ul>
          <p>
            All found servers are merged into a single registry, allowing you to easily enable or disable them for specific tools.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
