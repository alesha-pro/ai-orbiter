'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import {
  Info,
  RefreshCw,
  Search,
  Loader2,
  Sparkles,
  Terminal,
  Globe,
  Pencil,
  Save,
  X,
  Tag,
  Plus,
  Trash2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useState, useEffect } from 'react';
import { AddMcpDialog } from '@/components/AddMcpDialog';
import { DeleteMcpDialog } from '@/components/DeleteMcpDialog';

type StdioConfig = {
  command: string;
  args: string[];
  env: { key: string; value: string }[];
  cwd?: string;
};

type HttpConfig = {
  url: string;
  headers: { key: string; value: string }[];
};

const CLIENT_CONFIG: Record<string, { label: string; color: string; activeColor: string }> = {
  'claude-code': {
    label: 'Claude',
    color: 'hover:border-orange-400/50 hover:bg-orange-500/10',
    activeColor: 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent shadow-lg shadow-orange-500/25'
  },
  'opencode': {
    label: 'Opencode',
    color: 'hover:border-blue-400/50 hover:bg-blue-500/10',
    activeColor: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-transparent shadow-lg shadow-blue-500/25'
  },
  'gemini-cli': {
    label: 'Gemini',
    color: 'hover:border-purple-400/50 hover:bg-purple-500/10',
    activeColor: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white border-transparent shadow-lg shadow-purple-500/25'
  },
  'codex': {
    label: 'Codex',
    color: 'hover:border-emerald-400/50 hover:bg-emerald-500/10',
    activeColor: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/25'
  }
};

const getTransportIcon = (transport: string) => {
  switch (transport) {
    case 'stdio': return <Terminal className="h-3.5 w-3.5" />;
    case 'sse': return <Globe className="h-3.5 w-3.5" />;
    default: return <Sparkles className="h-3.5 w-3.5" />;
  }
};

