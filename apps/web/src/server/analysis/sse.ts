import 'server-only';

// A ReadableStream of SSE frames with the §4.6 wire rules: a first byte right away, `: ping` every 15 s, and a clean stop
// when the browser leaves. Shared by the analysis and the report-status streams.

const PING_MS = 15_000;

export function abortableWait(signal: AbortSignal) {
  return (ms: number) =>
    new Promise<void>((resolve) => {
      if (signal.aborted) return resolve();
      const timer = setTimeout(done, ms);
      function done() {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      }
      signal.addEventListener('abort', done, { once: true });
    });
}

export function sseStream(
  signal: AbortSignal,
  frames: () => AsyncGenerator<string, void, void>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    closed = true;
    if (ping !== undefined) clearInterval(ping);
  };
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          stop();
        }
      };
      const close = () => {
        if (closed) return;
        stop();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      ping = setInterval(() => send(': ping\n\n'), PING_MS);
      signal.addEventListener('abort', close, { once: true });
      send(': ok\n\n');
      try {
        for await (const frame of frames()) {
          if (closed || signal.aborted) break;
          send(frame);
        }
      } catch {
        send(
          `event: error\ndata: ${JSON.stringify({ type: 'error', code: 'STREAM_FAILED', message: 'A conexão caiu. Recarregue a página para continuar.', recoverable: true })}\n\n`,
        );
      } finally {
        close();
      }
    },
    cancel() {
      stop();
    },
  });
}
