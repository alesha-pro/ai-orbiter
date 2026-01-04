'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import ReactDiffViewer from 'react-diff-viewer-continued';
import { useState } from 'react';

interface DiffPreviewDialogProps {
  trigger?: React.ReactNode;
}

export function DiffPreviewDialog({ trigger }: DiffPreviewDialogProps) {
  const [open, setOpen] = useState(false);
  const diffQuery = trpc.apply.previewDiff.useQuery({}, {
    enabled: open
  });

  const applyMutation = trpc.apply.applyChanges.useMutation({
    onSuccess: () => {
      setOpen(false);
    }
  });

  const handleApply = () => {
    applyMutation.mutate();
  };

  const previews = diffQuery.data || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button>Preview Changes</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview Changes</DialogTitle>
          <DialogDescription>
            Review the changes before applying them to client configuration files.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto py-4 space-y-6">
          {diffQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Calculating diff...</p>
            </div>
          )}

          {previews.length === 0 && !diffQuery.isLoading && (
            <div className="text-center py-20 text-muted-foreground">
              No changes to apply.
            </div>
          )}

          {previews.map((preview, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                  {preview.filePath || 'Global config'}
                </span>
                <Badge variant="outline" className="uppercase text-[10px]">
                  {preview.client}
                </Badge>
              </div>
              <div className="border rounded-md overflow-hidden text-[10px]">
                <ReactDiffViewer
                  oldValue={preview.beforeContent}
                  newValue={preview.afterContent}
                  splitView={true}
                  hideLineNumbers={false}
                  useDarkTheme={false}
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={applyMutation.isLoading || previews.length === 0}
            className="gap-2"
          >
            {applyMutation.isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
