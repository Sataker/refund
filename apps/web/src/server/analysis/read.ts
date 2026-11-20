import 'server-only';
import {
  type AnalysisRow,
  type Db,
  type FindingRow,
  findingOf,
  findOwnedAnalysis,
  listFindings,
  schema,
} from '@refund/db';
import { cnaeAnexoRow, type EngineResult, type Finding, type Total } from '@refund/engine';
import { parsePublicCompany } from '@refund/sources';
import { and, eq, lte, or } from 'drizzle-orm';
import { titleCase } from '@/demo/view.ts';
import { type DashboardModel, dashboardModel } from '@/features/findings/model';
import { type BankSource, bankSourceOf, type DataOrigin } from '@/features/live/data-origin';
import { HERO_CNPJ } from '../company/replay-companies.ts';
import { entitlementsWith } from '../entitlements.ts';
import type { Entitlements, PlanId } from '../plans/catalog.ts';
import { type LiveFindingDto, largestRuleId, serializeFinding } from '../plans/serialize.ts';

// What the /app analysis pages read (server components only). The dashboard numbers come from the stored engine result;
// anything with a trace goes through serializeFinding first (ARCHITECTURE §8.3: the next read re-serializes from
// `findings`, so a plan change applies at once).

const ZERO_TOTAL: Total = {
  savings12m: 0 as Total['savings12m'],
  annualRegimeSavings: null,
  byConfidence: {
    confirmed: 0 as Total['savings12m'],
    estimated: 0 as Total['savings12m'],
    depends_on_regulation: 0 as Total['savings12m'],
  },
  recoveryRange: null,
};

export interface LiveAnalysis {
  analysis: AnalysisRow;
  companyName: string;
  plan: PlanId;
  ent: Entitlements;
  rows: FindingRow[];
  /** The engine's findings, full (server-side only: never pass `trace` to the client unserialized). */
  findings: Finding[];
  total: Total;
  largest: string | null;
  dashboard: DashboardModel;
  /** "YYYY-MM-DD" of the run (BRT), the anchor of every `daysLeft`. */
  analysisDate: string;
  /** Where the company card and the statements came from (C2: the banner and the seal). */
  origin: DataOrigin;
  /** The company's Simples annex from its CNAE ("III ou V (pelo Fator R)" when the Fator R decides), or null. */
  anexo: string | null;
}

/** The annex the report names for the projected DAS (bug bash 20/11): the CNAE table's row, never a guess. */
export function anexoLabel(cnae: string | undefined): string | null {
  const row = cnae ? cnaeAnexoRow(cnae) : undefined;
  if (!row || row.baseAnexo === null) return null;
  return row.subjectToFatorR ? 'III ou V (pelo Fator R)' : row.baseAnexo;
}

/**
 * Providers of the connections this run read: through its classifications (the ledger), else, when those rows are
 * gone (a revoked connection drops its transactions), the user's connections in force when the run was created.
 */
/** The bank source of a run (sample, sandbox or none). */
export async function analysisBankSource(db: Db, analysis: AnalysisRow): Promise<BankSource> {
  return bankSourceOf(await bankProviders(db, analysis));
}

async function bankProviders(db: Db, analysis: AnalysisRow): Promise<string[]> {
  const { classifications, transactions, accounts, connections } = schema;
  const used = await db
    .selectDistinct({ provider: connections.provider })
    .from(classifications)
    .innerJoin(transactions, eq(transactions.id, classifications.transactionId))
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .innerJoin(connections, eq(connections.id, accounts.connectionId))
    .where(eq(classifications.analysisId, analysis.id));
  if (used.length > 0) return used.map((r) => r.provider);
  const candidates = await db
    .selectDistinct({ provider: connections.provider })
    .from(connections)
    .where(
      and(
        eq(connections.userId, analysis.userId),
        lte(connections.createdAt, analysis.createdAt),
        or(eq(connections.holder, 'PF'), eq(connections.companyId, analysis.companyId)),
      ),
    );
  return candidates.map((r) => r.provider);
}

const DATE_BRT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

export async function loadLiveAnalysis(
  db: Db,
  userId: string,
  analysisId: string,
): Promise<LiveAnalysis | null> {
  const analysis = await findOwnedAnalysis(db, userId, analysisId);
  if (!analysis) return null;
  const rows = await listFindings(db, analysis.id);
  const findings = rows.map(findingOf);
  const total = analysis.total ?? ZERO_TOTAL;
  const [company] = await db
    .select({ publicData: schema.companies.publicData, source: schema.companies.source })
    .from(schema.companies)
    .where(eq(schema.companies.id, analysis.companyId))
    .limit(1);
  const parsed = company ? parsePublicCompany(company.publicData) : null;
  const { plan, ent } = await entitlementsWith(db, userId);
  const analysisDate = DATE_BRT.format(analysis.completedAt ?? analysis.createdAt);
  return {
    analysis,
    companyName: parsed
      ? titleCase(parsed.displayTradeName ?? parsed.displayLegalName)
      : 'Sua empresa',
    plan,
    ent,
    rows,
    findings,
    total,
    largest: largestRuleId(findings),
    dashboard: dashboardModel({ findings, total }, analysisDate),
    analysisDate,
    origin: {
      companySynthetic: company?.source === 'persona' || company?.source === 'replay',
      companyIsSample: parsed?.cnpj === HERO_CNPJ,
      bank: await analysisBankSource(db, analysis),
    },
    anexo: parsed?.mei.optedIn ? null : anexoLabel(parsed?.primaryCnae.code),
  };
}

/** One finding as it may leave the server for this user's plan. */
export function serializedFinding(live: LiveAnalysis, row: FindingRow): LiveFindingDto {
  const f = findingOf(row);
  return serializeFinding(f, {
    ent: live.ent,
    isLargest: f.ruleId === live.largest,
    id: row.id,
    explanation:
      row.explanation === null
        ? null
        : { text: row.explanation, origin: row.explanationOrigin ?? 'template' },
  });
}

/** An EngineResult for the report, with each locked trace emptied on the server (owner on `summary`). */
export function reportResult(live: LiveAnalysis, full: boolean): EngineResult {
  const a = live.analysis;
  return {
    engineVersion: a.engineVersion ?? '',
    parametersVersion: a.parametersVersion ?? '',
    parametersHash: a.parametersHash ?? '',
    inputsHash: a.inputsHash ?? '',
    total: live.total,
    findings: live.rows.map((row) => {
      const f = findingOf(row);
      if (full) return f;
      const dto = serializedFinding(live, row);
      const { recoveryItems: _all, ...rest } = f;
      return {
        ...rest,
        trace: dto.trace ?? [],
        ...(dto.recoveryItems === undefined ? {} : { recoveryItems: dto.recoveryItems }),
      };
    }),
  };
}

/** Href of a finding's detail in /app. */
export function findingHref(analysisId: string, findingId: string): string {
  return `/app/analises/${analysisId}/achados/${findingId}`;
}

export function ruleHrefs(live: LiveAnalysis): Record<string, string> {
  return Object.fromEntries(live.rows.map((r) => [r.ruleId, findingHref(live.analysis.id, r.id)]));
}
