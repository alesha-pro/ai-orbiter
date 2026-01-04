import { EventEmitter } from 'events';

export const eventBus = new EventEmitter();

export type CoreEvent =
  | {
      type: 'drift';
      snapshotId: string;
      filePath: string;
      detectedAt: number;
    }
  | {
      type: 'info';
      message: string;
      at: number;
    }
  | {
      type: 'error';
      message: string;
      at: number;
    };

export function emitEvent(event: CoreEvent): void {
  eventBus.emit('message', event);
}
