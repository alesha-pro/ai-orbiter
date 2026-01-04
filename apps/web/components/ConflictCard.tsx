'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ConfigEditor } from './ConfigEditor';
import { cn } from '@/lib/utils';
import { Pencil, AlertCircle } from 'lucide-react';

type ClientType = 'claude-code' | 'opencode' | 'codex' | 'gemini-cli';

interface ConflictSource {
  client: ClientType;
  config: Record<string, unknown>;
  fingerprint: string;
}

interface ConfigDifference {
  field: string;
  values: { client: ClientType; value: unknown }[];
}

interface ConflictGroup {
  id: string;
  name: string;
  sources: ConflictSource[];
  differences: ConfigDifference[];
  createdAt: number;
}

type ResolutionAction =
  | { type: 'merge'; baseClient: ClientType; editedConfig?: Record<string, unknown> }
  | { type: 'separate'; renames: { client: ClientType; newName: string }[] }
  | { type: 'skip' };

interface ConflictCardProps {
  conflict: ConflictGroup;
  resolution?: ResolutionAction;
  onResolutionChange: (resolution: ResolutionAction) => void;
}

const CLIENT_DISPLAY_NAMES: Record<ClientType, string> = {
  'claude-code': 'Claude Code',
  'opencode': 'OpenCode',
  'codex': 'Codex',
  'gemini-cli': 'Gemini CLI',
};

const CLIENT_SUFFIXES: Record<ClientType, string> = {
  'claude-code': 'claude',
  'opencode': 'opencode',
  'codex': 'codex',
  'gemini-cli': 'gemini',
};

function getClientDisplayName(client: ClientType): string {
  return CLIENT_DISPLAY_NAMES[client] || client;
}

function getClientSuffix(client: ClientType): string {
  return CLIENT_SUFFIXES[client] || client;
}

