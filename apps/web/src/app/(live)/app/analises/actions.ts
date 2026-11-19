'use server';

import { runLive } from '@/server/action.ts';
import {
  answerQuestionWith,
  confirmProLaboreWith,
  markFindingWith,
  reanalyzeWith,
  setFinanceExclusionsWith,
  startAnalysisWith,
} from '@/server/analysis/actions.ts';
import { loadLiveAnalysis } from '@/server/analysis/read.ts';
import { todayBrt } from '@/server/company/profile.ts';
import { liveFinance } from '@/server/financial-view.ts';
import { type SentReport, sendReportWith, siteOrigin } from '@/server/report/report.ts';
import type { ActionResult } from '@/server/result.ts';

// ARCHITECTURE §4.7 "analysis (live)" and "report (live)". getSession → requireCapability in runLive; rateLimit →
// entitlement/quota → zod inside each core. Results only.

export async function startAnalysis(input: {
  companyCnpj: string;
}): Promise<ActionResult<{ analysisId: string }>> {
  return runLive('startAnalysis', (ctx) =>
    startAnalysisWith(input, { db: ctx.db, userId: ctx.userId, today: todayBrt() }),
  );
}

export async function reanalyze(input: {
  analysisId: string;
}): Promise<ActionResult<{ analysisId: string }>> {
  return runLive('reanalyze', (ctx) =>
    reanalyzeWith(input, { db: ctx.db, userId: ctx.userId, today: todayBrt() }),
  );
}

export async function answerQuestion(input: {
  analysisId: string;
  questionId: string;
  answer: string | number | { beneficiary: string; profession: string } | null;
}): Promise<ActionResult<{ reanalyze: boolean }>> {
  return runLive('answerQuestion', (ctx) =>
    answerQuestionWith(input, { db: ctx.db, userId: ctx.userId, today: todayBrt() }),
  );
}

export async function confirmProLabore(input: {
  analysisId: string;
  monthlyAmountCents: number;
}): Promise<ActionResult<{ reanalyze: boolean }>> {
  return runLive('confirmProLabore', (ctx) =>
    confirmProLaboreWith(input, { db: ctx.db, userId: ctx.userId, today: todayBrt() }),
  );
}

export async function markFinding(input: {
  findingId: string;
  status: 'marked' | 'dismissed' | 'new';
}): Promise<ActionResult<void>> {
  return runLive('markFinding', (ctx) =>
    markFindingWith(input, { db: ctx.db, userId: ctx.userId, today: todayBrt() }),
  );
}

/** Bound per analysis on Screen 8. */
export async function sendReportFor(
  analysisId: string,
  input: {
    accountantEmail: string;
    message: string;
    include: { calculations: boolean; laws: boolean; transactions: boolean };
  },
): Promise<ActionResult<SentReport>> {
  return sendReport({ analysisId, ...input });
}

/** Bound per analysis on Screen 7: the card passes its id and the chosen value (null = "Não sei"). */
export async function answerCard(
  analysisId: string,
  questionId: string,
  answer: string | number | null,
): Promise<ActionResult<{ reanalyze: boolean }>> {
  return answerQuestion({ analysisId, questionId, answer });
}

/** Bound per finding in the detail page: the button passes only the status. */
export async function setFindingMark(
  findingId: string,
  status: 'marked' | 'new',
): Promise<ActionResult<void>> {
  return markFinding({ findingId, status });
}

/** Bound per analysis in the Finanças page: the client passes the whole excluded set. */
export async function saveFinanceExclusions(
  analysisId: string,
  excluded: string[],
): Promise<ActionResult<void>> {
  return runLive('saveFinanceExclusions', (ctx) =>
    setFinanceExclusionsWith(
      { analysisId, excluded },
      {
        db: ctx.db,
        userId: ctx.userId,
        today: todayBrt(),
        removable: async (id) => {
          const live = await loadLiveAnalysis(ctx.db, ctx.userId, id);
          if (!live) return new Set();
          const f = await liveFinance(ctx.db, live);
          return f.ok ? f.removable : new Set();
        },
      },
    ),
  );
}

export async function sendReport(input: {
  analysisId: string;
  accountantEmail?: string;
  message?: string;
  include: { calculations: boolean; laws: boolean; transactions: boolean };
}): Promise<ActionResult<SentReport>> {
  return runLive('sendReport', (ctx) =>
    sendReportWith(input, {
      db: ctx.db,
      userId: ctx.userId,
      secrets: ctx.secrets,
      caps: ctx.caps,
      origin: siteOrigin(ctx.headers),
    }),
  );
}
