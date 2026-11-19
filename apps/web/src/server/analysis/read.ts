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
import type { EngineResult, Finding, Total } from '@refund/engine';
import { parsePublicCompany } from '@refund/sources';
import { eq } from 'drizzle-orm';
import { titleCase } from '@/demo/view.ts';
import { type DashboardModel, dashboardModel } from '@/features/findings/model';
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
    .select({ publicData: schema.companies.publicData })
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