function DifferencesSummary({ differences }: { differences: ConfigDifference[] }) {
  if (differences.length === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 text-amber-600 mb-2">
        <AlertCircle className="h-4 w-4" />
        <span className="text-sm font-medium">Configuration Differences</span>
      </div>
      <ul className="text-sm text-muted-foreground space-y-1">
        {differences.map((diff) => (
          <li key={diff.field}>
            <span className="font-mono text-xs bg-muted px-1 rounded">{diff.field}</span>
            : different values across sources
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ConfigPreviewProps {
  config: Record<string, unknown>;
  highlightFields?: string[];
}

function ConfigPreview({ config, highlightFields = [] }: ConfigPreviewProps) {
  const lines = JSON.stringify(config, null, 2).split('\n');

  return (
    <pre className="text-xs font-mono bg-muted/50 p-3 rounded-lg overflow-auto max-h-48">
      {lines.map((line, idx) => {
        const isHighlighted = highlightFields.some((field) => line.includes(`"${field}"`));
        return (
          <div
            key={idx}
            className={cn(isHighlighted && 'bg-amber-500/20 -mx-3 px-3')}
          >
            {line}
          </div>
        );
      })}
    </pre>
  );
}

interface SideBySideViewProps {
  sources: ConflictSource[];
  selectedClient: ClientType;
  onSelect: (client: ClientType) => void;
  editedConfigs: Map<ClientType, Record<string, unknown>>;
  onEdit: (client: ClientType) => void;
  highlightFields: string[];
}

function SideBySideView({
  sources,
  selectedClient,
  onSelect,
  editedConfigs,
  onEdit,
  highlightFields,
}: SideBySideViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {sources.map((source) => {
        const config = editedConfigs.get(source.client) || source.config;
        const isSelected = selectedClient === source.client;

        return (
          <div
            key={source.client}
            className={cn(
              'border rounded-lg p-4 cursor-pointer transition-all',
              isSelected
                ? 'ring-2 ring-primary border-primary'
                : 'hover:border-muted-foreground/50'
            )}
            onClick={() => onSelect(source.client)}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-3 h-3 rounded-full',
                    isSelected ? 'bg-primary' : 'border-2 border-muted-foreground'
                  )}
                />
                <span className="font-medium">{getClientDisplayName(source.client)}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(source.client);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
            <ConfigPreview config={config} highlightFields={highlightFields} />
          </div>
        );
      })}
    </div>
  );
}

interface TabsViewProps {
  sources: ConflictSource[];
  selectedClient: ClientType;
  onSelect: (client: ClientType) => void;
  editedConfigs: Map<ClientType, Record<string, unknown>>;
  onEdit: (client: ClientType) => void;
  highlightFields: string[];
}

function TabsView({
  sources,
  selectedClient,
  onSelect,
  editedConfigs,
  onEdit,
  highlightFields,
}: TabsViewProps) {
  return (
    <Tabs value={selectedClient} onValueChange={(v) => onSelect(v as ClientType)}>
      <TabsList className="w-full">
        {sources.map((source) => (
          <TabsTrigger
            key={source.client}
            value={source.client}
            className="flex-1 gap-2"
          >
            {selectedClient === source.client && (
              <div className="w-2 h-2 rounded-full bg-primary" />
            )}
            {getClientDisplayName(source.client)}
          </TabsTrigger>
        ))}
      </TabsList>

      {sources.map((source) => {
        const config = editedConfigs.get(source.client) || source.config;

        return (
          <TabsContent key={source.client} value={source.client}>
            <div className="border rounded-lg p-4">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="outline" onClick={() => onEdit(source.client)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>
              <ConfigPreview config={config} highlightFields={highlightFields} />
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

interface ResolutionOptionsProps {
  resolutionType: 'merge' | 'separate' | 'skip';
  selectedClient: ClientType;
  renames: Map<ClientType, string>;
  sources: ConflictSource[];
  onResolutionTypeChange: (type: 'merge' | 'separate' | 'skip') => void;
  onRenamesChange: (renames: Map<ClientType, string>) => void;
}

function ResolutionOptions({
  resolutionType,
  selectedClient,
  renames,
  sources,
  onResolutionTypeChange,
  onRenamesChange,
}: ResolutionOptionsProps) {
  return (
    <div className="space-y-3 pt-4 border-t">
      <Label className="text-sm font-medium">Resolution:</Label>

      <RadioGroup
        value={resolutionType}
        onValueChange={(v) => onResolutionTypeChange(v as 'merge' | 'separate' | 'skip')}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="merge" id="merge" />
          <Label htmlFor="merge" className="cursor-pointer">
            <span className="font-medium">Merge:</span>
            <span className="text-muted-foreground ml-1">
              Use {getClientDisplayName(selectedClient)} config for all clients
            </span>
          </Label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="separate" id="separate" />
            <Label htmlFor="separate" className="cursor-pointer">
              <span className="font-medium">Keep separate:</span>
              <span className="text-muted-foreground ml-1">
                Create distinct servers for each client
              </span>
            </Label>
          </div>

          {resolutionType === 'separate' && (
            <div className="ml-6 space-y-2 p-3 bg-muted/50 rounded-lg">
              {sources.map((source) => (
                <div key={source.client} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-28 shrink-0">
                    {getClientDisplayName(source.client)}:
                  </span>
                  <Input
                    value={renames.get(source.client) || ''}
                    onChange={(e) => {
                      const newRenames = new Map(renames);
                      newRenames.set(source.client, e.target.value);
                      onRenamesChange(newRenames);
                    }}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <RadioGroupItem value="skip" id="skip" />
          <Label htmlFor="skip" className="cursor-pointer">
            <span className="font-medium">Skip:</span>
            <span className="text-muted-foreground ml-1">Don&apos;t import this server</span>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

export function ConflictCard({ conflict, resolution, onResolutionChange }: ConflictCardProps) {
  const [selectedClient, setSelectedClient] = useState<ClientType>(
    conflict.sources[0]?.client || 'claude-code'
  );
  const [editedConfigs, setEditedConfigs] = useState<Map<ClientType, Record<string, unknown>>>(
    new Map()
  );
  const [editingClient, setEditingClient] = useState<ClientType | null>(null);
  const [editingConfig, setEditingConfig] = useState<Record<string, unknown>>({});

  const initialRenames = useMemo(() => {
    const map = new Map<ClientType, string>();
    conflict.sources.forEach((s) => {
      map.set(s.client, `${conflict.name}-${getClientSuffix(s.client)}`);
    });
    return map;
  }, [conflict.name, conflict.sources]);

  const [renames, setRenames] = useState<Map<ClientType, string>>(initialRenames);

  const resolutionType = resolution?.type || 'merge';
  const isSideBySide = conflict.sources.length === 2;
  const highlightFields = conflict.differences.map((d) => d.field);

  const handleResolutionTypeChange = useCallback(
    (type: 'merge' | 'separate' | 'skip') => {
      if (type === 'merge') {
        const editedConfig = editedConfigs.get(selectedClient);
        onResolutionChange({
          type: 'merge',
          baseClient: selectedClient,
          editedConfig: editedConfig as Record<string, unknown> | undefined,
        });
      } else if (type === 'separate') {
        onResolutionChange({
          type: 'separate',
          renames: Array.from(renames.entries()).map(([client, newName]) => ({
            client,
            newName,
          })),
        });
      } else {
        onResolutionChange({ type: 'skip' });
      }
    },
    [selectedClient, editedConfigs, renames, onResolutionChange]
  );

  const handleClientSelect = useCallback(
    (client: ClientType) => {
      setSelectedClient(client);
      if (resolutionType === 'merge') {
        const editedConfig = editedConfigs.get(client);
        onResolutionChange({
          type: 'merge',
          baseClient: client,
          editedConfig: editedConfig as Record<string, unknown> | undefined,
        });
      }
    },
    [resolutionType, editedConfigs, onResolutionChange]
  );

  const handleRenamesChange = useCallback(
    (newRenames: Map<ClientType, string>) => {
      setRenames(newRenames);
      if (resolutionType === 'separate') {
        onResolutionChange({
          type: 'separate',
          renames: Array.from(newRenames.entries()).map(([client, newName]) => ({
            client,
            newName,
          })),
        });
      }
    },
    [resolutionType, onResolutionChange]
  );

  const handleEditOpen = useCallback(
    (client: ClientType) => {
      const source = conflict.sources.find((s) => s.client === client);
      if (source) {
        setEditingClient(client);
        setEditingConfig(editedConfigs.get(client) || source.config);
      }
    },
    [conflict.sources, editedConfigs]
  );

  const handleEditSave = useCallback(() => {
    if (editingClient) {
      const newEditedConfigs = new Map(editedConfigs);
      newEditedConfigs.set(editingClient, editingConfig);
      setEditedConfigs(newEditedConfigs);

      if (resolutionType === 'merge' && editingClient === selectedClient) {
        onResolutionChange({
          type: 'merge',
          baseClient: selectedClient,
          editedConfig: editingConfig,
        });
      }

      setEditingClient(null);
    }
  }, [
    editingClient,
    editingConfig,
    editedConfigs,
    resolutionType,
    selectedClient,
    onResolutionChange,
  ]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{conflict.name}</CardTitle>
            <Badge variant="secondary">{conflict.sources.length} sources</Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <DifferencesSummary differences={conflict.differences} />

          {isSideBySide ? (
            <SideBySideView
              sources={conflict.sources}
              selectedClient={selectedClient}
              onSelect={handleClientSelect}
              editedConfigs={editedConfigs}
              onEdit={handleEditOpen}
              highlightFields={highlightFields}
            />
          ) : (
            <TabsView
              sources={conflict.sources}
              selectedClient={selectedClient}
              onSelect={handleClientSelect}
              editedConfigs={editedConfigs}
              onEdit={handleEditOpen}
              highlightFields={highlightFields}
            />
          )}

          <ResolutionOptions
            resolutionType={resolutionType}
            selectedClient={selectedClient}
            renames={renames}
            sources={conflict.sources}
            onResolutionTypeChange={handleResolutionTypeChange}
            onRenamesChange={handleRenamesChange}
          />
        </CardContent>
      </Card>

      <Dialog open={editingClient !== null} onOpenChange={() => setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              Edit Configuration - {editingClient && getClientDisplayName(editingClient)}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden">
            <ConfigEditor
              value={editingConfig}
              onChange={(value) => setEditingConfig(value as Record<string, unknown>)}
              minHeight="300px"
              className="h-full w-full"
            />
          </div>

          <DialogFooter className="flex-shrink-0 pt-4">
            <Button variant="outline" onClick={() => setEditingClient(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
