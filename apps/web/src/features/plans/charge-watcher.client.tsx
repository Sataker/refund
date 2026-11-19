'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// /app/plano/pix/[cobrancaId]: while the charge is pending, asks the server every 2 s (getCharge reconciles with
// AbacatePay after 20 s) and re-renders the page once the status changes.

type Result<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } };

export function ChargeWatcher({
  chargeId,
  get,
}: {
  chargeId: string;
  get: (input: { chargeId: string }) => Promise<Result<{ status: string }>>;
}) {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await get({ chargeId });
      if (!alive) return;
      if (r.ok && r.value.status !== 'pending') return router.refresh();
      timer = setTimeout(tick, 2_000);
    };
    timer = setTimeout(tick, 2_000);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [chargeId, get, router]);
  return null;
}
