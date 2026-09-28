import type { IncomingMessage, ServerResponse } from 'node:http';
import { appendFile, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { z } from 'zod';

/** Where a device that opted in posts its log batches (relative to the page). */
const DEVICE_LOG_ROUTE = '/__device-log';
const MAX_BODY_BYTES = 512 * 1024;
/** One page session never grows past this; a runaway page cannot fill the disk. */
const MAX_SESSION_BYTES = 20 * 1024 * 1024;

const batchSchema = z.object({
  session: z.string().regex(/^[a-z0-9-]{8,64}$/),
  dropped: z.number().int().min(0).optional(),
  entries: z
    .array(z.looseObject({ kind: z.string().min(1).max(40) }))
    .max(10_000),
});

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    // Keep draining so the client gets an answer, but stop keeping the bytes.
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  return size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8');
}

/**
 * Device debug log receiver (spec 015 step 3). Each page session appends JSON lines to
 * `<directory>/<UTC date>/<session>.jsonl`; the page only logs when its device opted in.
 */
export function createDeviceLogHandler(
  directory: string,
  now: () => Date = () => new Date(),
) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const answer = (status: number) => response.writeHead(status).end();
    if (request.method !== 'POST') return answer(405);
    const body = await readBody(request);
    if (body === null) return answer(413);
    let batch: z.infer<typeof batchSchema>;
    try {
      batch = batchSchema.parse(JSON.parse(body));
    } catch {
      return answer(400);
    }
    const received = now().toISOString();
    const folder = join(directory, received.slice(0, 10));
    const file = join(folder, `${batch.session}.jsonl`);
    await mkdir(folder, { recursive: true });
    const size = await stat(file).then(
      (info) => info.size,
      () => 0,
    );
    const lines = [
      ...(batch.dropped ? [{ kind: 'dropped', count: batch.dropped }] : []),
      ...batch.entries,
    ]
      .map((entry) => JSON.stringify({ received, ...entry }) + '\n')
      .join('');
    if (size + Buffer.byteLength(lines) > MAX_SESSION_BYTES) return answer(413);
    await appendFile(file, lines);
    answer(204);
  };
}

/** Serves the receiver from `vite preview` only; the dev server and tests never log. */
export function deviceLogPlugin(directory: string): Plugin {
  const handle = createDeviceLogHandler(directory);
  return {
    name: 'device-log',
    configurePreviewServer(server) {
      server.middlewares.use(DEVICE_LOG_ROUTE, (request, response) => {
        handle(request, response).catch(() => {
          if (!response.headersSent) response.writeHead(500);
          response.end();
        });
      });
    },
  };
}
