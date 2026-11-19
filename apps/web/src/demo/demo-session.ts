// Visitor state on /demo (ARCHITECTURE §4.7 note and §7.3; ADR-004): nothing is written on the server. The
// state lives in `localStorage` under `refund:demo:<sessionId>` and every change is announced on the
// BroadcastChannel 'refund-demo', so another tab (the accountant view of E13) follows it without a server.
// "Recomeçar demo" deletes the key; an incognito window has its own storage, so it is a new session.
// Every storage access is guarded: blocked or missing storage degrades to an in-memory session.

export const DEMO_CHANNEL = 'refund-demo';
const POINTER_KEY = 'refund:demo:session';
const PREFIX = 'refund:demo:';

export interface DemoPersonaState {
  /** The first-access track ended (analysis watched or "Pular para o painel"): the shell unlocks (E13). */
  trackDone?: boolean;
  /** Milliseconds from opening the analysis to the first R$ on screen (IDENTITY-AND-UI §6.1 item 1). */
  firstMoneyMs?: number;
  /** Screen 7: the visitor's choice per card id (absent = the persona's own answer). */
  choices?: Record<string, string>;
  /** Screen 7: cards the visitor already went through (the pending counter). */
  reviewed?: string[];
  /** Screen 6: findings marked "para o contador". */
  marked?: string[];
  /** Screen 8: the accountant's approval in another tab (no e-mail on /demo). */
  report?: DemoReportState;
}

export interface DemoReportState {
  /** "Mandar para meu contador" pressed (ms epoch, display only). */
  sentAt?: number;
  /** The accountant tab opened the report. */
  openedAt?: number;
  approvedAt?: number;
  /** Per finding: approved or adjustment requested. */
  findings?: Record<string, 'approved' | 'adjust'>;
  /** The accountant's comment on an adjustment. */
  comment?: string;
}

export interface DemoSessionState {
  id: string;
  createdAt: number;
  personas: Record<string, DemoPersonaState>;
}

export type DemoMessage = { type: 'updated'; id: string } | { type: 'restarted' };

let memory: DemoSessionState | null = null;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

function broadcast(message: DemoMessage): void {
  try {
    const channel = new BroadcastChannel(DEMO_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // No BroadcastChannel (old browser): the `storage` event still reaches other tabs.
  }
}

function read(store: Storage, id: string): DemoSessionState | null {
  try {
    const raw = store.getItem(`${PREFIX}${id}`);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<DemoSessionState>;
    if (v.id !== id || typeof v.createdAt !== 'number') return null;
    return { id, createdAt: v.createdAt, personas: v.personas ?? {} };
  } catch {
    return null;
  }
}

function write(state: DemoSessionState): void {
  memory = state;
  const store = storage();
  try {
    store?.setItem(POINTER_KEY, state.id);
    store?.setItem(`${PREFIX}${state.id}`, JSON.stringify(state));
  } catch {
    // Quota or blocked: the in-memory copy keeps this tab working.
  }
}

/** The current visitor session, created on first use. */
export function demoSession(): DemoSessionState {
  const store = storage();
  try {
    const id = store?.getItem(POINTER_KEY);
    const found = id ? read(store as Storage, id) : null;
    if (found) {
      memory = found;
      return found;
    }
  } catch {
    // Fall through to a fresh session.
  }
  if (memory) return memory;
  const fresh: DemoSessionState = { id: newId(), createdAt: Date.now(), personas: {} };
  write(fresh);
  return fresh;
}

export function updatePersonaState(persona: string, patch: DemoPersonaState): DemoSessionState {
  const current = demoSession();
  const next: DemoSessionState = {
    ...current,
    personas: { ...current.personas, [persona]: { ...current.personas[persona], ...patch } },
  };
  write(next);
  broadcast({ type: 'updated', id: next.id });
  return next;
}

/** "Recomeçar demo": deletes the session and every track answer of this tab. */
export function restartDemo(): void {
  const store = storage();
  try {
    const id = store?.getItem(POINTER_KEY);
    if (id) store?.removeItem(`${PREFIX}${id}`);
    store?.removeItem(POINTER_KEY);
  } catch {
    // Nothing stored.
  }
  try {
    const session = window.sessionStorage;
    for (const key of Object.keys(session)) if (key.startsWith(PREFIX)) session.removeItem(key);
  } catch {
    // Nothing stored.
  }
  memory = null;
  broadcast({ type: 'restarted' });
}

/** Changes made by other tabs (BroadcastChannel, or the `storage` event as a fallback). */
export function onDemoMessage(listener: (m: DemoMessage) => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(DEMO_CHANNEL);
    channel.onmessage = (e: MessageEvent<DemoMessage>) => listener(e.data);
  } catch {
    channel = null;
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === POINTER_KEY && e.newValue === null) listener({ type: 'restarted' });
    else if (e.key?.startsWith(PREFIX) && e.newValue !== null)
      listener({ type: 'updated', id: e.key.slice(PREFIX.length) });
  };
  window.addEventListener('storage', onStorage);
  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}
