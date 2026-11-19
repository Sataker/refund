import { findOwnedCharge } from '@refund/db';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChargeWatcher } from '@/features/plans/charge-watcher.client';
import { PLAN_NAME, priceLabel } from '@/features/plans/model';
import { LiveUnavailable } from '@/features/track/live-unavailable';
import { liveContext } from '@/server/live.ts';
import { getCharge } from '../../actions';

// ARCHITECTURE §13 `/app/plano/pix/[cobrancaId]`: a charge reopened after a reload or from another tab. Only the
// session that owns it; the QR image is not stored (only the copia e cola), so this page offers that and the status.

export const metadata: Metadata = { title: 'Pix · Refund', robots: { index: false } };

const STATUS: Record<string, string> = {
  pending: 'Esperando o pagamento…',
  paid: 'Pago. O plano já está ativo.',
  expired: 'Este Pix expirou sem pagamento. Nada foi cobrado.',
  cancelled: 'Este Pix foi cancelado. Nada foi cobrado.',
  refunded: 'Este pagamento foi devolvido.',
};

export default async function ChargePage({ params }: { params: Promise<{ cobrancaId: string }> }) {
  const ctx = await liveContext();
  if (!ctx.ok) return <LiveUnavailable message={ctx.error.message} />;
  const { cobrancaId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(cobrancaId)) notFound();
  const row = await findOwnedCharge(ctx.value.db, ctx.value.userId, cobrancaId);
  if (!row) notFound();
  const name = PLAN_NAME[row.planId as keyof typeof PLAN_NAME] ?? row.planId;
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 px-4 py-12"
      data-testid="charge-page"
    >
      <h1 className="type-h2 text-foreground">Pix · {name}</h1>
      <p className="num type-small text-foreground" data-cents={row.amountCents}>
        {priceLabel(row.amountCents)}
      </p>
      <p className="type-small text-foreground" data-testid="pix-status" data-status={row.status}>
        {STATUS[row.status] ?? row.status}
      </p>
      {row.status === 'pending' && row.brCode ? (
        <>
          <label htmlFor="copia-cola" className="type-caption text-muted-foreground">
            Pix copia e cola
          </label>
          <textarea
            id="copia-cola"
            readOnly
            rows={4}
            value={row.brCode}
            className="type-caption rounded-md border border-border bg-surface p-2 font-mono"
          />
          <ChargeWatcher chargeId={row.id} get={getCharge} />
        </>
      ) : null}
      <p className="type-small">
        <Link href={'/app/plano' as Route} className="text-cobalt underline underline-offset-4">
          Voltar aos planos
        </Link>
      </p>
    </main>
  );
}
