export const subscribers = new Map();

export function broadcastStatus(data) {
  const encoder = new TextEncoder();
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoded = encoder.encode(message);

  console.log(`Broadcasting to ${subscribers.size} clients:`, data);
  
  subscribers.forEach((controller, id) => {
    try {
      controller.enqueue(encoded);
    } catch (error) {
      console.error(`Error broadcasting to client ${id}:`, error);
      subscribers.delete(id);
    }
  });
}