import 'server-only';
import { type Db, listAnalysisLedger, schema } from '@refund/db';
import type { Finding, YearMonth } from '@refund/engine';
import {
  type Classification,
  duplicateRemovals,
  type FinancialView,
  financialViewOfRun,
} from '@refund/pipeline';
import { type PublicCompany, parsePublicCompany, redactDescription } from '@refund/sources';
import { eq } from 'drizzle-orm';
import { exclusionSets, variantKey } from '@/features/finance/exclusions.ts';
import type { FinanceScreenData, SealFinding, TxRow } from '@/features/finance/types.ts';
import { questionsOf } from './analysis/actions.ts';
import { ledgerInput } from './analysis/input.ts';
import { findingHref, type LiveAnalysis } from './analysis/read.ts';

// Finanças in /app (E14b task 6, ARCHITECTURE §13): the analysis's own ledger (one join, `listAnalysisLedger`) and its
// findings rows through the same `buildFinancialView` as /demo. Free on every plan (§8.3). The owner's D31 exclusions
// are stored per analysis and only change this view, never the analysis.

/** 2^3 views at most, as /demo (D31 b). */
const MAX_SUSPECTS = 3;

export type LiveFinance =
  | { ok: true; value: FinanceScreenData; removable: ReadonlySet<string> }
  | { ok: false; reason: 'FINANCIAL_VIEW_UNAVAILABLE' };

export async function liveFinance(db: Db, live: LiveAnalysis): Promise<LiveFinance> {
  const { analysis } = live;
  const [companyRow] = await db
    .select({ publicData: schema.companies.publicData })
    .from(schema.companies)
    .where(eq(schema.companies.id, analysis.companyId))
    .limit(1);
  const company: PublicCompany | null = companyRow
    ? parsePublicCompany(companyRow.publicData)
    : null;
  if (!company) return { ok: false, reason: 'FINANCIAL_VIEW_UNAVAILABLE' };
  const ledger = await listAnalysisLedger(db, analysis.id);
  const { accounts, transactions, ids } = ledgerInput(ledger);
  // Classifications are stored by row id; the view names transactions by the pipeline id (input.ts), and so do the
  // screen rows and the stored exclusions (deterministic: hash of account row id + transaction row id).
  const toPipeline = new Map([...ids].map(([p, r]) => [r, p]));
  const classifications: Classification[] = ledger.map((r) => ({
    transactionId: toPipeline.get(r.transaction.id) ?? r.transaction.id,
    category: r.classification.category,
    confidence: r.classification.confidenceBp / 1000,
    origin: r.classification.origin,
    ...(r.classification.ruleId === null ? {} : { ruleId: r.classification.ruleId }),
    reason: r.classification.reason,
    status: r.classification.status,
  }));
  const questions = await questionsOf(db, analysis.id);
  const engineFindings: Finding[] = live.findings;
  const run = {
    classifications,
    questions,
    engineResult: {
      engineVersion: '',
      parametersVersion: '',
      parametersHash: '',
      inputsHash: '',
      findings: engineFindings,
      total: live.total,
    },
  };
  const base = {
    accounts,
    company,
    referenceMonth: analysis.referenceMonth as YearMonth,
    transactions,
  };
  const viewOf = (excluded: readonly string[]) => financialViewOfRun(base, run, excluded);
  const plain = viewOf([]);
  if (!plain.ok) return { ok: false, reason: 'FINANCIAL_VIEW_UNAVAILABLE' };
  const suspects = [plain.value.pj, plain.value.pf]
    .flatMap((h) => h?.duplicates ?? [])
    .filter((d) => d.reason === 'same_charge_within_3_days')
    .slice(0, MAX_SUSPECTS)
    .map(duplicateRemovals);
  const removable = new Set(suspects.flat());
  const variants: Record<string, FinancialView> = { '': plain.value };
  for (const set of exclusionSets(suspects)) {
    if (set.length === 0) continue;
    const v = viewOf(set);
    if (v.ok) variants[variantKey(set)] = v.value;
  }
  const stored = analysis.excludedTransactionIds.filter((id) => removable.has(id));
  const current = variants[variantKey(stored)] ?? variants[''];
  const findings: Record<string, SealFinding> = {};
  for (const row of live.rows)
    findings[row.ruleId] = {
      ruleId: row.ruleId,
      type: row.type,
      title: row.title,
      marginalValue12m: row.marginalValue12mCents,
      range:
        row.rangeMinCents !== null && row.rangeMaxCents !== null
          ? [row.rangeMinCents, row.rangeMaxCents]
          : null,
      href: findingHref(analysis.id, row.id),
    };
  const rows: Record<string, TxRow> = {};
  for (const r of ledger) {
    const t = r.transaction;
    const id = toPipeline.get(t.id) ?? t.id;
    rows[id] = {
      id,
      date: t.date,
      label:
        t.counterpartyDocType === 'CPF'
          ? `Pessoa física · ${t.counterpartyMask ?? ''}`
          : redactDescription(t.description),
      amountCents: Math.abs(t.amountCents),
      origin: r.classification.origin,
    };
  }
  const base64 = `/app/analises/${analysis.id}`;
  return {
    ok: true,
    removable,
    value: {
      title: live.companyName,
      view: current ?? plain.value,
      variants,
      storageKey: `refund:financas:excluidos:${analysis.id}`,
      initialExcluded: stored,
      findings,
      transactions: rows,
      links: { confirm: `${base64}/confirmar`, dashboard: `${base64}/painel` },
    },
  };
}
