'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ConflictCard } from './ConflictCard';
import { trpc } from '@/lib/trpc';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

type LocalClientType = 'claude-code' | 'opencode' | 'codex' | 'gemini-cli';

type ResolutionAction =
  | { type: 'merge'; baseClient: LocalClientType; editedConfig?: Record<string, unknown> }
  | { type: 'separate'; renames: { client: LocalClientType; newName: string }[] }
  | { type: 'skip' };

interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}

const CLIENT_OPTIONS: { value: LocalClientType; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'codex', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini CLI' },
];

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  onResolved,
}: ConflictResolutionDialogProps) {
  const utils = trpc.useUtils();
  const { data: conflicts, isLoading } = trpc.conflicts.list.useQuery(undefined, {
    enabled: open,
  });

  const [resolutions, setResolutions] = useState<Map<string, ResolutionAction>>(new Map());
  const [bulkClient, setBulkClient] = useState<LocalClientType>('claude-code');

  const effectiveResolutions = useMemo(() => {
    if (!conflicts || conflicts.length === 0) return resolutions;
    
    const mergedResolutions = new Map<string, ResolutionAction>();
    conflicts.forEach((c) => {
      const defaultClient = (c.sources[0]?.client || 'claude-code') as LocalClientType;
      const defaultResolution: ResolutionAction = { type: 'merge', baseClient: defaultClient };
      mergedResolutions.set(c.id, resolutions.get(c.id) || defaultResolution);
    });
    return mergedResolutions;
  }, [conflicts, resolutions]);

  const resolveMutation = trpc.conflicts.resolve.useMutation({
    onSuccess: () => {
      utils.conflicts.list.invalidate();
      utils.conflicts.count.invalidate();
      utils.conflicts.hasUnresolved.invalidate();
      utils.registry.listMcpDefinitions.invalidate();
      onResolved?.();
      onOpenChange(false);
    },
  });

  const bulkResolveMutation = trpc.conflicts.bulkResolve.useMutation({
    onSuccess: () => {
      utils.conflicts.list.invalidate();
      utils.conflicts.count.invalidate();
      utils.conflicts.hasUnresolved.invalidate();
      utils.registry.listMcpDefinitions.invalidate();
      onResolved?.();
      onOpenChange(false);
    },
  });

  const handleResolutionChange = useCallback((conflictId: string, action: ResolutionAction) => {
    setResolutions((prev) => new Map(prev).set(conflictId, action));
  }, []);

  const allResolved = useMemo(() => {
    if (!conflicts) return false;
    return conflicts.every((c) => effectiveResolutions.has(c.id));
  }, [conflicts, effectiveResolutions]);

  const handleApplyAll = useCallback(() => {
    if (!conflicts) return;

    const resolutionArray = conflicts
      .filter((c) => effectiveResolutions.has(c.id))
      .map((c) => ({
        conflictId: c.id,
        conflictName: c.name,
        action: effectiveResolutions.get(c.id)!,
      }));

    resolveMutation.mutate(resolutionArray as any);
  }, [conflicts, effectiveResolutions, resolveMutation]);

  const handleBulkAction = useCallback(
    (action: 'use_client' | 'keep_separate' | 'skip_all') => {
      bulkResolveMutation.mutate({
        action,
        client: action === 'use_client' ? (bulkClient as any) : undefined,
      });
    },
    [bulkClient, bulkResolveMutation]
  );

  const isPending = resolveMutation.isPending || bulkResolveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Resolve Configuration Conflicts
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : conflicts && conflicts.length > 0 ? (
            <>
              <div className="bg-muted/50 border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-medium">Bulk Actions</h3>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={bulkClient}
                      onChange={(e) => setBulkClient(e.target.value as LocalClientType)}
                      className="text-sm border rounded-md px-2 py-1.5 bg-background"
                      disabled={isPending}
                    >
                      {CLIENT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBulkAction('use_client')}
                      disabled={isPending}
                    >
                      Use for all
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAction('keep_separate')}
                    disabled={isPending}
                  >
                    Keep all separate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBulkAction('skip_all')}
                    disabled={isPending}
                  >
                    Skip all
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {conflicts.map((conflict) => (
                  <ConflictCard
                    key={conflict.id}
                    conflict={conflict as any}
                    resolution={effectiveResolutions.get(conflict.id)}
                    onResolutionChange={(action) => handleResolutionChange(conflict.id, action)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">No Conflicts</h3>
              <p className="text-muted-foreground">
                All MCP servers have been imported successfully.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleApplyAll}
            disabled={!allResolved || isPending || !conflicts?.length}
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply All Resolutions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
