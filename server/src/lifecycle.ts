import type { Server } from 'node:http';

export async function drainServer(
  server: Server,
  stopStreams: () => Promise<void>,
  closeDatabase: () => Promise<void>
) {
  // Stop accepting traffic before waiting for existing handlers and audit writes.
  const drained = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  const finished = await Promise.allSettled([stopStreams(), drained]);
  await closeDatabase();
  const failures = finished.filter((result) => result.status === 'rejected');
  if (failures.length) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Server shutdown failed'
    );
  }
}
