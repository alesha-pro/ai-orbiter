import { EventEmitter } from 'events';
import { eventBus } from '@ai-orbiter/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sseEmitter = new EventEmitter();

export async function GET(req: Request) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const onMessage = (data: any) => {
        send(data);
      };

      sseEmitter.on('message', onMessage);
      eventBus.on('message', onMessage);

      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15000);

      req.signal.addEventListener('abort', () => {
        sseEmitter.off('message', onMessage);
        eventBus.off('message', onMessage);
        clearInterval(interval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