function McpInfoDialog({
  mcp,
  onConfigUpdated
}: {
  mcp: any;
  onConfigUpdated: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editorMode, setEditorMode] = useState<'form' | 'json'>('form');
  const [editedConfig, setEditedConfig] = useState('');
  const [editedName, setEditedName] = useState('');
  const [editedTransport, setEditedTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
  const [editedTags, setEditedTags] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [stdioConfig, setStdioConfig] = useState<StdioConfig>({ command: '', args: [], env: [] });
  const [httpConfig, setHttpConfig] = useState<HttpConfig>({ url: '', headers: [] });

  const updateMcpMutation = trpc.registry.updateMcpConfig.useMutation({
    onSuccess: () => {
      onConfigUpdated();
      setIsEditing(false);
      setIsOpen(false);
    }
  });

  const serializeForm = (transport: string, stdio: StdioConfig, http: HttpConfig): string => {
    if (transport === 'stdio') {
      const config: any = {
        command: stdio.command,
        args: stdio.args,
        env: stdio.env.length > 0 ? Object.fromEntries(stdio.env.filter(e => e.key).map(e => [e.key, e.value])) : undefined
      };
      if (stdio.cwd) config.cwd = stdio.cwd;
      return JSON.stringify(config, null, 2);
    } else {
      const config: any = {
        url: http.url,
        headers: http.headers.length > 0 ? Object.fromEntries(http.headers.filter(h => h.key).map(h => [h.key, h.value])) : undefined
      };
      return JSON.stringify(config, null, 2);
    }
  };

  const parseToForm = (json: string, transport: string) => {
    try {
      const parsed = JSON.parse(json);
      if (transport === 'stdio') {
        setStdioConfig({
          command: parsed.command || '',
          args: Array.isArray(parsed.args) ? parsed.args : [],
          env: parsed.env ? Object.entries(parsed.env).map(([key, value]) => ({ key, value: String(value) })) : [],
          cwd: parsed.cwd
        });
      } else {
        setHttpConfig({
          url: parsed.url || '',
          headers: parsed.headers ? Object.entries(parsed.headers).map(([key, value]) => ({ key, value: String(value) })) : []
        });
      }
      return true;
    } catch (e) {
      setJsonError('Invalid JSON for form');
      return false;
    }
  };

  useEffect(() => {
    if (isOpen && mcp) {
      let parsed: any = {};
      try {
        parsed = JSON.parse(mcp.endpoint as string);
        setEditedConfig(JSON.stringify(parsed, null, 2));
      } catch {
        setEditedConfig(mcp.endpoint || '{}');
      }

      const transport = mcp.transport as 'stdio' | 'http' | 'sse';
      setEditedTransport(transport);

      if (transport === 'stdio') {
        setStdioConfig({
          command: parsed.command || '',
          args: Array.isArray(parsed.args) ? parsed.args : [],
          env: parsed.env ? Object.entries(parsed.env).map(([key, value]) => ({ key, value: String(value) })) : [],
          cwd: parsed.cwd
        });
      } else {
        setHttpConfig({
          url: parsed.url || '',
          headers: parsed.headers ? Object.entries(parsed.headers).map(([key, value]) => ({ key, value: String(value) })) : []
        });
      }

      setEditedName(mcp.displayName || '');
      setEditedTags(Array.isArray(mcp.tags) ? mcp.tags.join(', ') : '');
      setJsonError(null);
      setIsEditing(false);
      setEditorMode('form');
    }
  }, [isOpen, mcp]);

  const handleSave = () => {
    let finalConfig = editedConfig;

    if (editorMode === 'form') {
      finalConfig = serializeForm(editedTransport, stdioConfig, httpConfig);
    }

    try {
      JSON.parse(finalConfig);
      setJsonError(null);
    } catch (e) {
      setJsonError('Invalid JSON');
      return;
    }

    const tags = editedTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    updateMcpMutation.mutate({
      mcpId: mcp.id,
      displayName: editedName || undefined,
      transport: editedTransport,
      endpoint: finalConfig,
      tags: tags.length > 0 ? tags : undefined
    });
  };

  const handleCancel = () => {
    if (isEditing) {
      setIsEditing(false);
      setJsonError(null);
      if (mcp) {
        let parsed: any = {};
        try {
          parsed = JSON.parse(mcp.endpoint as string);
          setEditedConfig(JSON.stringify(parsed, null, 2));
        } catch {
          setEditedConfig(mcp.endpoint || '{}');
        }
        const transport = mcp.transport as 'stdio' | 'http' | 'sse';
        setEditedTransport(transport);
        if (transport === 'stdio') {
          setStdioConfig({
            command: parsed.command || '',
            args: Array.isArray(parsed.args) ? parsed.args : [],
            env: parsed.env ? Object.entries(parsed.env).map(([key, value]) => ({ key, value: String(value) })) : [],
            cwd: parsed.cwd
          });
        } else {
          setHttpConfig({
            url: parsed.url || '',
            headers: parsed.headers ? Object.entries(parsed.headers).map(([key, value]) => ({ key, value: String(value) })) : []
          });
        }
      }
    } else {
      setIsOpen(false);
    }
  };

  const formatConfig = () => {
    try {
      return JSON.stringify(JSON.parse(mcp.endpoint as string), null, 2);
    } catch {
      return String(mcp.endpoint);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEditing ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1 px-2 py-1 text-lg font-semibold bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Server Name"
              />
            ) : (
              <span>{mcp.displayName}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? 'Edit MCP server configuration' : 'Detailed info about MCP server'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">ID:</span>
            <code className="col-span-3 text-xs bg-muted p-1.5 rounded truncate">{mcp.id}</code>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium">Transport:</span>
            {isEditing ? (
              <select
                value={editedTransport}
                onChange={(e) => {
                  const val = e.target.value as 'stdio' | 'http' | 'sse';
                  setEditedTransport(val);
                  if (val === 'stdio') {
                    setStdioConfig({ command: '', args: [], env: [] });
                  } else {
                    setHttpConfig({ url: '', headers: [] });
                  }
                }}
                className="col-span-3 px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="stdio">stdio (local command)</option>
                <option value="http">http (HTTP URL)</option>
                <option value="sse">sse (Server-Sent Events)</option>
              </select>
            ) : (
              <span className="col-span-3 text-sm">{mcp.transport}</span>
            )}
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <span className="text-sm font-medium flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" />
              Tags:
            </span>
            {isEditing ? (
              <input
                type="text"
                value={editedTags}
                onChange={(e) => setEditedTags(e.target.value)}
                className="col-span-3 px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="prod, data, api (comma separated)"
              />
            ) : (
              <div className="col-span-3 flex flex-wrap gap-1">
                {Array.isArray(mcp.tags) && mcp.tags.length > 0 ? (
                  mcp.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No tags</span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-4 items-start gap-4">
            <span className="text-sm font-medium">Config:</span>
            <div className="col-span-3 space-y-3">
              {isEditing ? (
                <>
                  <div className="flex items-center justify-between bg-muted/50 p-1.5 rounded-lg border border-border/50">
                    <div className="flex items-center gap-3 ml-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${editorMode === 'form' ? 'text-primary' : 'text-muted-foreground'}`}>Form</span>
                        <Switch
                          checked={editorMode === 'json'}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEditedConfig(serializeForm(editedTransport, stdioConfig, httpConfig));
                              setEditorMode('json');
                            } else {
                              if (parseToForm(editedConfig, editedTransport)) {
                                setEditorMode('form');
                              }
                            }
                          }}
                        />
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${editorMode === 'json' ? 'text-primary' : 'text-muted-foreground'}`}>JSON</span>
                      </div>
                    </div>
                  </div>

                  {editorMode === 'json' ? (
                    <div className="space-y-2">
                      <textarea
                        value={editedConfig}
                        onChange={(e) => {
                          setEditedConfig(e.target.value);
                          setJsonError(null);
                        }}
                        className={`w-full h-48 text-xs font-mono bg-muted p-2 rounded border 
                          ${jsonError ? 'border-red-500' : 'border-border'} 
                          focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y`}
                        placeholder={editedTransport === 'stdio'
                          ? '{\n  "command": "npx",\n  "args": ["-y", "mcp-server"],\n  "env": {}\n}'
                          : '{\n  "url": "https://api.example.com/mcp",\n  "headers": {}\n}'
                        }
                      />
                      {jsonError && (
                        <p className="text-xs text-red-500">{jsonError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4 bg-muted/20 p-3 rounded-lg border border-border/30">
                      {editedTransport === 'stdio' ? (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Command</label>
                            <input
                              type="text"
                              value={stdioConfig.command}
                              onChange={(e) => setStdioConfig({ ...stdioConfig, command: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="npx"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Arguments</label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] hover:bg-primary/10 hover:text-primary"
                                onClick={() => setStdioConfig({ ...stdioConfig, args: [...stdioConfig.args, ''] })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {stdioConfig.args.map((arg, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={arg}
                                    onChange={(e) => {
                                      const newArgs = [...stdioConfig.args];
                                      newArgs[idx] = e.target.value;
                                      setStdioConfig({ ...stdioConfig, args: newArgs });
                                    }}
                                    className="flex-1 px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    onClick={() => setStdioConfig({ ...stdioConfig, args: stdioConfig.args.filter((_, i) => i !== idx) })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              {stdioConfig.args.length === 0 && (
                                <p className="text-[10px] text-muted-foreground italic">No arguments provided</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Environment Variables</label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] hover:bg-primary/10 hover:text-primary"
                                onClick={() => setStdioConfig({ ...stdioConfig, env: [...stdioConfig.env, { key: '', value: '' }] })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {stdioConfig.env.map((e, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={e.key}
                                    placeholder="Key"
                                    onChange={(ev) => {
                                      const newEnv = [...stdioConfig.env];
                                      newEnv[idx] = { key: ev.target.value, value: e.value };
                                      setStdioConfig({ ...stdioConfig, env: newEnv });
                                    }}
                                    className="flex-1 px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="text"
                                    value={e.value}
                                    placeholder="Value"
                                    onChange={(ev) => {
                                      const newEnv = [...stdioConfig.env];
                                      newEnv[idx] = { key: e.key, value: ev.target.value };
                                      setStdioConfig({ ...stdioConfig, env: newEnv });
                                    }}
                                    className="flex-1 px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    onClick={() => setStdioConfig({ ...stdioConfig, env: stdioConfig.env.filter((_, i) => i !== idx) })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              {stdioConfig.env.length === 0 && (
                                <p className="text-[10px] text-muted-foreground italic">No env variables provided</p>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Working Directory</label>
                            <input
                              type="text"
                              value={stdioConfig.cwd || ''}
                              onChange={(e) => setStdioConfig({ ...stdioConfig, cwd: e.target.value || undefined })}
                              className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="/path/to/project"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">URL</label>
                            <input
                              type="text"
                              value={httpConfig.url}
                              onChange={(e) => setHttpConfig({ ...httpConfig, url: e.target.value })}
                              className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                              placeholder="https://..."
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Headers</label>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px] hover:bg-primary/10 hover:text-primary"
                                onClick={() => setHttpConfig({ ...httpConfig, headers: [...httpConfig.headers, { key: '', value: '' }] })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add
                              </Button>
                            </div>
                            <div className="space-y-2">
                              {httpConfig.headers.map((h, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={h.key}
                                    placeholder="Header"
                                    onChange={(ev) => {
                                      const newHeaders = [...httpConfig.headers];
                                      newHeaders[idx] = { key: ev.target.value, value: h.value };
                                      setHttpConfig({ ...httpConfig, headers: newHeaders });
                                    }}
                                    className="flex-1 px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <input
                                    type="text"
                                    value={h.value}
                                    placeholder="Value"
                                    onChange={(ev) => {
                                      const newHeaders = [...httpConfig.headers];
                                      newHeaders[idx] = { key: h.key, value: ev.target.value };
                                      setHttpConfig({ ...httpConfig, headers: newHeaders });
                                    }}
                                    className="flex-1 px-2 py-1 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                                    onClick={() => setHttpConfig({ ...httpConfig, headers: httpConfig.headers.filter((_, i) => i !== idx) })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              {httpConfig.headers.length === 0 && (
                                <p className="text-[10px] text-muted-foreground italic">No headers provided</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <pre className="text-[10px] bg-muted p-2 rounded overflow-auto max-h-48 border border-border/50">
                  {formatConfig()}
                </pre>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Bindings:</span>
            <div className="flex flex-wrap gap-2">
              {mcp.bindings?.length > 0 ? mcp.bindings.map((binding: any) => {
                const config = CLIENT_CONFIG[binding.client];
                const isActive = binding.enabled !== 'off';
                return (
                  <Badge
                    key={binding.id}
                    variant={isActive ? "default" : "outline"}
                    className={isActive ? config?.activeColor : ''}
                  >
                    {config?.label || binding.client}
                  </Badge>
                );
              }) : (
                <span className="text-xs text-muted-foreground">No active bindings</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={updateMcpMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateMcpMutation.isPending}
              >
                {updateMcpMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function RegistryPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingToggles, setPendingToggles] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedTransports, setSelectedTransports] = useState<Set<string>>(new Set());

  const registryQuery = trpc.registry.listMcpDefinitions.useQuery();
  const clientsQuery = trpc.registry.listInstalledClients.useQuery();
  const scanMutation = trpc.scan.globalScan.useMutation({
    onSuccess: () => {
      registryQuery.refetch();
    }
  });

  const updateBindingMutation = trpc.registry.updateBindingEnabled.useMutation({
    onSuccess: () => registryQuery.refetch(),
    onSettled: (_, __, variables) => {
      setPendingToggles(prev => {
        const next = new Set(prev);
        next.delete(variables.bindingId);
        return next;
      });
    }
  });

  const createBindingMutation = trpc.registry.createBinding.useMutation({
    onSuccess: () => registryQuery.refetch(),
    onSettled: (_, __, variables) => {
      setPendingToggles(prev => {
        const next = new Set(prev);
        next.delete(`${variables.mcpDefinitionId}-${variables.client}`);
        return next;
      });
    }
  });

  const mcpDefinitions = registryQuery.data || [];
  const installedClients = clientsQuery.data || [];
  const writableClients = installedClients.filter(c => !c.capabilities.isReadOnly);

  // Extract all unique tags and transports
  const allTags = Array.from(
    new Set(
      mcpDefinitions.flatMap(mcp => Array.isArray((mcp as any).tags) ? (mcp as any).tags : [])
    )
  ).sort();

  const allTransports = Array.from(
    new Set(mcpDefinitions.map(mcp => mcp.transport).filter(Boolean))
  ).sort();

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const toggleTransport = (transport: string) => {
    setSelectedTransports(prev => {
      const next = new Set(prev);
      if (next.has(transport)) {
        next.delete(transport);
      } else {
        next.add(transport);
      }
      return next;
    });
  };

  const clearFilters = () => {
    setSelectedTags(new Set());
    setSelectedTransports(new Set());
    setSearchQuery('');
  };

  const hasActiveFilters = selectedTags.size > 0 || selectedTransports.size > 0 || searchQuery.length > 0;

  const filteredMcps = mcpDefinitions.filter(mcp => {
    // Text search filter
    const matchesSearch = searchQuery.length === 0 || (
      (mcp.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (mcp.transport?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
      (Array.isArray((mcp as any).tags) && (mcp as any).tags.some((tag: string) =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      ))
    );

    // Transport filter
    const matchesTransport = selectedTransports.size === 0 || selectedTransports.has(mcp.transport || '');

    // Tags filter (match any selected tag)
    const mcpTags: string[] = Array.isArray((mcp as any).tags) ? (mcp as any).tags : [];
    const matchesTags = selectedTags.size === 0 || mcpTags.some(tag => selectedTags.has(tag));

    return matchesSearch && matchesTransport && matchesTags;
  });

  const handleToggle = (mcp: typeof mcpDefinitions[0], clientType: string) => {
    // @ts-ignore
    const existingBinding = mcp.bindings?.find((b: any) => b.client === clientType);

    if (existingBinding) {
      const nextStatus = existingBinding.enabled === 'off' ? 'on' : 'off';
      setPendingToggles(prev => new Set(prev).add(existingBinding.id));
      updateBindingMutation.mutate({ bindingId: existingBinding.id, enabled: nextStatus });
    } else {
      const key = `${mcp.id}-${clientType}`;
      setPendingToggles(prev => new Set(prev).add(key));
      createBindingMutation.mutate({
        mcpDefinitionId: mcp.id,
        client: clientType,
        scope: 'global',
        enabled: 'on'
      });
    }
  };

  const isBindingEnabled = (mcp: typeof mcpDefinitions[0], clientType: string): boolean => {
    // @ts-ignore
    const binding = mcp.bindings?.find((b: any) => b.client === clientType);
    return binding ? binding.enabled !== 'off' : false;
  };

  const isPending = (mcp: typeof mcpDefinitions[0], clientType: string): boolean => {
    // @ts-ignore
    const binding = mcp.bindings?.find((b: any) => b.client === clientType);
    if (binding) {
      return pendingToggles.has(binding.id);
    }
    return pendingToggles.has(`${mcp.id}-${clientType}`);
  };

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">MCP Registry</h1>
          <p className="text-sm text-muted-foreground">
            Manage server bindings to clients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddMcpDialog onMcpCreated={() => registryQuery.refetch()} />
          <Button
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
            variant="outline"
          >
            {scanMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Run Scan
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search servers..."
          className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-muted/30 text-sm 
                     placeholder:text-muted-foreground/60 
                     focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50
                     transition-all duration-200"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Filter chips */}
      {(allTransports.length > 0 || allTags.length > 0) && (
        <div className="space-y-3">
          {/* Transport filters */}
          {allTransports.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium">Transport:</span>
              {allTransports.map(transport => (
                <button
                  key={transport}
                  onClick={() => toggleTransport(transport)}
                  className={`
                    inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border
                    transition-all duration-200 ease-out
                    ${selectedTransports.has(transport)
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-transparent border-border/50 text-muted-foreground hover:border-border hover:bg-muted/50'
                    }
                  `}
                >
                  {getTransportIcon(transport)}
                  {transport}
                </button>
              ))}
            </div>
          )}

          {/* Tag filters */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Tags:
              </span>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`
                    px-2.5 py-1 text-xs font-medium rounded-lg border
                    transition-all duration-200 ease-out
                    ${selectedTags.has(tag)
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-transparent border-border/50 text-muted-foreground hover:border-border hover:bg-muted/50'
                    }
                  `}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Clear filters button */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <button
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear filters
              </button>
              <span className="text-xs text-muted-foreground">
                (found: {filteredMcps.length} of {mcpDefinitions.length})
              </span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {registryQuery.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filteredMcps.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No servers found
          </div>
        ) : (
          filteredMcps.map((mcp, index) => (
            <div
              key={mcp.id}
              className="group relative flex items-center gap-4 p-2.5 px-4 rounded-xl 
                         bg-card/50 border border-border/40
                         hover:bg-card hover:border-border/80 hover:shadow-sm
                         transition-all duration-200 ease-out"
              style={{
                animationDelay: `${index * 50}ms`,
                animation: 'fadeSlideIn 0.3s ease-out forwards',
                opacity: 0
              }}
            >
              {/* Название и транспорт */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="font-medium text-sm truncate">
                  {mcp.displayName || 'Untitled'}
                </span>
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0 h-5 gap-1 font-normal bg-muted/50 shrink-0 border-none"
                >
                  {getTransportIcon(mcp.transport)}
                  {mcp.transport}
                </Badge>
              </div>

              {/* Группа справа: клиенты + действия */}
              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-1.5">
                  {writableClients.map(client => {
                    const config = CLIENT_CONFIG[client.client] || {
                      label: client.client,
                      color: 'hover:border-border/50 hover:bg-muted/10',
                      activeColor: 'bg-primary text-primary-foreground'
                    };
                    const isActive = isBindingEnabled(mcp, client.client);
                    const isLoading = isPending(mcp, client.client);

                    return (
                      <button
                        key={client.client}
                        onClick={() => handleToggle(mcp, client.client)}
                        disabled={isLoading}
                        className={`
                          relative px-2 py-0.5 text-[11px] font-medium rounded-md border
                          transition-all duration-200 ease-out
                          disabled:opacity-50 disabled:cursor-not-allowed
                          active:scale-95
                          ${isActive
                            ? config.activeColor
                            : `bg-transparent border-border/50 text-muted-foreground ${config.color}`
                          }
                        `}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          config.label
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-0.5 border-l border-border/40 pl-2">
                  <McpInfoDialog mcp={mcp} onConfigUpdated={() => registryQuery.refetch()} />
                  <DeleteMcpDialog
                    mcp={mcp}
                    onDeleted={() => registryQuery.refetch()}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
