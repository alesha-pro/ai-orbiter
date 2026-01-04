'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useState } from 'react';

interface DeleteMcpDialogProps {
  mcp: any;
  onDeleted: () => void;
}

export function DeleteMcpDialog({ mcp, onDeleted }: DeleteMcpDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const deleteMutation = trpc.registry.deleteMcpDefinition.useMutation({
    onSuccess: () => {
      onDeleted();
      setIsOpen(false);
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-600 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete MCP Server
          </DialogTitle>
          <DialogDescription className="space-y-3">
            <p>
              Are you sure you want to delete <strong>"{mcp.displayName}"</strong>?
            </p>
            <p>
              This will remove the server from all client configurations.
            </p>
            <p className="text-xs text-red-500/80 pt-2">
              This action cannot be undone.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(mcp.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
