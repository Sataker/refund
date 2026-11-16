// Shapes the track's client components receive from server actions. Declared here because a
// `.client.tsx` may not import `src/server/**` or @refund/sources, not even for types (ARCHITECTURE
// §3.3, dependency-cruiser with tsPreCompilationDeps). The server's ActionResult is assignable to these.

export type ClientResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export type TrackAction = () => Promise<ClientResult<{ next: string }>>;
