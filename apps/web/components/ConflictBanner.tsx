'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConflictResolutionDialog } from './ConflictResolutionDialog';
import { trpc } from '@/lib/trpc';
import { AlertTriangle } from 'lucide-react';

export function ConflictBanner() {
  const { data: count } = trpc.conflicts.count.useQuery();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  if (!count || count === 0) return null;

  return (
    <>
      <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <span className="font-medium text-destructive">
                {count} MCP server{count > 1 ? 's have' : ' has'} configuration conflicts
              </span>
              <span className="text-muted-foreground ml-2 hidden sm:inline">
                — servers may work incorrectly until resolved
              </span>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDialogOpen(true)}
          >
            Resolve Now
          </Button>
        </div>
      </div>

      <ConflictResolutionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
    </>
  );
}
