// app/api/chat/status/route.js
import { headers } from 'next/headers';

const subscribers = new Map();

export async function GET(request) {
  const id = Math.random().toString(36).substring(7);
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Add this client's controller to subscribers
      subscribers.set(id, controller);

      // Send initial connection message
      const message = JSON.stringify({
        type: 'connected',
        message: 'SSE connection established',
        clients: subscribers.size
      });
      controller.enqueue(encoder.encode(`data: ${message}\n\n`));
    },
    cancel() {
      // Remove this client when they disconnect
      subscribers.delete(id);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}