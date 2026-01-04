'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import {
    Plus,
    Loader2,
    Terminal,
    Globe,
    Save,
    X,
    Trash2,
    AlertCircle
} from 'lucide-react';
import { useState, useEffect } from 'react';

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

interface AddMcpDialogProps {
    onMcpCreated: () => void;
    triggerButton?: React.ReactNode;
}

export function AddMcpDialog({ onMcpCreated, triggerButton }: AddMcpDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [editorMode, setEditorMode] = useState<'form' | 'json'>('form');
    const [displayName, setDisplayName] = useState('');
    const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio');
    const [tags, setTags] = useState('');
    const [jsonConfig, setJsonConfig] = useState('');
    const [jsonError, setJsonError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);

    const [stdioConfig, setStdioConfig] = useState<StdioConfig>({ command: '', args: [], env: [] });
    const [httpConfig, setHttpConfig] = useState<HttpConfig>({ url: '', headers: [] });

    const createMcpMutation = trpc.registry.createMcpDefinition.useMutation({
        onSuccess: () => {
            onMcpCreated();
            resetForm();
            setIsOpen(false);
        },
        onError: (error) => {
            setValidationError(error.message);
        }
    });

    const resetForm = () => {
        setDisplayName('');
        setTransport('stdio');
        setTags('');
        setJsonConfig('');
        setJsonError(null);
        setValidationError(null);
        setStdioConfig({ command: '', args: [], env: [] });
        setHttpConfig({ url: '', headers: [] });
        setEditorMode('form');
    };

    useEffect(() => {
        if (isOpen) {
            resetForm();
        }
    }, [isOpen]);

    const serializeForm = (t: string, stdio: StdioConfig, http: HttpConfig): string => {
        if (t === 'stdio') {
            const config: any = {
                command: stdio.command,
                args: stdio.args.filter(a => a.trim() !== ''),
            };
            const envObj = Object.fromEntries(stdio.env.filter(e => e.key.trim() !== '').map(e => [e.key, e.value]));
            if (Object.keys(envObj).length > 0) config.env = envObj;
            if (stdio.cwd) config.cwd = stdio.cwd;
            return JSON.stringify(config, null, 2);
        } else {
            const config: any = { url: http.url };
            const headersObj = Object.fromEntries(http.headers.filter(h => h.key.trim() !== '').map(h => [h.key, h.value]));
            if (Object.keys(headersObj).length > 0) config.headers = headersObj;
            return JSON.stringify(config, null, 2);
        }
    };

    const parseToForm = (json: string, t: string): boolean => {
        try {
            const parsed = JSON.parse(json);
            if (t === 'stdio') {
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

    const handleSubmit = () => {
        setValidationError(null);
        setJsonError(null);

        if (!displayName.trim()) {
            setValidationError('Server name is required');
            return;
        }

        let finalConfig = jsonConfig;
        if (editorMode === 'form') {
            finalConfig = serializeForm(transport, stdioConfig, httpConfig);
        }

        try {
            JSON.parse(finalConfig);
        } catch (e) {
            setJsonError('Invalid JSON');
            return;
        }

        const tagList = tags
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        createMcpMutation.mutate({
            displayName: displayName.trim(),
            transport,
            endpoint: finalConfig,
            tags: tagList.length > 0 ? tagList : undefined
        });
    };

    const defaultTrigger = (
        <Button className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg">
            <Plus className="h-4 w-4" />
            Add MCP
        </Button>
    );

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {triggerButton || defaultTrigger}
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add New MCP Server
                    </DialogTitle>
                    <DialogDescription>
                        Create a new MCP server by specifying the transport type and configuration
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Display Name */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Server Name *
                        </label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="e.g.: my-mcp-server"
                        />
                    </div>

                    {/* Transport Type */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Transport Type
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setTransport('stdio');
                                    setStdioConfig({ command: '', args: [], env: [] });
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-all ${transport === 'stdio'
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-muted/50 border-border/50 hover:border-border hover:bg-muted'
                                    }`}
                            >
                                <Terminal className="h-4 w-4" />
                                STDIO
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTransport('http');
                                    setHttpConfig({ url: '', headers: [] });
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-all ${transport === 'http'
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-muted/50 border-border/50 hover:border-border hover:bg-muted'
                                    }`}
                            >
                                <Globe className="h-4 w-4" />
                                HTTP
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setTransport('sse');
                                    setHttpConfig({ url: '', headers: [] });
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-all ${transport === 'sse'
                                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                    : 'bg-muted/50 border-border/50 hover:border-border hover:bg-muted'
                                    }`}
                            >
                                <Globe className="h-4 w-4" />
                                SSE
                            </button>
                        </div>
                    </div>

                    {/* Tags */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Tags (optional)
                        </label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="prod, data, api (comma separated)"
                        />
                    </div>

                    {/* Config Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg border border-border/50">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1">
                                Configuration
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${editorMode === 'form' ? 'text-primary' : 'text-muted-foreground'}`}>
                                    Form
                                </span>
                                <Switch
                                    checked={editorMode === 'json'}
                                    onCheckedChange={(checked) => {
                                        if (checked) {
                                            setJsonConfig(serializeForm(transport, stdioConfig, httpConfig));
                                            setEditorMode('json');
                                        } else {
                                            if (parseToForm(jsonConfig, transport)) {
                                                setEditorMode('form');
                                            }
                                        }
                                    }}
                                />
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${editorMode === 'json' ? 'text-primary' : 'text-muted-foreground'}`}>
                                    JSON
                                </span>
                            </div>
                        </div>

                        {editorMode === 'json' ? (
                            <div className="space-y-2">
                                <textarea
                                    value={jsonConfig}
                                    onChange={(e) => {
                                        setJsonConfig(e.target.value);
                                        setJsonError(null);
                                    }}
                                    className={`w-full h-48 text-xs font-mono bg-muted p-3 rounded-lg border 
                    ${jsonError ? 'border-red-500' : 'border-border'} 
                    focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y overflow-auto`}
                                    style={{ maxWidth: '100%', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                                    placeholder={transport === 'stdio'
                                        ? '{\n  "command": "npx",\n  "args": ["-y", "mcp-server"],\n  "env": {}\n}'
                                        : '{\n  "url": "https://api.example.com/mcp",\n  "headers": {}\n}'
                                    }
                                />
                            </div>
                        ) : (
                            <div className="space-y-4 bg-muted/20 p-3 rounded-lg border border-border/30">
                                {transport === 'stdio' ? (
                                    <div className="space-y-4">
                                        {/* Command */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Command *
                                            </label>
                                            <input
                                                type="text"
                                                value={stdioConfig.command}
                                                onChange={(e) => setStdioConfig({ ...stdioConfig, command: e.target.value })}
                                                className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="npx"
                                            />
                                        </div>

                                        {/* Args */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    Arguments
                                                </label>
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

                                        {/* Env */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    Environment Variables
                                                </label>
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

                                        {/* CWD */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Working Directory
                                            </label>
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
                                        {/* URL */}
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                URL *
                                            </label>
                                            <input
                                                type="text"
                                                value={httpConfig.url}
                                                onChange={(e) => setHttpConfig({ ...httpConfig, url: e.target.value })}
                                                className="w-full px-2 py-1.5 text-sm bg-muted rounded border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                                                placeholder="https://..."
                                            />
                                        </div>

                                        {/* Headers */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                    Headers
                                                </label>
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
                    </div>

                    {/* Error Display */}
                    {(jsonError || validationError) && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <p className="text-sm">{jsonError || validationError}</p>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsOpen(false)}
                        disabled={createMcpMutation.isPending}
                    >
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSubmit}
                        disabled={createMcpMutation.isPending}
                    >
                        {createMcpMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4 mr-1" />
                        )}
                        Create
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
