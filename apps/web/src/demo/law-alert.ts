import 'server-only';
import { templateDiffSummary } from '@refund/ai';
import { analyze, PARAMETER_SCENARIOS } from '@refund/engine';
import { article, regulations } from '@refund/law';
import { lawChangeFixture } from '@refund/sources';
import { type LawAlertModel, RULE_NAMES } from '@/features/law/alert-model.ts';
import {
  affectedArticles,
  affectedRules,
  regulationOfUrl,
  simulationDelta,
} from '@/features/law/change.ts';
import { requireSnapshot } from './snapshot.ts';

// /demo "simular publicação" (ARCHITECTURE §2.6 Demo box, §7.2; ADR-013; EXECUTION E16 task 3): the recorded
// monitor.page fixture runs through the same mapping as the webhook (diff → provisions → rules), at build time, with
// no network and no model call. The recalculation uses a labelled scenario of engine/parameters/scenarios/.

/**
 * The publication /demo simulates. `scenarioId` is null until ENGINE-SPEC names the parameter and the value the
 * simulation changes (EXECUTION §9, E16; CLAUDE.md rule 12): without it the page shows the cycle up to the affected
 * rules and recalculates nothing.
 */
export const DEMO_LAW_CHANGE: { fixtureKey: string; scenarioId: string | null } = {
  fixtureKey: 'lc123-2006-2026-10-21',
  scenarioId: null,
};

export async function demoLawAlert(personaId: string): Promise<LawAlertModel | null> {
  const snap = await requireSnapshot(personaId);
  if (!snap) return null;
  const fixture = lawChangeFixture(DEMO_LAW_CHANGE.fixtureKey);
  // Static generation fails loudly rather than render a cycle that is not the fixture's (snapshot.ts rule).
  if (!fixture.ok) throw new Error(`law-change fixture unavailable: ${fixture.error.code}`);
  const page = fixture.value.page;
  const reg = regulationOfUrl(page.url);
  if (!reg || page.diffText === null)
    throw new Error('law-change fixture: unknown page or no diff');

  const articleIds = affectedArticles(reg.id, page.diffText);
  const rules = affectedRules(articleIds);
  const articles = articleIds.flatMap((id) => {
    const a = article(id);
    return a ? [{ id, label: a.label, url: a.url }] : [];
  });
  const yours = new Set(snap.result.findings.map((f) => f.ruleId));
  const lines: LawAlertModel['lines'] = [];
  for (const line of page.diffText.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('-')) lines.push({ kind: 'removed', text: line.slice(1).trim() });
    else if (line.startsWith('+')) lines.push({ kind: 'added', text: line.slice(1).trim() });
  }

  let delta: LawAlertModel['delta'] = null;
  const scenario = PARAMETER_SCENARIOS.find((s) => s.id === DEMO_LAW_CHANGE.scenarioId);
  if (scenario) {
    const after = analyze(snap.facts, { parameters: scenario.id });
    if (!after.ok) throw new Error(`simulation failed: ${after.error.code}`);
    delta = simulationDelta(snap.result, after.value, rules);
  }

  return {
    simulation: true,
    fixtureOrigin: fixture.value.origin,
    fixtureNote:
      fixture.value.origin === 'synthetic'
        ? 'A diferença acima foi montada com o texto oficial (LC 123/2006 antes e depois da LC 238/2026) no formato do monitor; não é uma captura real.'
        : null,
    regulationLabel: reg.short,
    regulationUrl: reg.url,
    summary: templateDiffSummary({
      regulationLabel: reg.short,
      articleLabels: articles.map((a) => a.label),
    }),
    lines,
    articles,
    rules: rules.map((ruleId) => ({
      ruleId,
      name: RULE_NAMES[ruleId] ?? ruleId,
      yours: yours.has(ruleId),
    })),
    delta,
    monitoredCount: new Set(regulations.map((r) => r.url)).size,
    since: snap.facts.analysisDate,
  };
}
